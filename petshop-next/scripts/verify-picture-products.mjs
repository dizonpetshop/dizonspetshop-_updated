import {PrismaClient} from '@prisma/client';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const prisma=new PrismaClient();
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
try{
 const report=JSON.parse(await readFile('CATALOG_IMPORT/RESULTS.json','utf8'));
 const products=await prisma.product.findMany({where:{isActive:1},orderBy:{productId:'asc'}});
 assert.equal(report.results.length,31);
 assert.equal(new Set(report.results.map(row=>row.id)).size,31,'Pictures must reference distinct product records.');
 const home=await fetch('http://localhost:3000/');assert.equal(home.status,200);const html=await home.text();
 let checked=0;
 for(const row of report.results){
   const product=products.find(p=>p.productId===row.id);assert.ok(product,`Client-visible product missing: ${row.name}`);
   assert.ok(html.includes(`/api/products/${row.id}/image`),`Homepage product missing: ${row.name}`);
   assert.ok(Number.isInteger(product.stockQuantity)&&product.stockQuantity>=0);
   assert.ok(Number.isFinite(Number(product.price))&&Number(product.price)>=0);
   const response=await fetch(`http://localhost:3000/api/products/${row.id}/image`);assert.equal(response.status,200,`Broken image: ${row.name}`);
   assert.equal(digest(Buffer.from(await response.arrayBuffer())),digest(await readFile(`../pictures/${row.file}`)),`Image mismatch: ${row.name}`);
   checked++;
 }
 const result={verifiedAt:new Date().toISOString(),images:checked,visibleProducts:products.length,newUnavailable:report.results.filter(r=>r.action==='added-unavailable').length,duplicateProductIds:false,homepageStatus:home.status};
 await writeFile('CATALOG_IMPORT/VERIFICATION.json',JSON.stringify(result,null,2));console.log(result);
}finally{await prisma.$disconnect();}
