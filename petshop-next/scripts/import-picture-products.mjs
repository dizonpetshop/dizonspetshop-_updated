import {PrismaClient} from '@prisma/client';
import {readFile,writeFile,copyFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename,resolve} from 'node:path';
import {pictureDescriptions} from './picture-product-descriptions.mjs';

const records=[
 ['1.jpg','Tasty Bites','Dog Food','Food'],
 ['Abalone Beef Cat Food.jpg','Abalone Beef Cat Treats','Cat Treats','Food'],
 ['Akika Herbal Pet Shop.jpg','Akiika Herbal Pet Soap','Pet Hygiene','Other'],
 ['AOZI  Lamb.webp','Aozi Lamb','Dog Food','Food'],
 ['Aozi adult  gray.jpg','Aozi Adult Cat Food','Cat Food','Food'],
 ['Aozi Adult.jpg','Aozi Adult Dog Food','Dog Food','Food'],
 ['AOZI beef.jpg','Aozi','Dog Food','Food'],
 ['Aozi Salmon and Liver.jpg','Aozi Salmon and Liver','Dog Food','Food'],
 ['beefteriyaki.jpg','Beef Teriyaki','Dog Food','Food'],
 ['Chicken Cat Strips.jpg','Chicken Cat Strips','Cat Treats','Food'],
 ['CUTIES CATZ.jpg','Cuties Catz','Cat Food','Food'],
 ['DENTA PRO.jpg','Denta Pro','Dog Food','Food'],
 ['Dry Cleaning Powder.jpg','Petsup Dry Cleaning Powder - Mint','Pet Hygiene','Other'],
 ['FUNNY U PET FOOD.jpg','Funny U Pet Food','Cat Food','Food'],
 ['HOLISTIC.jpg','Holistic','Cat Food','Food'],
 ['madre de cacao cucumber lemon.jpg','Madre de Cacao Shampoo - Cucumber Melon','Pet Shampoo','Shampoo'],
 ['madre de cacao lavander.jpg','Madre de Cacao Shampoo - Lavender','Pet Shampoo','Shampoo'],
 ['madre de cacao powder.jpg','Madre de Cacao Shampoo - Powder Scent','Pet Shampoo','Shampoo'],
 ['NATURAL GOAT MILK.jpg','Natural Goat Milk','Cat Food','Food'],
 ['Pet Marra (Chicken and Liver).JPG','PetMarra Chicken and Liver - 1kg','Dog Food','Food'],
 ['Pet Marra (Ocean Fish and Chicken) pack.JPG','PetMarra Ocean Fish and Chicken Kitten - 1kg','Cat Food','Food'],
 ['Pet Marra (Ocean Fish and Chicken).jpg','PetMarra Ocean Fish and Chicken Adult Cat - 7kg','Cat Food','Food'],
 ['Pet Marra (Salmon and Vegetables).jpg','PetMarra Salmon and Vegetables','Dog Food','Food'],
 ['Pet Marra (Tune and Vegetables).jpg','PetMarra Duck and Vegetables','Dog Food','Food'],
 ['SPECAL DOG.jpg','Special Dog','Dog Food','Food'],
 ['TOEICAT.jpg','Toeicat','Cat Food','Food'],
 ['TOEIDOG.jpg','ToeiDog','Dog Food','Food'],
 ['TOP BREED ADULT.jpg','Top Breed Adult','Dog Food','Food'],
 ['Vitastrip Cat Treats.jpg','Vitastrip Cat Treats','Cat Treats','Food'],
 ['ZOI CAT.jpg','Zoi Cat','Cat Food','Food'],
 ['ZOI DOG.jpg','Zoi Dog','Dog Food','Food'],
];
const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g,'');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const source=resolve('../pictures'),destination=resolve('public/products');
const files=await readdir(source);
if(records.length!==files.length||records.some(([file])=>!files.includes(file)))throw new Error('Pictures folder changed; review the import mapping.');
const prepared=await Promise.all(records.map(async ([file,name,category,group])=>({file,name,category,group,bytes:await readFile(resolve(source,file)),sku:`PICTURES-${hash(normalize(file)).slice(0,16).toUpperCase()}`})));
const prisma=new PrismaClient(),apply=process.argv.includes('--apply');
try{
 const before=await prisma.product.findMany({orderBy:{productId:'asc'}});
 await mkdir('CATALOG_IMPORT',{recursive:true});
 if(apply){
   await writeFile(`CATALOG_IMPORT/products-before-${Date.now()}.json`,JSON.stringify(before,null,2));
   await mkdir(destination,{recursive:true});
   for(const entry of prepared)await copyFile(resolve(source,entry.file),resolve(destination,entry.file));
 }
 const results=await prisma.$transaction(async tx=>{
   if(apply)await tx.$queryRaw`SELECT product_id FROM products FOR UPDATE`;
   const existing=await tx.product.findMany(),result=[];
   for(const entry of prepared){
     const matches=existing.filter(product=>product.sku===entry.sku||normalize(product.productName)===normalize(entry.name)||normalize(basename((product.image||'').replaceAll('\\','/')))===normalize(entry.file));
     if(matches.length>1)throw new Error(`Ambiguous existing product: ${entry.name}. No import committed.`);
     let product=matches[0];
     if(product){
       if(apply&&product.image!==entry.file)await tx.product.update({where:{productId:product.productId},data:{image:entry.file}});
       result.push({action:'preserved',id:product.productId,name:product.productName,file:entry.file});
     }else{
       if(apply){product=await tx.product.create({data:{sku:entry.sku,productName:entry.name,category:entry.category,productGroup:entry.group,image:entry.file,description:pictureDescriptions[entry.file] || `${entry.name} for your pet care routine.`,price:0,stockQuantity:0,isActive:1}});existing.push(product);}
       result.push({action:'added-unavailable',id:product?.productId,name:entry.name,file:entry.file});
     }
   }
   return result;
 },{timeout:20000});
 if(apply){
   for(const entry of prepared)if(hash(await readFile(resolve(destination,entry.file)))!==hash(entry.bytes))throw new Error(`Image copy mismatch: ${entry.file}`);
   const after=await prisma.product.findMany();
   for(const original of before){
     const current=after.find(p=>p.productId===original.productId);
     for(const key of ['productName','category','productGroup','price','stockQuantity','isActive','sku'])if(String(current?.[key])!==String(original[key]))throw new Error(`Existing ${key} changed: ${original.productName}`);
   }
   await writeFile('CATALOG_IMPORT/RESULTS.json',JSON.stringify({appliedAt:new Date().toISOString(),before:before.length,after:after.length,results},null,2));
 }
 console.table(results.map(({action,name})=>({action,name})));
 console.log(`${apply?'Applied':'Dry run'}: ${results.filter(r=>r.action==='preserved').length} existing preserved, ${results.filter(r=>r.action==='added-unavailable').length} new unavailable products. ${prepared.length} images verified.`);
}finally{await prisma.$disconnect();}
