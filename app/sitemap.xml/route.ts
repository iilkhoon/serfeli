import {publicCatalog} from '../../lib/public-data';
import {SITE_URL} from '../../lib/seo';
import {categories} from '../../lib/catalog';
export const dynamic='force-dynamic';
export async function GET(){const c=await publicCatalog();const paths=['','/kataloq','/magazalar','/endirimler','/rehber',...categories.filter(cat=>c.products.some(p=>p.active&&p.category===cat.id)).map(cat=>'/kateqoriya/'+cat.id),...c.stores.filter(s=>s.active).map(s=>'/magazalar/'+s.id),...c.products.filter(p=>p.active).map(p=>'/mehsul/'+p.id)];const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+paths.map(p=>'<url><loc>'+escape(SITE_URL+p)+'</loc></url>').join('')+'</urlset>',{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=1800'}});}
