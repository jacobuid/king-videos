const keyId = process.env.B2_BOOTSTRAP_KEY_ID
const applicationKey = process.env.B2_BOOTSTRAP_APPLICATION_KEY
const bucketName = process.env.B2_BUCKET || 'king-videos'
const origins = (process.env.WEB_ORIGINS || process.env.WEB_ORIGIN || 'https://jacobuid.github.io,http://localhost:5173').split(',').map(value => value.trim()).filter(Boolean)
if (!keyId || !applicationKey) throw new Error('Backblaze bootstrap credentials are missing')

const basic = Buffer.from(`${keyId}:${applicationKey}`).toString('base64')
const authResponse = await fetch('https://api.backblazeb2.com/b2api/v4/b2_authorize_account', { headers: { Authorization: `Basic ${basic}` } })
if (!authResponse.ok) throw new Error(`Backblaze authorization failed (${authResponse.status})`)
const auth = await authResponse.json()
const storage = auth.apiInfo.storageApi
async function api(operation, body) {
  const response = await fetch(`${storage.apiUrl}/b2api/v4/${operation}`, { method: 'POST', headers: { Authorization: auth.authorizationToken, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) throw new Error(`${operation} failed (${response.status}): ${await response.text()}`)
  return response.json()
}

const listed = await api('b2_list_buckets', { accountId: auth.accountId, bucketName })
const bucket = listed.buckets?.find(item => item.bucketName === bucketName)
if (!bucket) throw new Error(`Backblaze bucket ${bucketName} was not found`)
const corsRules = [{ corsRuleName: 'kingVideosWebPlayback', allowedOrigins: origins, allowedHeaders: ['range'], allowedOperations: ['b2_download_file_by_id', 'b2_download_file_by_name', 's3_get', 's3_head'], exposeHeaders: ['content-length', 'content-range', 'content-type'], maxAgeSeconds: 3600 }]
const updated = await api('b2_update_bucket', { accountId: auth.accountId, bucketId: bucket.bucketId, corsRules, ifRevisionIs: bucket.revision })
const rule = updated.corsRules?.find(item => item.corsRuleName === 'kingVideosWebPlayback')
if (!rule || !origins.every(origin => rule.allowedOrigins.includes(origin)) || !['s3_get', 's3_head'].every(operation => rule.allowedOperations.includes(operation))) throw new Error('Backblaze CORS verification failed')
console.log(`Configured Backblaze browser playback CORS for ${origins.join(', ')}`)
