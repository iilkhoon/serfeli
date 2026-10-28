import type {Catalog} from './catalog';
import {fetchTechnomania} from './technomania';
import {mergeOfficialFeed,type FeedSnapshot} from './catalog-feed';
let lastFailed=false;
let cached:FeedSnapshot|undefined;let nextCheck=0;let pending:Promise<FeedSnapshot>|undefined;
// Refresh on visits, share concurrent requests, and retain the last successful result on failure.
export async function withLiveFeed(c:Catalog):Promise<Catalog>{
 let failed=false;
 if(Date.now()>=nextCheck){
  pending??=fetchTechnomania();
  try{cached=await pending;lastFailed=false;nextCheck=Date.now()+300000;}catch{failed=true;lastFailed=true;nextCheck=Date.now()+60000;}finally{pending=undefined;}
 }
 if(cached){const result=mergeOfficialFeed(c,cached);if(failed||lastFailed||Date.now()-Date.parse(cached.checkedAt)>360000)result.liveSource!.state='stale';return result;}
 const checkedAt=c.offers.filter(o=>o.storeId==='technomania').map(o=>o.checkedAt).sort().at(-1);
 return {...c,liveSource:{name:'Technomania',checkedAt:checkedAt||'',sourceCount:0,variantCount:0,state:'stale'}};
}
