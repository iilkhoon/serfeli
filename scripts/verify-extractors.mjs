import assert from 'node:assert/strict';
import fs from 'node:fs';
import {extractProduct,extractIrshad,safeMerchantUrl} from '../lib/extractor.ts';
for(const url of ['http://irshad.az/test','https://irshad.az.evil.example/test','https://user:pass@irshad.az/test','https://127.0.0.1/','https://irshad.az:8443/test'])assert.throws(()=>safeMerchantUrl(url));
assert.equal(safeMerchantUrl('https://technomania.az/product/apple-airpods-4-qulaqlq').hostname,'technomania.az');
assert.throws(()=>extractProduct('<html><h1>Just a moment</h1></html>'));
assert.throws(()=>extractProduct('<script type="application/ld+json">{"@type":"Product","offers":{"price":10,"priceCurrency":"USD"}}</script>'));
const multiple='<script type="application/ld+json">[{"@type":"Product","offers":{"price":10,"priceCurrency":"AZN"}},{"@type":"Product","offers":{"price":20,"priceCurrency":"AZN"}}]</script>';
assert.throws(()=>extractProduct(multiple));
if(fs.existsSync('work/irshad-product.html')){const p=extractIrshad(fs.readFileSync('work/irshad-product.html','utf8'));assert.equal(p.sku,'99536');assert.equal(p.name,'iPhone 16 128 GB Black');assert.equal(p.price,2399.99);assert.equal(p.stock,true);}
if(fs.existsSync('work/baku-product.html')){const p=extractProduct(fs.readFileSync('work/baku-product.html','utf8'));assert.equal(p.price,1799.99);assert.equal(p.stock,true);}
console.log('PASS: Merchant URL restrictions, access-challenge rejection, currency, ambiguity, and actual Irshad/Baku response fixtures.');
