import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {DatabaseSync} from 'node:sqlite'

test('retro migration defaults existing and new titles to false and keeps flagged titles in the normal library',()=>{
  const db=new DatabaseSync(':memory:')
  try{
    db.exec("CREATE TABLE media(id TEXT PRIMARY KEY,title TEXT); INSERT INTO media VALUES('existing','Existing movie')")
    db.exec(readFileSync(new URL('../migrations/0015_retro_media.sql',import.meta.url),'utf8'))
    assert.equal(db.prepare("SELECT retro FROM media WHERE id='existing'").get().retro,0)
    db.prepare('INSERT INTO media(id,title) VALUES(?,?)').run('new','New movie')
    assert.equal(db.prepare("SELECT retro FROM media WHERE id='new'").get().retro,0)
    db.prepare('UPDATE media SET retro=1 WHERE id=?').run('existing')
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM media').get().count,2)
    assert.deepEqual(db.prepare('SELECT id FROM media WHERE retro=1').all().map(row=>row.id),['existing'])
    assert.throws(()=>db.prepare('UPDATE media SET retro=2 WHERE id=?').run('new'))
    assert.throws(()=>db.prepare('UPDATE media SET retro=NULL WHERE id=?').run('new'))
  }finally{db.close()}
})
