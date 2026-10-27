import Platform from './platform';
import {initialCatalogFor} from '../lib/server-catalog';
import {publicCatalog} from '../lib/public-data';
import {pageSeo,structuredData} from '../lib/seo';
export const dynamic='force-dynamic';
export async function generateMetadata(){return pageSeo('/',await publicCatalog());}
export default async function Home(){const c=await publicCatalog();return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:structuredData('/',c)}}/><Platform initialCatalog={initialCatalogFor('/',c)}/></>;}
