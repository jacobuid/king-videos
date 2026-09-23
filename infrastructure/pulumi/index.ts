import * as pulumi from '@pulumi/pulumi'
import * as cloudflare from '@pulumi/cloudflare'

const config = new pulumi.Config()
const accountId = config.require('cloudflareAccountId')
const database = new cloudflare.D1Database('king-videos', { accountId, name: `king-videos-${pulumi.getStack()}` })
export const databaseId = database.uuid
