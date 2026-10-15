"use client";

import { useState, type ReactNode } from "react";
import Image, { type StaticImageData } from "next/image";
import AdminIcon from "@/components/AdminIcon";
import shaved from "../../public/hairstyles/kalbo.jpg";
import summer from "../../public/hairstyles/summer.jpg";
import bear from "../../public/hairstyles/bear.jpg";
import puppy from "../../public/hairstyles/puppy.jpg";
import asian from "../../public/hairstyles/asian fusion.jpg";

const photos: Record<string, StaticImageData> = { "Shaved / Kalbo": shaved, "Summer Cut": summer, "Bear Cut": bear, "Puppy Cut": puppy, "Asian Fusion": asian };
const names = Object.keys(photos);
const sizes = ["Small", "Medium", "Large", "Extra Large", "Giant"];
const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
type Style = { id: number; name: string; prices: { id: number; size: string; amount: string }[] };

function HaircutPhoto({ name, thumbnail = false }: { name: string; thumbnail?: boolean }) {
  const [failed, setFailed] = useState(false);
  const photo = photos[name];
  return photo && !failed ? <Image src={photo} alt={thumbnail ? "" : `${name} grooming style`} fill sizes={thumbnail ? "64px" : "(min-width:1200px) 550px, (min-width:768px) 50vw, 100vw"} placeholder="blur" onError={() => setFailed(true)} /> : <div className="haircutPlaceholder"><AdminIcon name="scissors" size={thumbnail ? 24 : 48}/>{!thumbnail && <span>Photo unavailable for {name}</span>}</div>;
}

export default function HaircutGallery({ styles, children }: { styles: Style[]; children?: ReactNode }) {
  const ordered = [...styles].sort((a, b) => (names.includes(a.name) ? names.indexOf(a.name) : names.length) - (names.includes(b.name) ? names.indexOf(b.name) : names.length));
  const [selected, setSelected] = useState(ordered[0]?.id);
  const active = ordered.find(style => style.id === selected) || ordered[0];
  if (!active) return <div className="dashboardEmpty">Haircut pricing is currently unavailable.</div>;
  const rows = [...sizes, ...active.prices.map(row => row.size).filter(size => !sizes.includes(size))];
  return <section className="haircutGallery" aria-label="Grooming haircut gallery">
    <header className="haircutHeading"><h2>Grooming Haircuts</h2></header>
    <div className="haircutSelectors" role="group" aria-label="Choose a haircut">
      {ordered.map(style => <button type="button" key={style.id} className={active.id === style.id ? "isSelected" : ""} aria-pressed={active.id === style.id} aria-controls="haircut-preview" onClick={() => setSelected(style.id)}><span className="haircutThumbnail"><HaircutPhoto key={style.name} name={style.name} thumbnail/></span><span>{style.name}</span>{active.id === style.id && <span className="haircutSelected" aria-label="Selected">✓</span>}</button>)}
    </div>
    <div className="groomingWorkspace"><div className="haircutPreview" id="haircut-preview">
      <div className="haircutMainImage"><HaircutPhoto key={active.name} name={active.name}/></div>
      <div className="haircutInformation"><small>HAIRCUT PRICING</small><h3 aria-live="polite" aria-atomic="true">{active.name}</h3>
        <table><caption className="notificationSrOnly">{active.name} prices by pet size</caption><thead><tr><th scope="col">Pet Size</th><th scope="col">Price</th></tr></thead><tbody>{rows.map(size => { const matches = active.prices.filter(row => row.size === size); return <tr key={size}><th scope="row">{size}</th><td>{matches.length ? matches.map(row => <span key={row.id}>{peso.format(Number(row.amount))}</span>) : <span className="haircutPriceMissing">Not configured</span>}</td></tr>; })}</tbody></table>
      </div>
    </div><div className="groomingBookingPane">{children}</div></div>
  </section>;
}
