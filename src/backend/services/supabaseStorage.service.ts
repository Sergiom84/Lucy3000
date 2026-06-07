/**
 * Supabase Storage operations via REST API (no SDK needed).
 * Bucket: client-assets (private, access only via service role key).
 * Storage key pattern: {tenantId}/{clientId}/{uuid}.{ext}
 */

const BUCKET = 'client-assets'

const getSupabaseUrl = () => {
  const url = process.env.SUPABASE_URL
  if (!url) throw new Error('SUPABASE_URL is not configured')
  return url.replace(/\/$/, '')
}

const getServiceKey = () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  return key
}

const authHeaders = () => ({
  Authorization: `Bearer ${getServiceKey()}`,
  apikey: getServiceKey()
})

/** Ensure the bucket exists. Idempotent — ignores 409. */
export const ensureBucket = async (): Promise<void> => {
  const res = await fetch(`${getSupabaseUrl()}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false })
  })
  if (!res.ok && res.status !== 409) {
    const body = await res.text()
    throw new Error(`Failed to ensure bucket: ${res.status} ${body}`)
  }
}

/** Upload a file buffer to storage. Returns the storage key. */
export const uploadFile = async (
  key: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> => {
  const res = await fetch(`${getSupabaseUrl()}/storage/v1/object/${BUCKET}/${key}`, {
    method: 'POST',
    headers: {
      ...authHeaders(),
      'Content-Type': mimeType,
      'x-upsert': 'false'
    },
    body: new Uint8Array(buffer)
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Upload failed: ${res.status} ${body}`)
  }
  return key
}

/** Generate a signed URL valid for 1 hour. */
export const getSignedUrl = async (key: string): Promise<string> => {
  const res = await fetch(
    `${getSupabaseUrl()}/storage/v1/object/sign/${BUCKET}/${key}`,
    {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 3600 })
    }
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Signed URL failed: ${res.status} ${body}`)
  }
  const data = await res.json() as { signedURL: string }
  return `${getSupabaseUrl()}${data.signedURL}`
}

/** Generate signed URLs for multiple keys in one request. */
export const getSignedUrls = async (
  keys: string[]
): Promise<Map<string, string>> => {
  if (keys.length === 0) return new Map()

  const res = await fetch(
    `${getSupabaseUrl()}/storage/v1/object/sign/${BUCKET}`,
    {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: keys, expiresIn: 3600 })
    }
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Batch signed URLs failed: ${res.status} ${body}`)
  }
  const items = await res.json() as Array<{ path: string; signedURL: string; error: string | null }>
  const map = new Map<string, string>()
  const base = getSupabaseUrl()
  for (const item of items) {
    if (item.signedURL && !item.error) {
      map.set(item.path, `${base}${item.signedURL}`)
    }
  }
  return map
}

/** Delete one or many storage keys. */
export const deleteFiles = async (keys: string[]): Promise<void> => {
  if (keys.length === 0) return
  const res = await fetch(`${getSupabaseUrl()}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: keys })
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Delete failed: ${res.status} ${body}`)
  }
}
