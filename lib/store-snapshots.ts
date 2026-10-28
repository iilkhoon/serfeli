import {seedProducts as initialProducts,seedOffers as initialOffers} from './server-catalog';
import soliton from './store-catalogs/soliton.json';
import tap from './store-catalogs/tap-shops.json';
// Public source snapshots stay in the server build; they are not imported by client components.
import techbar from './store-catalogs/techbar.json';
import casio from './store-catalogs/casio.json';
import eurolux from './store-catalogs/eurolux.json';
import seehome from './store-catalogs/seehome.json';
import allstar from './store-catalogs/allstar.json';
import {seedStores,type Catalog,type Product,type Offer,type Store} from './catalog';
const snapshots=[techbar,casio,eurolux,seehome,allstar,soliton] as unknown as {storeId:string;products:Product[];offers:Offer[];checkedAt:string;sourceCount:number}[];
export const storeCatalogCoverage=snapshots.map(s=>({storeId:s.storeId,count:s.products.length,priced:s.offers.length,checkedAt:s.checkedAt}));
export function withStoreSnapshots(c:Catalog):Catalog{
 const products=new Map([...snapshots.flatMap(s=>s.products),...tap.products].map(p=>[p.id,p]));for(const p of c.products)products.set(p.id,{...products.get(p.id),...p});
 const offers=new Map([...snapshots.flatMap(s=>s.offers),...tap.offers as Offer[]].map(o=>[o.id,o]));for(const o of c.offers)offers.set(o.id,o);
 const stores=new Map([...seedStores.filter(s=>s.id==='alinino'),...tap.stores as Store[],...c.stores].map(s=>[s.id,s]));
 const connected=new Set(snapshots.map(s=>s.storeId));
 return {...c,products:[...products.values()],offers:[...offers.values()],stores:[...stores.values()].map(s=>connected.has(s.id)?{...s,sourceStatus:'public_catalog',description:s.description+' Açıq mağaza kataloqundan məhsullar yoxlanma vaxtı ilə göstərilir.'}:s),sourceCoverage:storeCatalogCoverage};
}

function normalizedSourceUrl(raw:string){try{const u=new URL(raw);u.hostname=u.hostname.replace(/^www\./,'');u.hash='';u.pathname=u.pathname.replace(/\/$/,'');return u.href;}catch{return raw;}}
const snapshotProducts=new Map([...initialProducts,...snapshots.flatMap(s=>s.products),...tap.products].map(p=>[p.id,p]));
const snapshotOffers=[...initialOffers,...snapshots.flatMap(s=>s.offers),...tap.offers as Offer[]];
const sourceLookup=new Map(snapshotOffers.map(o=>[o.storeId+' '+normalizedSourceUrl(o.url),o]));
export function knownSourceProduct(sourceId:string,url:string){const offer=sourceLookup.get(sourceId+' '+normalizedSourceUrl(url));return offer?{product:snapshotProducts.get(offer.productId),offer}:undefined;}
