/**
 * DigitalOcean Spaces (S3-compatible) client for document storage.
 * Used by the RAG pipeline to store and retrieve original files.
 */
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} = require('@aws-sdk/client-s3')
const { getSignedUrl: awsGetSignedUrl } = require('@aws-sdk/s3-request-presigner')

let _client = null
let _bucket = null

function getConfig() {
  const endpoint = (process.env.SPACES_ENDPOINT || '').trim()
  const bucket = (process.env.SPACES_BUCKET || '').trim()
  const accessKey = (process.env.SPACES_ACCESS_KEY || '').trim()
  const secretKey = (process.env.SPACES_SECRET_KEY || '').trim()
  const region = (process.env.SPACES_REGION || 'nyc3').trim()
  return { endpoint, bucket, accessKey, secretKey, region }
}

function isConfigured() {
  const { endpoint, bucket, accessKey, secretKey } = getConfig()
  return Boolean(endpoint && bucket && accessKey && secretKey)
}

function resetClient() {
  _client = null
  _bucket = null
}

function getClient() {
  if (_client) return { client: _client, bucket: _bucket }
  const { endpoint, bucket, accessKey, secretKey, region } = getConfig()
  if (!endpoint || !bucket || !accessKey || !secretKey) {
    throw new Error('DigitalOcean Spaces not configured — set SPACES_ENDPOINT, SPACES_BUCKET, SPACES_ACCESS_KEY, SPACES_SECRET_KEY in .env')
  }
  _client = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    forcePathStyle: false,
  })
  _bucket = bucket
  return { client: _client, bucket: _bucket }
}

async function uploadFile(key, buffer, contentType) {
  const { client, bucket } = getClient()
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ACL: 'private',
  }))
  return key
}

async function downloadFile(key) {
  const { client, bucket } = getClient()
  const resp = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  const chunks = []
  for await (const chunk of resp.Body) chunks.push(chunk)
  return {
    buffer: Buffer.concat(chunks),
    contentType: resp.ContentType || 'application/octet-stream',
  }
}

async function deleteFile(key) {
  const { client, bucket } = getClient()
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}

async function listFiles(prefix) {
  const { client, bucket } = getClient()
  const resp = await client.send(new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: prefix || '',
    MaxKeys: 1000,
  }))
  return (resp.Contents || []).map(obj => ({
    key: obj.Key,
    size: obj.Size,
    lastModified: obj.LastModified,
  }))
}

async function getSignedDownloadUrl(key, expiresIn) {
  const { client, bucket } = getClient()
  const command = new GetObjectCommand({ Bucket: bucket, Key: key })
  return awsGetSignedUrl(client, command, { expiresIn: expiresIn || 3600 })
}

module.exports = {
  isConfigured,
  resetClient,
  uploadFile,
  downloadFile,
  deleteFile,
  listFiles,
  getSignedDownloadUrl,
}
