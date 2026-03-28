import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

function isNotFoundError(err: unknown): boolean {
  if (err === null || typeof err !== 'object') {
    return false
  }
  const o = err as { name?: string; $metadata?: { httpStatusCode?: number } }
  return o.name === 'NoSuchKey' || o.$metadata?.httpStatusCode === 404
}

/**
 * Thin S3 client for DigitalOcean Spaces (or any S3-compatible API).
 * Failures are logged and swallowed — never throws to callers.
 */
export class SpacesClient {
  private readonly client: S3Client | null
  private readonly bucket: string
  readonly enabled: boolean

  constructor() {
    const endpoint = process.env.DO_SPACES_ENDPOINT?.trim()
    const bucket = process.env.DO_SPACES_BUCKET?.trim()
    const key = process.env.DO_SPACES_KEY?.trim()
    const secret = process.env.DO_SPACES_SECRET?.trim()
    const region = process.env.DO_SPACES_REGION?.trim() || 'nyc3'

    if (!endpoint || !bucket || !key || !secret) {
      console.warn('SpacesClient: env vars not set — logging disabled')
      this.client = null
      this.bucket = ''
      this.enabled = false
      return
    }

    this.bucket = bucket
    this.enabled = true
    this.client = new S3Client({
      region,
      endpoint,
      credentials: {
        accessKeyId: key,
        secretAccessKey: secret,
      },
      forcePathStyle: false,
    })
  }

  isEnabled(): boolean {
    return this.enabled
  }

  async upload(key: string, data: string): Promise<void> {
    if (!this.enabled || this.client === null) {
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
    } catch (e) {
      console.warn('SpacesClient: upload failed', e instanceof Error ? e.message : e)
    }
  }

  async append(key: string, line: string): Promise<void> {
    if (!this.enabled || this.client === null) {
      return
    }
    let existing = ''
    try {
      const out = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      )
      if (out.Body) {
        existing = await out.Body.transformToString()
      }
    } catch (e) {
      if (!isNotFoundError(e)) {
        console.warn('SpacesClient: append read failed', e instanceof Error ? e.message : e)
        return
      }
    }
    const next = existing.length === 0 ? line : `${existing}\n${line}`
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: next,
          ContentType: 'application/json',
        }),
      )
    } catch (e) {
      console.warn('SpacesClient: append write failed', e instanceof Error ? e.message : e)
    }
  }
}
