import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {bulkMediaUpdates} from '../src/bulk-media.ts'

function fixture(){const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE media(id TEXT,category TEXT,title TEXT,description TEXT,video_key TEXT,rating TEXT,min_age INTEGER,genres TEXT,blocked INTEGER); INSERT INTO media VALUES('movie','movie','Original title','Original description','original.mp4','PG',8,'[\"Adventure\"]',1),('other','movie','Other','Other description','other.mp4','R',21,'[]',0)");return db}
function apply(db,settings){const {assignments,params}=bulkMediaUpdates(settings);db.prepare('UPDATE media SET '+assignments.join(',')+' WHERE id=?').run(...params,'movie');return db.prepare('SELECT * FROM media WHERE id=?').get('movie')}
test('partial bulk edit preserves all other settings and special metadata',()=>{const db=fixture(),before=db.prepare('SELECT * FROM media WHERE id=?').get('movie'),row=apply(db,{blocked:false});assert.deepEqual({...row,blocked:1},{...before});assert.equal(row.blocked,0);assert.equal(db.prepare("SELECT min_age FROM media WHERE id='other'").get().min_age,21);db.close()})
test('bulk rating and age edits enforce movie access rules',()=>{const db=fixture();assert.equal(apply(db,{rating:'PG-13',minAge:8}).min_age,16);assert.equal(apply(db,{rating:'R'}).min_age,21);assert.equal(apply(db,{minAge:0}).min_age,21);db.close()})
test('bulk genres replace or clear only genres',()=>{const db=fixture();assert.equal(apply(db,{genres:['Drama','Drama']}).genres,'["Drama"]');const row=apply(db,{genres:[]});assert.equal(row.genres,'[]');assert.equal(row.rating,'PG');assert.equal(row.min_age,8);db.close()})
test('unrated explicitly clears rating and leaves unspecified age intact',()=>{const db=fixture();const row=apply(db,{rating:null});assert.equal(row.rating,null);assert.equal(row.min_age,8);db.close()})
test('bulk API rejects forbidden fields and invalid settings',()=>{for(const settings of [{title:'New name'},{description:'New description'},{video_key:'replacement.mp4'},{genres:['']},{blocked:'false'},{minAge:22},{minAge:'8'},{}])assert.throws(()=>bulkMediaUpdates(settings))})
