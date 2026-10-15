"use client";

import { useState } from "react";

export default function ProductImage({src,name,category}:{src:string;name:string;category:string}) {
  const [loading,setLoading]=useState(true);
  const [fallback,setFallback]=useState(false);
  const [unavailable,setUnavailable]=useState(false);
  const fallbackSrc=category.toLowerCase().includes("cat")?"/products/cat-care-essentials.png":"/products/dog-care-essentials.png";
  return <span className="productImageBody" aria-busy={loading}>
    {loading&&<span className="productImageSkeleton" aria-hidden="true"/>}
    {unavailable?<span className="productImageUnavailable" role="img" aria-label={`${name}: image unavailable`}>Image unavailable</span>:
      <img ref={image=>{if(loading&&image?.complete&&image.naturalWidth>0)setLoading(false);}} className="productImage originalProductImage" src={fallback?fallbackSrc:src} alt={name} loading="lazy" decoding="async" onLoad={()=>setLoading(false)} onError={()=>{if(!fallback){setFallback(true);setLoading(true);}else{setUnavailable(true);setLoading(false);}}}/>}
  </span>;
}
