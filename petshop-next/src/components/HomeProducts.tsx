"use client";
import { useState } from "react";
import Link from "next/link";

type Product={id:number;name:string;category:string;group:string;description:string|null;price:number;stock:number;image:string};
const money=(value:number)=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(value);
export default function HomeProducts({products}:{products:Product[]}){
  const [category,setCategory]=useState("");
  const categories=[...new Set(products.map(product=>product.category))];
  const visible=products.filter(product=>!category||product.category===category);
  return <>
    <div className="homeProductTabs" role="group" aria-label="Product categories">{["",...categories].map(item=><button type="button" key={item} aria-pressed={category===item} onClick={()=>setCategory(item)}>{item||"All Products"}</button>)}</div>
    <div className="homeRetailGrid">{visible.map(product=><article className="homeRetailCard" key={product.id}>
      <div className="homeRetailPhoto"><img src={product.image} alt={product.name} loading="lazy" onError={event=>{if(!event.currentTarget.dataset.fallback){event.currentTarget.dataset.fallback="true";event.currentTarget.src=product.category.toLowerCase().includes("cat")?"/products/cat-care-essentials.png":"/products/dog-care-essentials.png";}}}/><span className={product.category.toLowerCase().includes("cat")?"cat":product.category.toLowerCase().includes("dental")?"care":"dog"}>{product.category}</span></div>
      <div className="homeRetailCopy"><small>{product.group} · {product.category}</small><h3>{product.name}</h3><p>{product.description||"Available for store pickup."}</p></div>
      <footer><strong>{money(product.price)}</strong>{product.stock>0?<Link href="/client/login">Reserve</Link>:<button type="button" disabled title="Out of stock">Reserve</button>}</footer>
    </article>)}</div>
    {!visible.length&&<p className="homeProductEmpty">No products available in this category.</p>}
  </>;
}