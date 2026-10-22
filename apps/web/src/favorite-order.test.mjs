import test from 'node:test'
import assert from 'node:assert/strict'
import {reorderVisibleFavorites} from './favorite-order.mjs'

test('visible moves preserve unavailable favorites and series identities',()=>{
 assert.deepEqual(reorderVisibleFavorites(['hidden','movie','series:show','removed'],['series:show','movie']),['hidden','series:show','movie','removed'])
 assert.deepEqual(reorderVisibleFavorites(['a','b','c'],['c','a','b']),['c','a','b'])
})
test('successive moves use the latest order and invalid moves do not discard favorites',()=>{
 const first=reorderVisibleFavorites(['a','hidden','b','c'],['b','a','c'])
 assert.deepEqual(reorderVisibleFavorites(first,['b','c','a']),['b','hidden','c','a'])
 assert.deepEqual(reorderVisibleFavorites(first,['a','a']),first)
 assert.deepEqual(reorderVisibleFavorites(first,['unknown']),first)
})
