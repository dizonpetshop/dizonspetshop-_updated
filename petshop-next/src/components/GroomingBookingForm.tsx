"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { bookGrooming, getGroomingSlots } from "@/app/client/actions";


type Option = { id: number; label: string };

function SubmitButton({ unavailable }: { unavailable: boolean }) {
  const { pending } = useFormStatus();
  return <button disabled={pending || unavailable} type="submit">{pending ? "Submitting..." : "Submit appointment"}</button>;
}

export default function GroomingBookingForm({ pets, styles, groomers, customerName, phone, address, minimumDate, requestToken, prices, addons }: { pets: Option[]; styles: Option[]; groomers: Option[]; customerName: string; phone: string; address: string; minimumDate: string; requestToken: string; prices: { styleId: number; petSize: string; price: number }[]; addons: { id: number; label: string; price: number }[]; completedVisits?:number; vipMember?:boolean }) {
  const [selectedAddons, setSelectedAddons] = useState<number[]>([]);
  const [homeService, setHomeService] = useState(false);
  const [petId, setPetId] = useState(pets[0]?.id || 0);
  const [groomerId, setGroomerId] = useState(groomers[0]?.id || 0);
  const [styleId, setStyleId] = useState(styles[0]?.id || 0);
  const sizes = prices.filter((item) => item.styleId === styleId);
  const [petSize, setPetSize] = useState(sizes[0]?.petSize || "Small");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const maximumDate = new Date(new Date(`${minimumDate}T00:00:00Z`).getTime() + 90 * 86400000).toISOString().slice(0, 10);
  useEffect(() => {
    let current = true;
    setSlots([]); setError("");
    if (!date) return;
    setLoading(true);
    getGroomingSlots(petId, groomerId, date).then((items) => { if (current) setSlots(items); }).catch(() => { if (current) setError("Could not check time slots. Choose the date again to retry."); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [date, petId, groomerId]);
  const basePrice = prices.find((item) => item.styleId === styleId && item.petSize === petSize)?.price;
  const price = basePrice === undefined ? undefined : basePrice + addons.filter((item) => selectedAddons.includes(item.id)).reduce((sum, item) => sum + item.price, 0);

  return <form action={bookGrooming} className="clientActionForm bookingForm">
    <input type="hidden" name="requestToken" value={requestToken}/>
    <label>Pet<select name="petId" value={petId} onChange={(event) => setPetId(Number(event.target.value))}>{pets.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
    <label>Hairstyle / package<select name="styleId" value={styleId} onChange={(event) => { const id = Number(event.target.value); setStyleId(id); setPetSize(prices.find((item) => item.styleId === id)?.petSize || ""); }}>{styles.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
    <label>Pet size<select name="petSize" value={petSize} onChange={(event) => setPetSize(event.target.value)}>{sizes.map((item) => <option key={item.petSize}>{item.petSize}</option>)}</select></label>
    <label>Groomer<select name="groomerId" value={groomerId} onChange={(event) => setGroomerId(Number(event.target.value))}>{groomers.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
    <label>Service type<select name="bookingType" onChange={(event) => setHomeService(event.target.value === "Home Service")}><option value="Salon">Store Grooming</option><option>Home Service</option></select></label>
    <label>Date<input name="date" type="date" min={minimumDate} max={maximumDate} required value={date} onChange={(event) => setDate(event.target.value)}/></label>
    <label>Time<select name="time" required key={`${date}-${groomerId}-${petId}`} defaultValue="" disabled={loading || !slots.length}><option value="">{loading ? "Checking availability…" : slots.length ? "Select an available time" : "Choose a date with available slots"}</option>{slots.map((slot) => <option key={slot}>{slot}</option>)}</select></label>
    {date && !loading && !slots.length && <p role="status">{error || "No available slots. Choose another date or groomer."}</p>}
    {addons.length > 0 && <fieldset className="wideField bookingAddons"><legend>Optional add-ons</legend>{addons.map((item) => <label key={item.id}><input type="checkbox" name="addonIds" value={item.id} checked={selectedAddons.includes(item.id)} onChange={(event) => setSelectedAddons((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))}/>{item.label} - {new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(item.price)}</label>)}</fieldset>}
    <p className="wideField">Service subtotal: <strong>{price === undefined ? "Select a valid package and size" : new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(price)}</strong></p>
    {homeService && <>
      <label>Customer name<input name="contactName" defaultValue={customerName} required /></label>
      <label>Contact number<input inputMode="tel" name="contactNumber" defaultValue={phone} pattern="(?:\+63|0)9[0-9]{9}" placeholder="09XXXXXXXXX" required /></label>
      <label className="wideField">Complete address<textarea name="address" defaultValue={address} rows={3} required /></label>
    </>}
    <label className="wideField">Special instructions<textarea name="instructions" rows={3} /></label>
    <SubmitButton unavailable={loading || !slots.length || price === undefined}/>
  </form>;
}
