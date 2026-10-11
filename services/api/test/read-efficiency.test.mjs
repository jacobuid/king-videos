import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import {cachedCatalog,libraryPage,invalidateCatalog,managePage} from '../src/catalog-cache.ts'

test('catalog pagination and concurrent requests reuse one read; invalidation refreshes',async()=>{
 let reads=0,entry=null
 const cache={match:async()=>entry?.clone(),put:async(_key,response)=>{entry=response},delete:async()=>{entry=null;return true}}
 const rows=Array.from({length:125},(_,i)=>({id:String(i),title:'Movie '+i,min_age:i%18,category:'movie'}))
 const db={prepare:()=>({all:async()=>{reads++;await new Promise(resolve=>setTimeout(resolve,5));return {results:rows,meta:{rows_read:125}}}})}
 await Promise.all([cachedCatalog(db,cache,'https://test.invalid'),cachedCatalog(db,cache,'https://test.invalid')])
 for(let offset=0;offset<150;offset+=50)await cachedCatalog(db,cache,'https://test.invalid')
 assert.equal(reads,1)
 await invalidateCatalog(cache,'https://test.invalid');await cachedCatalog(db,cache,'https://test.invalid');assert.equal(reads,2)
})
test('cached catalog remains profile-filtered before pagination',()=>{
 const rows=[{title:'Adult',min_age:16,category:'movie'},{title:'Home',min_age:0,category:'home-videos'},{title:'Kids',min_age:0,category:'movie'}]
 assert.deepEqual(libraryPage(rows,'',5,0,50,0).map(x=>x.title),['Home','Kids'])
 assert.deepEqual(libraryPage(rows,'',40,1,50,0).map(x=>x.title),['Home'])
 assert.deepEqual(libraryPage(rows,'KIDS',5,0,50,0).map(x=>x.title),['Kids'])
})
test('failed catalog loads can retry instead of retaining a rejected promise',async()=>{
 let calls=0;const cache={match:async()=>null,put:async()=>{}}
 const db={prepare:()=>({all:async()=>{if(++calls===1)throw Error('unavailable');return {results:[],meta:{rows_read:0}}}})}
 await assert.rejects(cachedCatalog(db,cache,'https://test.invalid'))
 assert.deepEqual(await cachedCatalog(db,cache,'https://test.invalid'),[])
})
test('indexes eliminate series scans and progress sorting',()=>{
 const db=new DatabaseSync(':memory:')
 try{
 db.exec('CREATE TABLE media(id TEXT PRIMARY KEY,created_at TEXT,series_id TEXT);CREATE TABLE progress(profile_id TEXT,updated_at TEXT);CREATE TABLE favorites(profile_id TEXT,sort_order INTEGER);')
 db.exec(readFileSync(new URL('../migrations/0016_read_efficiency.sql',import.meta.url),'utf8'))
 const plan=sql=>db.prepare('EXPLAIN QUERY PLAN '+sql).all().map(x=>x.detail).join(' ')
 assert.match(plan("SELECT id FROM media WHERE series_id='show' LIMIT 1"),/USING INDEX media_series_id/)
 assert.match(plan("SELECT * FROM progress WHERE profile_id='dad' ORDER BY updated_at DESC"),/USING (?:COVERING )?INDEX progress_profile_updated/)
 assert.doesNotMatch(plan('SELECT * FROM media ORDER BY created_at DESC,id DESC'),/TEMP B-TREE/)
 }finally{db.close()}
})

test('manage filters preserve rating, series search and age range',()=>{
 const rows=[{title:'Episode',series_title:'Bears',rating:'TV-Y',min_age:0},{title:'Movie',series_title:null,rating:'PG',min_age:8},{title:'Other',series_title:null,rating:null,min_age:16}]
 assert.equal(managePage(rows,'bears','','','',50,0).length,1)
 assert.equal(managePage(rows,'','PG','8','15',50,0)[0].title,'Movie')
 assert.equal(managePage(rows,'','missing','','',50,0)[0].title,'Other')
})
