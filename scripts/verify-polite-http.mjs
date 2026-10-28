import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {politeText} from './polite-http.mjs';
const root=await fs.mkdtemp('work/http-test-');let calls=0;
const options={cacheDir:root,intervalMs:0,ttlMs:0,fetchImpl:async(url,init)=>{calls++;if(calls===1)return new Response('ok',{headers:{etag:'"v1"'}});assert.equal(init.headers['If-None-Match'],'"v1"');return new Response(null,{status:304});}};
await politeText('https://test.example/etag',options);assert.equal((await politeText('https://test.example/etag',options)).body,'ok');assert.equal(calls,2);
let blocked=0;await assert.rejects(()=>politeText('https://test.example/blocked',{cacheDir:root,intervalMs:0,fetchImpl:async()=>{blocked++;return new Response('blocked',{status:403});}}),/403/);assert.equal(blocked,1);
let retries=0;const r=await politeText('https://test.example/rate',{cacheDir:root,intervalMs:0,fetchImpl:async()=>++retries===1?new Response('',{status:429,headers:{'Retry-After':'0'}}):new Response('done')});assert.equal(retries,2);assert.equal(r.body,'done');
await assert.rejects(()=>politeText('https://test.example/redirect',{cacheDir:root,intervalMs:0,fetchImpl:async()=>new Response(null,{status:302,headers:{location:'https://other.example/'}})}),/yönləndirmə/);
console.log('PASS: Conditional ETag/304 caching, 403 stop without retry, Retry-After on 429, cross-domain redirect rejection.');
