import {merchantDomains} from './merchants';
// Only known merchant hosts may be fetched. Never bypass access challenges.
export const allowedHosts=merchantDomains;
export function safeMerchantUrl(raw:string){const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port||!allowedHosts.some(h=>u.hostname===h||u.hostname===`www.${h}`))throw new Error('Yalnız dəstəklənən mağazanın HTTPS ünvanını daxil edin.');return u;}
async function readPage(url:URL){const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{'User-Agent':'QepikBot/1.0 (price comparison; manual request)','Accept':'text/html'}});if(response.status>=300&&response.status<400){const location=response.headers.get('location');if(!location)throw new Error('Yönləndirmə ünvanı yoxdur.');const next=safeMerchantUrl(new URL(location,url).href);const r=await fetch(next,{redirect:'manual',signal:AbortSignal.timeout(12000)});return limitedText(r);}return limitedText(response);}
async function limitedText(r:Response){if(!r.ok)throw new Error(`Mağaza sorğunu qəbul etmədi (HTTP ${r.status}).`);if(!r.headers.get('content-type')?.includes('text/html'))throw new Error('Mənbə HTML səhifəsi deyil.');const reader=r.body?.getReader();if(!reader)throw new Error('Səhifə boşdur.');const chunks:Uint8Array[]=[];let bytes=0;while(true){const v=await reader.read();if(v.done)break;bytes+=v.value.length;if(bytes>3000000){await reader.cancel();throw new Error('Səhifə 3 MB limitini keçir.');}chunks.push(v.value);}const all=new Uint8Array(bytes);let at=0;for(const c of chunks){all.set(c,at);at+=c.length;}return new TextDecoder().decode(all);}
export function extractProduct(html:string){const all:any[]=[];const walk=(o:any)=>{if(!o||typeof o!=='object')return;if(Array.isArray(o)){o.forEach(walk);return;}if([o['@type']].flat().includes('Product'))all.push(o);if(o['@graph'])walk(o['@graph']);if(o.mainEntity)walk(o.mainEntity);};for(const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{walk(JSON.parse(m[1]));}catch{}}
 const candidates=all.map(p=>{const o=Array.isArray(p.offers)?p.offers[0]:p.offers;return{p,o};}).filter(v=>v.o?.price!==undefined&&v.o?.priceCurrency==='AZN');
 if(candidates.length!==1)throw new Error(candidates.length?'Bir neçə məhsul tapıldı. Dəqiq məhsul səhifəsindən istifadə edin.':'AZN valyutalı tək məhsul qiyməti oxunmadı. JS/anti-bot səhifəsi ola bilər; manual idxaldan istifadə edin.');
 const {p,o}=candidates[0];const price=Number(String(o.price).replace(',','.'));if(!Number.isFinite(price)||price<=0)throw new Error('Qiymət formatı düzgün deyil.');
 return{name:String(p.name||''),sku:String(p.sku||p.mpn||p.gtin13||''),price,currency:'AZN',stock:String(o.availability||'').endsWith('InStock'),stockKnown:!!o.availability,checkedAt:new Date().toISOString()};}
export function extractIrshad(html:string){
 const sections=Array.from(html.matchAll(/<section\b([^>]*\bclass=["'][^"']*\bproduct-view\b[^"']*["'][^>]*)>/gi));
 const active=sections.filter(m=>!/(?:\s|["'])d-none(?:\s|["'])/.test(m[1]));
 if(active.length!==1)throw new Error('Aktiv məhsul variantı dəqiq müəyyənləşmədi.');
 const start=active[0].index!,next=sections.find(m=>m.index!>start);const section=html.slice(start,next?.index||html.length);
 const clean=(s:string)=>s.replace(/<[^>]*>/g,' ').replace(/&quot;/g,'"').replace(/&#039;/g,"'").replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
 const name=clean(section.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'');
 const priceText=clean(section.match(/<p[^>]*class=["'][^"']*\bnew-price\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1]||'');
 const price=Number(priceText.replace(/\s/g,'').replace(/AZN|₼/gi,'').replace(',','.'));
 if(!name||!price||!Number.isFinite(price)||!/(AZN|₼)/i.test(priceText))throw new Error('Aktiv variantın AZN qiyməti oxunmadı.');
 const sku=section.match(/data-product-code=["']([^"']+)["']/)?.[1]||active[0][1].match(/id=["']productSection(\d+)/)?.[1]||'';
 const labels=section.slice(0,3500);
 const stock=/Stokda\s+var/i.test(clean(labels));return{name,sku,price,currency:'AZN',stock,stockKnown:stock||/stokda yoxdur|mövcud deyil/i.test(clean(labels)),checkedAt:new Date().toISOString()};
}
export async function scanProduct(raw:string){const url=safeMerchantUrl(raw);const robots=await fetch(new URL('/robots.txt',url),{redirect:'manual',signal:AbortSignal.timeout(5000)});if(robots.ok){const txt=await robots.text();let applies=false;for(const line of txt.split('\n')){const clean=line.split('#')[0].trim();if(/^user-agent:/i.test(clean))applies=/^(\*|QepikBot)$/i.test(clean.split(':').slice(1).join(':').trim());if(applies&&/^disallow:/i.test(clean)){const path=clean.split(':').slice(1).join(':').trim();if(path&&(path==='/'||url.pathname.startsWith(path.replace(/\*.*$/,''))))throw new Error('Mənbə bu sorğunu avtomatik oxumağa açmır. Manual idxal istifadə edin.');}}}else if(robots.status!==404)throw new Error('Mənbənin giriş qaydası yoxlanmadı. Manual idxal istifadə edin.');const html=await readPage(url);return{...(url.hostname.replace(/^www\./,'')==='irshad.az'?extractIrshad(html):extractProduct(html)),url:url.href};}

