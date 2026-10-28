import fs from 'node:fs';
import {politeText} from './polite-http.mjs';
import {tapShopProduct} from '../lib/tap-marketplace.ts';
function state(html){const m=html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);if(!m)throw new Error('Tap.az səhifə strukturu dəyişib');return JSON.parse(m[1]).props.pageProps.apolloState;}
const listing=await politeText('https://tap.az/elanlar/elektronika',{ttlMs:900000});const ads=Object.values(state(listing.body)).filter(a=>a?.__typename==='Ad'&&a.features?.adFeatures?.hasLabel===true&&a.features.adFeatures.label==='RETAILER'&&a.shop?.__ref&&a.status==='APPROVED');
const products=new Map(),offers=new Map(),stores=new Map(),failures=[];
for(const ad of ads){try{const r=await politeText('https://tap.az'+ad.path,{ttlMs:900000});const parsed=tapShopProduct(state(r.body),r.checkedAt);for(const p of parsed.products)products.set(p.id,p);for(const o of parsed.offers)offers.set(o.id,o);for(const s of parsed.stores)stores.set(s.id,s);}catch(e){failures.push({path:ad.path,error:e.message});}}
const data={checkedAt:new Date().toISOString(),source:'https://tap.az/elanlar/elektronika',coverage:'Current electronics listing; verified retailer details only, not all Tap.az inventory',candidateCount:ads.length,products:[...products.values()],offers:[...offers.values()],stores:[...stores.values()],failures};fs.writeFileSync('lib/store-catalogs/tap-shops.json',JSON.stringify(data));console.log(JSON.stringify({candidates:ads.length,products:products.size,stores:stores.size,failures}));
