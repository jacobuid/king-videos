// Read-only inventory. Run with node --env-file=.env; never print credentials.
const email='wakeyjakey@gmail.com'
const clerk=await fetch(`https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,{
  headers:{Authorization:`Bearer ${process.env.CLERK_SECRET_KEY}`},
})
if(!clerk.ok)throw Error(`Clerk account lookup failed (${clerk.status})`)
const users=await clerk.json()
console.log(JSON.stringify({clerk:users.map(user=>({id:user.id,emails:user.email_addresses.map(item=>({email:item.email_address,verification:item.verification?.status}))}))}))
const account=process.env.CLOUDFLARE_ACCOUNT_ID
const headers={Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'}
const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database`,{headers})
const databases=await response.json()
if(!databases.success)throw Error('D1 inventory failed')
const database=databases.result.find(item=>item.name===(process.env.D1_DATABASE||'king-videos-prod'))
if(!database)throw Error('King Videos database not found')
const query=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database.uuid}/query`,{
  method:'POST',headers,body:JSON.stringify({sql:'SELECT user_id,COUNT(*) AS profile_count FROM profiles GROUP BY user_id; SELECT user_id,COUNT(*) AS device_count FROM roku_devices GROUP BY user_id;'}),
})
const result=await query.json()
if(!result.success)throw Error('D1 ownership query failed')
console.log(JSON.stringify({databaseId:database.uuid,ownership:result.result.map(item=>item.results)}))
