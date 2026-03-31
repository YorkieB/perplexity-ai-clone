import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

function getHttpStatus(err: unknown): number | undefined {
  if (err === null || typeof err !== 'object') {
    return undefined
  }
  return (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
}

/**
 * DigitalOcean Spaces (S3-compatible) client for behaviour JSON / JSONL.
 */
function normalizeBucketEnv(raw: string | undefined): { bucket: string; ignoredSuffix: string | null } {
  const s = (raw ?? '').trim()
  if (!s) {
    return { bucket: '', ignoredSuffix: null }
  }
  const i = s.indexOf('/')
  if (i <= 0) {
    return { bucket: s, ignoredSuffix: null }
  }
  // S3 bucket names cannot contain '/'. Common mistake: BUCKET=space-name/prefix — use bucket only; keys already include paths.
  const bucket = s.slice(0, i)
  const ignoredSuffix = s.slice(i + 1)
  if (ignoredSuffix) {
    console.warn(
      `[SpacesClient] DO_SPACES_BUCKET contained '/' — using bucket "${bucket}" only. Put folder prefixes in object keys (e.g. behaviour/…), not in the bucket name.`,
    )
  }
  return { bucket, ignoredSuffix }
}

export class SpacesClient {
  private client: S3Client | null
  private bucket: string | null
  private enabled: boolean

  constructor() {
    const endpoint = process.env.DO_SPACES_ENDPOINT
    const { bucket: bucketRaw } = normalizeBucketEnv(process.env.DO_SPACES_BUCKET)
    const key = process.env.DO_SPACES_KEY
    const secret = process.env.DO_SPACES_SECRET
    const region = process.env.DO_SPACES_REGION || 'nyc3'

    if (!endpoint || !bucketRaw || !key || !secret) {
      console.warn('[SpacesClient] env vars not set — logging disabled')
      this.client = null
      this.bucket = null
      this.enabled = false
      return
    }

    this.client = new S3Client({
      forcePathStyle: true,
      region,
      endpoint,
      credentials: { accessKeyId: key, secretAccessKey: secret },
    })
    this.bucket = bucketRaw
    this.enabled = true
  }

  isEnabled(): boolean {
    return this.enabled
  }

  async upload(key: string, data: string): Promise<void> {
    if (!this.enabled || !this.client || !this.bucket) {
      return
    }
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: data,
          ContentType: 'application/json',
        }),
      )
    } catch (err) {
      console.warn('[SpacesClient] upload error', err)
    }
  }

  /**
   * Lists object keys under a prefix (for behaviour JSONL / analysis).
   * Returns [] when disabled or on error.
   */
  async listObjectKeys(prefix: string): Promise<string[]> {
    if (!this.enabled || !this.client || !this.bucket) {
      return []
    }
    try {
      const keys: string[] = []
      let continuationToken: string | undefined
      do {
        const res = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        )
        for (const obj of res.Contents ?? []) {
          if (obj.Key) {
            keys.push(obj.Key)
          }
        }
        continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
      } while (continuationToken)
      return keys
    } catch (err) {
      console.warn('[SpacesClient] listObjects error', err)
      return []
    }
  }

  /**
   * Reads an object body as UTF-8 text. Returns null when disabled, missing, or on error.
   */
  async getObjectString(key: string): Promise<string | null> {
    if (!this.enabled || !this.client || !this.bucket) {
      return null
    }
    try {
      const obj = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      )
      return (await obj.Body?.transformToString?.()) ?? null
    } catch (err: unknown) {
      const status = getHttpStatus(err)
      const name =
        err !== null && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : ''
      const missing = status === 404 || name === 'NoSuchKey'
      if (!missing) {
        console.warn('[SpacesClient] getObject error', err)
      }
      return null
    }
  }

  async append(key: string, line: string): Promise<void> {
    if (!this.enabled || !this.client || !this.bucket) {
      return
    }

    try {
      let existing = ''
      try {
        const obj = await this.client.send(
          new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
          }),
        )
        existing = (await obj.Body?.transformToString?.()) ?? ''
      } catch (err: unknown) {
        const status = getHttpStatus(err)
        const name = err !== null && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : ''
        const missing = status === 404 || name === 'NoSuchKey'
        if (!missing) {
          console.warn('[SpacesClient] append get error', err)
          return
        }
      }

      const body = existing ? `${existing.trimEnd()}\n${line}` : line

      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: 'application/json',
        }),
      )
    } catch (err) {
      console.warn('[SpacesClient] append put error', err)
    }
  }
}
