import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/server/index.mjs';
test('financial records require an authenticated session',async()=>{
 const response=await handler(new Request('https://glowlife.test/api/finance'));
 assert.equal(response.status,401);assert.equal(response.headers.get('cache-control'),'no-store');
});
test('financial images are private',async()=>{
 const response=await handler(new Request('https://glowlife.test/api/finance/pockets/any/image'));
 assert.equal(response.status,401);
});
test('cross-origin writes are rejected before processing their contents',async()=>{
 const response=await handler(new Request('https://glowlife.test/api/finance/pockets',{method:'POST',headers:{origin:'https://another.test'},body:'{}'}));assert.equal(response.status,403);
});
test('a password session requires a verified Identity cookie',async()=>{
 const response=await handler(new Request('https://glowlife.test/api/auth/session',{method:'POST',headers:{origin:'https://glowlife.test'},body:'{}'}));assert.equal(response.status,401);
});
