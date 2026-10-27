import extra from '../docs/additional-live-products.json';
// Kept on the server so the complete merchant feed is not shipped in browser JS.
import technoSeed from './technomania-seed.json';
import {seedCatalog as base,seedProducts as baseProducts,seedOffers as baseOffers,seedHistory as baseHistory,type Catalog,type Product,type Offer,type Point} from './catalog';
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
 const part=path.split('?')[0].split('/');const category=part[1]==='kateqoriya'?part[2]:null;const visible=selectedId?catalog.products.filter(p=>p.active&&(p.id===selectedId||p.familyId&&p.familyId===catalog.products.find(x=>x.id===selectedId)?.familyId)):category?catalog.products.filter(p=>p.active&&p.category===category).slice(0,24):part[1]==='kataloq'?catalog.products.filter(p=>p.active).slice(0,24):catalog.products.filter(p=>p.active&&p.featured);
 const ids=new Set(visible.map(p=>p.id));
 return {...catalog,products:visible,offers:catalog.offers.filter(o=>ids.has(o.productId)),history:catalog.history.filter(h=>ids.has(h.productId)),totals:{products:catalog.products.filter(p=>p.active).length,stores:catalog.stores.filter(s=>s.active).length}};
}
