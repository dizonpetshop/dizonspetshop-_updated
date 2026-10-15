import sharp from 'sharp';
import {createHash} from 'node:crypto';
export const messageImageLimit=1_500_000;
export async function messageImage(file:File){
 if(file.size>messageImageLimit)throw new Error('Images must be smaller than 1.5 MB.');
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Choose a JPG, PNG, or WebP image.');
 const bytes=Buffer.from(await file.arrayBuffer());
 try{
  const image=sharp(bytes,{limitInputPixels:20_000_000,failOn:'warning',animated:false}),meta=await image.metadata();
  if(!['jpeg','png','webp'].includes(meta.format||'')||!meta.width||!meta.height||(meta.pages||1)>1)throw Error();
  const safe=await image.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();
  if(safe.length>messageImageLimit)throw new Error('The processed image is too large. Choose a smaller image.');
  return {bytes:safe,mime:'image/webp',hash:createHash('sha256').update(bytes).digest('hex')};
 }catch{throw new Error('This image could not be read. Choose a valid JPG, PNG, or WebP image under 1.5 MB.');}
}
