"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getReservationProduct } from "@/app/client/actions";
import ProductReserveForm from "./ProductReserveForm";

export default function ProductReservation({ productId, productName, stock, phone, address }: { productId: number; productName: string; stock: number; phone: string; address: string }) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [selected, setSelected] = useState<{ stockQuantity: number; price: number; requestToken: string } | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => { setSelected(null); setMessage(""); }, [productId]);
  useEffect(() => {
    if (stock <= 0) setSelected(null);
    else setSelected((current) => current ? { ...current, stockQuantity: Math.min(current.stockQuantity, stock) } : null);
  }, [stock]);

  async function open() {
    setChecking(true);
    setMessage("");
    try {
      const latest = await getReservationProduct(productId);
      if (!latest || latest.stockQuantity < 1) {
        setSelected(null);
        setMessage("This product is no longer available. Please choose another item.");
        router.refresh();
      } else {
        setSelected(latest);
        router.refresh();
      }
    } catch {
      setMessage("We couldn’t check availability. Please try again.");
    } finally { setChecking(false); }
  }

  return <div className="productReservation">
    <button className={stock > 0 ? "productReserveTrigger" : "outOfStockButton"} type="button" disabled={stock <= 0 || checking} aria-busy={checking} aria-expanded={Boolean(selected)} onClick={open}>Reserve Product</button>
    {checking && <small role="status">Checking availability…</small>}
    {message && <p role="alert">{message}</p>}
    {selected && stock > 0 && <div className="productReservationFields"><ProductReserveForm address={address} phone={phone} productId={productId} productName={productName} stock={selected.stockQuantity} unitPrice={selected.price} requestToken={selected.requestToken}/><button className="productReservationClose" type="button" onClick={() => setSelected(null)}>Close reservation</button></div>}
  </div>;
}
