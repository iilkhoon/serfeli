import type {Catalog,Product,Offer} from './catalog';
export type FeedSnapshot={products:Product[];offers:Offer[];checkedAt:string;sourceCount:number;variantCount:number};
export function mergeOfficialFeed(c:Catalog,feed:FeedSnapshot):Catalog{
 const products=new Map(c.products.map(p=>[p.id,p]));
 const current=new Set(feed.products.map(p=>p.id));
 for(const old of c.products)if(old.id.startsWith('tm-')&&!current.has(old.id))products.set(old.id,{...old,active:false});
 for(const p of feed.products){const old=products.get(p.id);products.set(p.id,p.id==='iphone16-black'&&old?{...old,familyId:p.familyId}:p);}
 const offers=new Map(c.offers.map(o=>[o.id,o]));const ids=new Set(feed.offers.map(o=>o.id));
 for(const old of c.offers)if(old.storeId==='technomania'&&old.id.startsWith('tm-offer-')&&!ids.has(old.id))offers.set(old.id,{...old,stock:false,checkedAt:feed.checkedAt});
 for(const o of feed.offers)offers.set(o.id,o);
 return {...c,stores:c.stores.map(s=>s.id==='technomania'?{...s,description:'Rəsmi JSON feed ilə bütün məhsul və rəng variantları, qiymət və stok məlumatları yenilənir.'}:s),products:[...products.values()],offers:[...offers.values()],liveSource:{name:'Technomania',checkedAt:feed.checkedAt,sourceCount:feed.sourceCount,variantCount:feed.variantCount,state:'fresh'}};
}
