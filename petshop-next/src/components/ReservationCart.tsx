"use client";
import {useEffect,useState} from 'react';

export type CartProduct={productId:number;productName:string;category:string;price:number;stockQuantity:number;image:string};
export type CartItem={productId:number;quantity:number;selected:boolean};
export function useReservationCart(userId:number){
  const key=`dizons-reservation-cart-v1:${userId}`;
  const [state,setState]=useState<{owner:string;loaded:boolean;items:CartItem[]}>({owner:key,loaded:false,items:[]});
  const [notice,setNotice]=useState('');
  useEffect(()=>{
    let items:CartItem[]=[];
    try{const raw=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(raw)){const seen=new Set<number>();items=raw.slice(0,100).filter(i=>i&&Number.isSafeInteger(i.productId)&&i.productId>0&&Number.isSafeInteger(i.quantity)&&i.quantity>0&&i.quantity<=2147483647&&!seen.has(i.productId)&&seen.add(i.productId)).map(i=>({productId:i.productId,quantity:i.quantity,selected:i.selected===true}));}}catch{setNotice('Cart storage is unavailable. Your cart will stay open for this visit.');}
    setState({owner:key,loaded:true,items});
  },[key]);
  useEffect(()=>{if(state.loaded&&state.owner===key)try{localStorage.setItem(key,JSON.stringify(state.items));}catch{/* Keep the in-memory cart usable. */}},[state,key]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),4000);return()=>clearTimeout(timer);},[notice]);
  const items=state.owner===key?state.items:[];
  const change=(fn:(items:CartItem[])=>CartItem[])=>setState(current=>current.owner===key&&current.loaded?{...current,items:fn(current.items)}:current);
  function add(product:CartProduct,quantity:number){
    if(!state.loaded||state.owner!==key)return;
    const current=items.find(i=>i.productId===product.productId)?.quantity||0;
    if(!Number.isInteger(quantity)||quantity<1||current+quantity>product.stockQuantity){setNotice(`${product.productName}: cart quantity cannot exceed ${product.stockQuantity} available.`);return;}
    if(!current&&items.length>=100){setNotice('Your cart can contain up to 100 different products.');return;}
    change(rows=>{const existing=rows.find(i=>i.productId===product.productId);if((existing?.quantity||0)+quantity>product.stockQuantity||(!existing&&rows.length>=100))return rows;return existing?rows.map(i=>i.productId===product.productId?{...i,quantity:i.quantity+quantity}:i):[...rows,{productId:product.productId,quantity,selected:true}];});
    setNotice(`${product.productName} added to your reservation cart.`);
  }
  return {items,loaded:state.loaded&&state.owner===key,notice,add,setQuantity:(id:number,quantity:number)=>change(rows=>rows.map(i=>i.productId===id?{...i,quantity}:i)),toggle:(id:number)=>change(rows=>rows.map(i=>i.productId===id?{...i,selected:!i.selected}:i)),selectAll:(ids:number[],selected:boolean)=>change(rows=>rows.map(i=>ids.includes(i.productId)?{...i,selected}:i)),remove:(id:number)=>change(rows=>rows.filter(i=>i.productId!==id)),consume:(reserved:{productId:number;quantity:number}[])=>change(rows=>rows.flatMap(i=>{const used=reserved.find(r=>r.productId===i.productId)?.quantity||0;return i.quantity>used?[{...i,quantity:i.quantity-used}]:[];}))};
}
export type CartController=ReturnType<typeof useReservationCart>;
export function CartQuantity({value,max,label,onChange,disabled=false}:{value:number|'';max:number;label:string;onChange:(n:number|'')=>void;disabled?:boolean}){
  return <div className="cartQuantity"><button type="button" aria-label={`Decrease ${label}`} disabled={disabled||value===''||value<=0} onClick={()=>onChange(Number(value)-1)}>−</button><input aria-label={`Quantity for ${label}`} type="number" min={0} max={Math.max(0,max)} step={1} value={value} disabled={disabled} onChange={e=>{if(e.target.value===''){onChange('');return;}const n=Number(e.target.value);if(Number.isInteger(n)&&n>=0&&n<=max)onChange(n);}}/><button type="button" aria-label={`Increase ${label}`} disabled={disabled||max<1||(value!==''&&value>=max)} onClick={()=>onChange(value===''?1:value+1)}>+</button></div>;
}
export {default} from './ReservationStudio';
