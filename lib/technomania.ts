export const TECHNOMANIA_FEED='https://technomania.az/api/catalog/feed?format=json';
function categoryOf(name:string){const n=name.toLocaleLowerCase('az');if(/keys|qoruyucu|adapter|şarj|kabel|powerbank|batareya|flaş|klaviatura|siçan|mikrofon|gimbal/.test(n))return 'aksesuar';if(/iphone|galaxy|smartfon|redmi|poco|honor/.test(n))return 'telefon';if(/noutbuk|macbook|ultrabuk/.test(n))return 'noutbuk';if(/planşet|ipad/.test(n))return 'planset';if(/watch|saat|qolbaq/.test(n))return 'saat';if(/playstation|qeympad|coystik|konsol/.test(n))return 'oyun';if(/qulaql|airpods|dinamik/.test(n))return 'audio';if(/kamera|foto/.test(n))return 'foto';if(/saç|dyson airstrait|stayler|fen/.test(n))return 'gozellik';if(/televizor/.test(n))return 'tv';return 'ev';}
function amount(v:unknown){const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)&&n>0?Math.round(n*100)/100:0;}
function imageUrl(v:unknown){if(typeof v!=='string'||!v)return '/favicon.svg';const u=new URL(v,'https://technomania.az');return u.protocol==='https:'?u.href:'/favicon.svg';}
export function normalizeTechnomania(input:any,checkedAt=new Date().toISOString()){
 if(!input||!Array.isArray(input.products)||input.products.length>2000||input.total!==input.products.length)throw new Error('Technomania feed tam deyil və ya format dəyişib.');
 const products:any[]=[],offers:any[]=[],warnings:any[]=[];let mapped=0;
 for(const raw of input.products){
  if(!raw.id||!/^[a-zA-Z0-9_-]{1,70}$/.test(raw.id)||typeof raw.name!=='string'||!raw.slug||!/^[a-zA-Z0-9_-]+$/.test(raw.slug)){warnings.push({id:raw.id,error:'ID/ad/link düzgün deyil'});continue;}
  const price=amount(raw.cash_price);if(!price){warnings.push({id:raw.id,error:'Nağd qiymət yoxdur'});continue;}
  const attrs=raw.attributes&&typeof raw.attributes==='object'?raw.attributes:{};const specs:Record<string,string>={};
  for(const [key,value] of Object.entries(attrs)){if(/credit|price|monthly/i.test(key)||value==null||typeof value==='object')continue;if(Object.keys(specs).length>=22)break;specs[key.slice(0,100)]=String(value).replace(/\s+/g,' ').trim().slice(0,200);}
  const credits=[6,12,18].map(months=>({months,total:amount(raw['credit_price_'+months]||attrs['price_credit_'+months]),monthly:amount(raw['credit_'+months+'_monthly']||attrs['credit_'+months+'_monthly'])})).filter(c=>c.total>=price&&c.total>0);
  const chosen=credits.find(c=>c.months===12)||credits[0];const colors=Array.isArray(raw.colors)&&raw.colors.length?raw.colors:[null];
  for(let i=0;i<colors.length;i++){
   const color=colors[i];const colorName=String(color?.name||attrs['Rəng']||'Rəng mağazada dəqiqləşdirilir');
   const memory=String(attrs['Yaddaş']||'').trim();const match=/^Apple iPhone 16 128\s?GB$/i.test(raw.name)&&/^(Qara|Black)$/i.test(colorName)?'iphone16-black':null;
   const productId=match||`tm-${raw.id}-${i}`;if(match)mapped++;
   const active=raw.is_active===true;const stock=active&&Number(color?color.stock:raw.stock)>0;
   const variant=[memory?(/GB|TB/i.test(memory)?memory:memory+' GB'):'',colorName].filter(Boolean).join(' · ').slice(0,180);
   products.push({id:productId,name:raw.name.slice(0,180),brand:String(raw.brand||'Digər').slice(0,80),category:categoryOf(String(raw.category_name||'')),variant,image:imageUrl(color?.image||raw.image),specs:{...specs,Rəng:colorName.slice(0,200)},description:'Məhsul məlumatları Technomania-nın rəsmi kataloq feed-indən alınıb. Qiymət, stok və xüsusiyyətlər mənbənin təqdim etdiyi məlumatlardır.',active,featured:false,familyId:'tm-'+raw.id});
   offers.push({id:`tm-offer-${raw.id}-${i}`,productId,storeId:'technomania',price,shipping:0,shippingKnown:false,months:chosen?.months||0,installmentTotal:chosen?.total||0,installmentOptions:credits,stock,warranty:String(attrs['Zəmanət']||'Mağazada dəqiqləşdirin').slice(0,200),url:'https://technomania.az/product/'+raw.slug,demo:false,checkedAt,cities:['Bakı'],sponsored:false,sourceSku:String(raw.sku||raw.id),sourceName:raw.name,feedProductId:raw.id,feedVariantIndex:i,feedUpdatedAt:raw.updated_at||null});
  }
 }
 return{products,offers,warnings,sourceCount:input.products.length,variantCount:products.length,inStock:offers.filter(o=>o.stock).length,mapped,checkedAt,source:TECHNOMANIA_FEED};
}
export async function fetchTechnomania(){const r=await fetch(TECHNOMANIA_FEED,{redirect:'manual',signal:AbortSignal.timeout(25000),headers:{Accept:'application/json','User-Agent':'Qepik/1.0 OfficialCatalogFeed'}});if(!r.ok)throw new Error('Technomania feed cavabı: HTTP '+r.status);const reader=r.body?.getReader();if(!reader)throw new Error('Feed boşdur.');const chunks:Uint8Array[]=[];let n=0;while(true){const part=await reader.read();if(part.done)break;n+=part.value.length;if(n>12_000_000){await reader.cancel();throw new Error('Feed ölçüsü 12 MB limitini keçir.');}chunks.push(part.value);}const bytes=new Uint8Array(n);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}return normalizeTechnomania(JSON.parse(new TextDecoder().decode(bytes)));}
