import { PrismaClient } from '@prisma/client';
import { writeFile } from 'node:fs/promises';
const p=new PrismaClient();
const names=['Shaved / Kalbo','Summer Cut','Bear Cut','Puppy Cut','Asian Fusion'];
const sizes=['Small','Medium','Large','Extra Large','Giant'];
const reference=[[350,450,550,750,850],[400,500,600,800,900],[500,600,800,900,1100],[450,550,750,850,1000],[500,600,800,900,1100]];
try{
  const rows=await p.styleSizePricing.findMany({include:{style:true},orderBy:[{styleId:'asc'},{pricingId:'asc'}]});
  const differences=[];
  for(let i=0;i<names.length;i++)for(let j=0;j<sizes.length;j++){
    const matches=rows.filter(r=>r.style.styleName===names[i]&&r.petSize===sizes[j]);
    if(matches.length!==1||Number(matches[0]?.price)!==reference[i][j])differences.push({name:names[i],size:sizes[j],expected:reference[i][j],actual:matches.map(r=>String(r.price))});
  }
  const result={timestamp:new Date().toISOString(),rows:rows.map(r=>({id:r.pricingId,styleId:r.styleId,name:r.style.styleName,size:r.petSize,price:String(r.price)})),differences};
  await writeFile('HAIRCUT_PRICING_AUDIT.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await p.$disconnect();}
