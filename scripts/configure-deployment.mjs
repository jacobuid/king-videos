import { readFileSync, writeFileSync } from 'node:fs'

const path = 'services/api/wrangler.jsonc'
const config = JSON.parse(readFileSync(path, 'utf8'))
config.d1_databases[0].database_id = process.env.D1_DATABASE_ID
config.vars.B2_ENDPOINT = process.env.B2_ENDPOINT
writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`)

const secrets = {
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  CLERK_PUBLISHABLE_KEY: process.env.CLERK_PUBLISHABLE_KEY,
  B2_KEY_ID: process.env.B2_KEY_ID,
  B2_APPLICATION_KEY: process.env.B2_APPLICATION_KEY,
}
for (const [name, value] of Object.entries(secrets)) if (!value) throw new Error(`${name} is missing`)
writeFileSync('services/api/.deployment-secrets.json', JSON.stringify(secrets))
