import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import {createHmac} from 'node:crypto'
import {authorizeRoku} from '../src/roku.ts'

test('ownership cutover preserves profile IDs, PIN hashes, history, favorites and Roku credentials',async()=>{
  const db=new DatabaseSync(':memory:')
  try{
    db.exec(readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'))
    db.exec(readFileSync(new URL('../migrations/0002_profile_pins.sql',import.meta.url),'utf8'))
    db.exec(readFileSync(new URL('../migrations/0014_roku_devices.sql',import.meta.url),'utf8'))
    const old='user_3JiLSTiHdcPsMrLQYTdxhgrkmyc',owner='206b7c4f-39a4-48d5-8886-62f11fd39250'
    const hash=createHmac('sha256','preserved-app-secret').update('salt:1234').digest('base64url')
    db.prepare('INSERT INTO profiles(id,user_id,name,pin_hash,pin_salt) VALUES(?,?,?,?,?)').run('kid',old,'Kid',hash,'salt')
    db.prepare('INSERT INTO profiles(id,user_id,name) VALUES(?,?,?)').run('other','unrelated','Other')
    db.exec("INSERT INTO media(id,title,category,video_key) VALUES('movie','Movie','Movies','movies/movie.mp4'); INSERT INTO progress(profile_id,media_id,position_seconds) VALUES('kid','movie',123); INSERT INTO favorites(profile_id,media_id) VALUES('kid','movie')")
    const token='kfr_'+'a'.repeat(64),digest=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex')
    db.prepare('INSERT INTO roku_devices(id,user_id,token_hash,created_at,expires_at) VALUES(?,?,?,?,?)').run('tv',old,digest,Date.now(),Date.now()+60000)
    const migration=readFileSync(new URL('../migrations/0018_kingauth_owner.sql',import.meta.url),'utf8')
    db.exec(migration);db.exec(migration)
    assert.deepEqual({...db.prepare('SELECT id,user_id,pin_hash,pin_salt FROM profiles WHERE id=?').get('kid')},{id:'kid',user_id:owner,pin_hash:hash,pin_salt:'salt'})
    assert.equal(db.prepare('SELECT user_id FROM profiles WHERE id=?').get('other').user_id,'unrelated')
    assert.equal(db.prepare('SELECT position_seconds FROM progress WHERE profile_id=?').get('kid').position_seconds,123)
    assert.equal(db.prepare('SELECT media_id FROM favorites WHERE profile_id=?').get('kid').media_id,'movie')
    const DB={prepare(sql){return {bind(...args){return {first:async()=>db.prepare(sql).get(...args)}}}}}
    const auth=await authorizeRoku(new Request('https://api.example/api/profiles',{headers:{Authorization:'Bearer '+token}}),{DB,APP_SIGNING_SECRET:'preserved-app-secret'})
    assert.equal(auth.userId,owner)
  }finally{db.close()}
})
