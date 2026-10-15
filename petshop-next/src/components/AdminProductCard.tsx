"use client";
import { useRef, useState, type FormEvent } from "react";
import { updateProduct } from "@/app/admin/actions";
import { stockStatus } from "@/lib/stock-status";
import { getProductPortion } from "@/lib/product-portions";
import ProductImage from "@/components/ProductImage";

type Props = { id:number; sku:string; name:string; category:string; description:string; group:string; price:string; stock:number; reorder:number; active:boolean; imageSrc:string };
const money=(value:number)=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(value);
export default function AdminProductCard(product:Props){
  const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const [price,setPrice]=useState(""),[quantity,setQuantity]=useState(""),[saving,setSaving]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [baseline,setBaseline]=useState({price:0,stock:0});
  const status=stockStatus(product.stock,product.reorder);
  const portion=getProductPortion(product.name,Number(product.price.replaceAll(",","")));
  function open(){setBaseline({price:Number(product.price.replaceAll(",","")),stock:product.stock});setPrice(product.price.replaceAll(",",""));setQuantity(String(product.stock));setError("");setNotice("");dialog.current?.showModal();}
  function close(){if(saving)return;dialog.current?.close();setError("");trigger.current?.focus();}
  async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();if(saving)return;setSaving(true);setError("");try{
    const form=new FormData(event.currentTarget);const result=await updateProduct(form);
    if(result.error){setError(result.error);return;}
    dialog.current?.close();trigger.current?.focus();setNotice("Inventory updated successfully.");
  }catch{setError("Could not complete the save. Refresh inventory to check the latest values before retrying.");}finally{setSaving(false);}}
  function imageFallback(event:React.SyntheticEvent<HTMLImageElement>){if(!event.currentTarget.dataset.fallback){event.currentTarget.dataset.fallback="true";event.currentTarget.src="/products/dog-care-essentials.png";}}
  return <article className="databaseCard adminCatalogCard premiumInventoryCard">
    <div className="adminCatalogMedia softNavyProductFrame"><ProductImage key={product.imageSrc} src={product.imageSrc} name={product.name} category={product.category}/><span className={`inventoryBadge ${status.tone}`}>{status.label}</span></div>
    <div className="adminCatalogSummary"><small>{product.category}</small><h3>{product.name}</h3><p className="inventoryDescription">{product.description || "No description provided."}</p><small className="inventorySku">SKU: {product.sku}</small><div><strong>{money(Number(product.price.replaceAll(",","")))}</strong><span>{product.stock} available</span></div>{!product.active&&<small className="inventoryVisibility">Hidden from clients</small>}</div>
    <button ref={trigger} className="inventoryEditButton" type="button" onClick={open}>Edit Inventory</button>
    {notice&&<p className="inventorySuccess" role="status">{notice}</p>}
    <dialog ref={dialog} className="inventoryEditDialog" aria-labelledby={`inventory-title-${product.id}`} onCancel={e=>{e.preventDefault();close();}}>
      <header><h2 id={`inventory-title-${product.id}`}>Edit Inventory</h2><button type="button" aria-label="Close inventory editor" onClick={close} disabled={saving}>×</button></header>
      <div className="inventoryReadOnly"><img src={product.imageSrc} alt={product.name} onError={imageFallback}/><div><small>{product.category}</small><h3>{product.name}</h3><p>{product.description}</p><small>SKU: {product.sku}</small></div></div>
      <form onSubmit={save}>
        <input type="hidden" name="id" value={product.id}/><input type="hidden" name="previousStock" value={baseline.stock}/><input type="hidden" name="previousPrice" value={baseline.price}/>
        <div className="inventoryInputGrid"><label>{portion?`Price per ${portion.label} (₱)`:"Selling Price (₱)"}<input name="price" type="number" min="0" max="99999999.99" step="0.01" required value={price} onChange={e=>setPrice(e.target.value)} disabled={saving}/></label><label>Available Inventory Quantity<input name="stock" type="number" min="0" max="2147483647" step="1" required value={quantity} onChange={e=>setQuantity(e.target.value)} disabled={saving}/></label></div>
        <p className="inventoryStockPreview">Stock Status <span className={`inventoryBadge ${stockStatus(Number(quantity),product.reorder).tone}`}>{stockStatus(Number(quantity),product.reorder).label}</span></p>
        <small className="inventoryQuantityNote">Quantity is available, unreserved stock. Low-stock threshold: {product.reorder}. Reserved units remain committed to their reservations.</small>
        {error&&<p className="inventorySaveError" role="alert">{error}</p>}
        <footer><button type="button" className="inventoryCancel" onClick={close} disabled={saving}>Cancel</button><button type="submit" disabled={saving}>{saving?"Saving…":"Save Changes"}</button></footer>
      </form>
    </dialog>
  </article>;
}
