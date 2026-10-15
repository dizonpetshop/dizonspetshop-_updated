import {PrismaClient} from '@prisma/client';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {pictureDescriptions} from './picture-product-descriptions.mjs';

const prisma=new PrismaClient();
const placeholder='Price and availability to be confirmed by the shop.';
try {
  const before=await prisma.product.findMany({where:{description:placeholder}});
  assert.ok(before.every(product=>pictureDescriptions[product.image]),'Review descriptions for unmapped images before updating.');
  await writeFile(`CATALOG_IMPORT/descriptions-before-${Date.now()}.json`,JSON.stringify(before,null,2));
  await prisma.$transaction(async tx=>{
    for(const product of before)await tx.product.updateMany({where:{productId:product.productId,description:placeholder},data:{description:pictureDescriptions[product.image]}});
  });
  for(const original of before){
    const updated=await prisma.product.findUniqueOrThrow({where:{productId:original.productId}});
    assert.equal(updated.description,pictureDescriptions[original.image]);
    for(const field of ['price','stockQuantity','productName','image','isActive'])assert.equal(String(updated[field]),String(original[field]));
  }
  assert.equal(await prisma.product.count({where:{description:placeholder}}),0);
  console.log(`Updated and verified ${before.length} product descriptions. Prices, stock and images preserved.`);
}finally{await prisma.$disconnect();}
