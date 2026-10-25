import test from 'node:test';import assert from 'node:assert/strict';import {videoQuality} from './video-quality.mjs';
test('quality labels account for widescreen crops and standard definition',()=>{
 for(const [w,h,label]of [[1920,800,'1080p'],[1280,536,'720p'],[718,480,'480p'],[640,360,'360p'],[426,240,'240p'],[3840,1600,'2160p'],[1080,1920,'1080p']])assert.equal(videoQuality(w,h),label)
 assert.equal(videoQuality(undefined,undefined),null)
})
