import extra from '../docs/additional-live-products.json';
// Kept on the server so the complete merchant feed is not shipped in browser JS.
import technoSeed from './technomania-seed.json';
import {seedCatalog as base,seedProducts as baseProducts,seedOffers as baseOffers,seedHistory as baseHistory,validOffers,type Catalog,type Product,type Offer,type Point} from './catalog';
const feed=technoSeed as unknown as {products:Product[];offers:Offer[]};
const catMap:Record<string,string>={phones:'telefon',laptops:'noutbuk',audio:'audio',home:'ev',tv:'tv',gaming:'oyun',wearables:'saat'};
const extraProducts:Product[]=extra.offers.map(o=>({id:o.id,name:o.name,brand:o.brand,category:catMap[o.category]||'aksesuar',variant:[o.capacity,o.color].filter(Boolean).join(' · ')||'Mənbədəki model',image:o.localImage,specs:o.specs as Record<string,string>,description:o.name+' üçün mağazanın mənbə səhifəsində yoxlanmış nağd qiymət və stok məlumatları.',active:true,featured:true}));
const extraOffers:Offer[]=extra.offers.map(o=>({id:'live-'+o.id,productId:o.id,storeId:o.storeId,price:o.price,shipping:0,shippingKnown:false,months:0,installmentTotal:0,stock:true,warranty:'Mağazada dəqiqləşdirin',url:o.sourceUrl,demo:false,checkedAt:new Date(o.checkedAt).toISOString(),cities:['Bakı'],sponsored:false,sourceSku:o.sourceSku,sourceName:o.name}));
export const seedProducts:Product[]=[...extraProducts,...feed.products.filter(p=>p.id!=='iphone16-black'),...baseProducts];
export const seedOffers:Offer[]=[...extraOffers,...feed.offers,...baseOffers];
export const seedHistory:Point[]=[...extraOffers.map(o=>({id:'initial-'+o.id,productId:o.productId,price:o.price,date:o.checkedAt,demo:false})),...feed.offers.filter(o=>o.stock).map(o=>({id:'initial-'+o.id,productId:o.productId,price:o.price,date:o.checkedAt,demo:false})),...baseHistory];
export const seedStores=base.stores;
export const seedCatalog:Catalog={...base,products:seedProducts,offers:seedOffers,history:seedHistory};
export function initialCatalogFor(path:string,catalog:Catalog=seedCatalog):Catalog{
 const selectedId=path.split('?')[0].startsWith('/mehsul/')?path.split('?')[0].split('/')[2]:null;
 const part=path.split('?')[0].split('/');const category=part[1]==='kateqoriya'?part[2]:null;const store=part[1]==='magazalar'?part[2]:null;const family=selectedId?catalog.products.find(p=>p.id===selectedId)?.familyId:null;
 let visible:Product[];
 if(selectedId)visible=catalog.products.filter(p=>p.active&&(p.id===selectedId||family&&p.familyId===family));
 else if(category)visible=catalog.products.filter(p=>p.active&&p.category===category).slice(0,24);
 else if(store){const ids=new Set(catalog.offers.filter(o=>o.storeId===store).map(o=>o.productId));visible=catalog.products.filter(p=>p.active&&(p.sourceStoreId===store||ids.has(p.id))).slice(0,24);}
 else if(part[1]==='kataloq')visible=catalog.products.filter(p=>p.active).slice(0,24);
 else {const chosen=new Map(catalog.products.filter(p=>p.active&&p.featured).map(p=>[p.id,p]));const counts=new Map<string,number>();for(const p of catalog.products){if(!p.active||(counts.get(p.category)||0)>=6||!validOffers(catalog,p.id).some(o=>!o.demo))continue;chosen.set(p.id,p);counts.set(p.category,(counts.get(p.category)||0)+1);}visible=[...chosen.values()];}
 const ids=new Set(visible.map(p=>p.id));
 return {...catalog,products:visible,offers:catalog.offers.filter(o=>ids.has(o.productId)),history:catalog.history.filter(h=>ids.has(h.productId)),totals:{products:catalog.products.filter(p=>p.active).length,stores:catalog.stores.filter(s=>s.active).length}};
}
