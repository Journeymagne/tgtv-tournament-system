import test from 'node:test';
import assert from 'node:assert/strict';
import {URL as NativeURL} from 'react-native-url-polyfill/js/URL';
import {URLSearchParams as NativeParams} from 'react-native-url-polyfill/js/URLSearchParams';

test('native URL implementation parses Companion deep links and normalizes API paths',()=>{
 const link=new NativeURL('ktcompanion://games/701');
 assert.equal(link.protocol,'ktcompanion:');
 assert.equal(link.host,'games');
 assert.equal(link.pathname,'/701');
 assert.equal(new NativeURL('/api/%2e%2e/login','https://ktcompanion.ru').pathname,'/login');
 const params=new NativeParams();params.set('q','Игрок & команда');
 assert.equal(params.size,1);
 assert.equal(new NativeParams(params.toString()).get('q'),'Игрок & команда');
});

test('API transport rejects path escape using the same URL classes as native entry',async()=>{
 const previousURL=globalThis.URL, previousParams=globalThis.URLSearchParams, previousFetch=globalThis.fetch;
 globalThis.URL=NativeURL as unknown as typeof URL;
 globalThis.URLSearchParams=NativeParams as typeof URLSearchParams;
 let requests=0;
 globalThis.fetch=async()=>{requests++;return Response.json({});};
 try{
  const {request,ApiError}=await import('../src/api/client');
  for(const path of ['/api/../login','/api/%2e%2e/login','//outside.invalid/api/me'])
   await assert.rejects(request(path),(e:unknown)=>e instanceof ApiError&&e.code==='configuration');
  assert.equal(requests,0);
 }finally{globalThis.URL=previousURL;globalThis.URLSearchParams=previousParams;globalThis.fetch=previousFetch;}
});
