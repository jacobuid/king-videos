const secret=process.env.CLERK_SECRET_KEY
if(!secret)throw new Error('CLERK_SECRET_KEY is required')
const response=await fetch('https://api.clerk.com/v1/beta_features/instance_settings',{method:'PATCH',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:JSON.stringify({restricted_to_allowlist:true})})
const result=await response.json()
if(!response.ok)throw new Error(result.errors?.map(error=>error.long_message||error.message).join('; ')||`Clerk request failed (${response.status})`)
console.log(JSON.stringify({restrictedToAllowlist:result.restricted_to_allowlist,testMode:result.test_mode}))
