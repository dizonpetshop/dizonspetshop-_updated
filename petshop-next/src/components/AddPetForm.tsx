"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import AdminIcon from "@/components/AdminIcon";
import { createPet, updatePet } from "@/app/client/actions";

type Errors = { petName?: string; species?: string; photo?: string };
export default function AddPetForm({ pet, onSaved, onPendingChange }: { pet?: { id: number; petName: string; species: string | null; hasPhoto: boolean; photoVersion?: number }; onSaved?: (message: string) => void; onPendingChange?: (pending: boolean) => void }) {
  const id = useId();
  const router = useRouter();
  const [petName, setPetName] = useState(pet?.petName || "");
  const [species, setSpecies] = useState(pet?.species || "Dog");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [checking, setChecking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const selection = useRef(0);

  useEffect(() => {
    if (!photo) { setPreview(pet?.hasPhoto ? `/api/pets/${pet.id}/image?v=${pet.photoVersion || 0}` : ""); return; }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo, pet?.id, pet?.hasPhoto, pet?.photoVersion]);

  function removePhoto() {
    selection.current++; setChecking(false); setPhoto(null);
    if (inputRef.current) inputRef.current.value = "";
    setErrors(current => ({ ...current, photo: undefined }));
  }
  async function selectPhoto(file?: File) {
    if (!file || pending || submitting.current) return;
    const version = ++selection.current;
    setChecking(true); setPhoto(null); setMessage("");
    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error("Choose a JPG, PNG, or WEBP image.");
      if (!file.size || file.size > 1_500_000) throw new Error("Choose an image no larger than 1.5 MB.");
      const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      const jpeg = file.type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const png = file.type === 'image/png' && bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b);
      const webp = file.type === 'image/webp' && new TextDecoder().decode(bytes.slice(0,4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP';
      if (!jpeg && !png && !webp) throw new Error("This file is not a valid JPG, PNG, or WEBP image.");
      if (version === selection.current) { setPhoto(file); setErrors(current => ({ ...current, photo: undefined })); }
    } catch (error) {
      if (version === selection.current) {
        setErrors(current => ({ ...current, photo: error instanceof Error ? error.message : "This photo could not be read." }));
        if (inputRef.current) inputRef.current.value = "";
      }
    } finally { if (version === selection.current) setChecking(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || pending || checking) return;
    const next: Errors = {};
    if (!petName.trim() || petName.trim().length > 100) next.petName = "Enter a pet name of at most 100 characters.";
    if (!["Dog", "Cat", "Other"].includes(species)) next.species = "Select a pet type.";
    if (errors.photo) next.photo = errors.photo;
    setErrors(next); setMessage("");
    if (Object.values(next).some(Boolean)) return;
    const form = new FormData();
    form.set("petName", petName.trim()); form.set("species", species); form.set("inline", "1");
    if (pet) form.set("id", String(pet.id));
    if (photo) form.set("photo", photo);
    submitting.current = true;
    onPendingChange?.(true);
    startTransition(async () => {
      try {
        const result = await (pet ? updatePet(form) : createPet(form));
        setSuccess(result.ok); setMessage(result.message); setErrors(result.fields || {});
        if (result.ok) { if (!pet) { setPetName(""); setSpecies("Dog"); removePhoto(); } router.refresh(); onSaved?.(result.message); }
      } catch { setSuccess(false); setMessage("Your pet could not be saved. Please try again."); }
      finally { submitting.current = false; onPendingChange?.(false); }
    });
  }

  return <form className={`addPetForm ${pet ? "editPetForm" : ""}`} onSubmit={submit} noValidate aria-busy={pending}>
    <div className="addPetFields">
      <label htmlFor={`${id}-name`}>Pet Name<input id={`${id}-name`} name="petName" value={petName} onChange={event => { setPetName(event.target.value); setMessage(""); setErrors(current => ({ ...current, petName: undefined })); }} placeholder="Enter your pet's name" maxLength={100} required disabled={pending} aria-invalid={!!errors.petName} aria-describedby={errors.petName ? `${id}-name-error` : undefined}/>{errors.petName && <small className="addPetError" id={`${id}-name-error`} role="alert">{errors.petName}</small>}</label>
      <label htmlFor={`${id}-type`}>Pet Type<select id={`${id}-type`} name="species" value={species} onChange={event => { setSpecies(event.target.value); setErrors(current => ({ ...current, species: undefined })); }} required disabled={pending} aria-invalid={!!errors.species} aria-describedby={errors.species ? `${id}-type-error` : undefined}><option>Dog</option><option>Cat</option><option>Other</option></select>{errors.species && <small className="addPetError" id={`${id}-type-error`} role="alert">{errors.species}</small>}</label>
    </div>
    <div className="addPetPhotoField"><label htmlFor={`${id}-photo`}>Pet Photo <span className="addPetOptional">Optional</span></label>
      <input ref={inputRef} id={`${id}-photo`} className="addPetFileInput" type="file" name="photo" accept="image/jpeg,image/png,image/webp" disabled={pending} aria-describedby={`${id}-photo-help${errors.photo ? ` ${id}-photo-error` : ''}`} onChange={event => void selectPhoto(event.target.files?.[0])}/>
      <div className={`addPetUpload ${dragging ? "isDragging" : ""}`} onDragOver={event => { event.preventDefault(); if (!pending) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); void selectPhoto(event.dataTransfer.files[0]); }}>
        {preview ? <div className="addPetPhotoPreview"><img src={preview} alt={photo ? "Selected pet photo preview" : `Current photo of ${pet?.petName}`} onError={() => { if (photo) { removePhoto(); setErrors(current => ({ ...current, photo: "This image could not be previewed. Choose a different photo." })); } else setPreview(""); }}/><span><b>{photo?.name || pet?.petName}</b><small>{photo ? "Ready to upload" : "Current pet photo"}</small></span></div> : <div className="addPetUploadPrompt"><span><AdminIcon name="upload" size={23}/></span><div><b>Upload Pet Photo</b><small>Drag and drop an image, or choose a photo.</small></div></div>}
        <div className="addPetPhotoActions"><button type="button" onClick={() => inputRef.current?.click()} disabled={pending || checking}>{checking ? "Checking photo…" : preview ? "Replace photo" : "Choose photo"}</button>{(photo || errors.photo) && <button type="button" className="addPetRemovePhoto" onClick={removePhoto} disabled={pending}>{photo ? "Remove photo" : "Clear selection"}</button>}</div>
      </div>
      <small id={`${id}-photo-help`} className="addPetPhotoHelp">JPG, PNG, or WEBP · Maximum 1.5 MB</small>{errors.photo && <small className="addPetError" id={`${id}-photo-error`} role="alert">{errors.photo}</small>}
    </div>
    {message && <div className={`addPetNotice ${success ? "success" : "error"}`} role={success ? "status" : "alert"}>{message}</div>}
    <div className="addPetFooter"><button className="addPetSubmit" type="submit" disabled={pending || checking}>{pending && <span className="addPetSpinner" aria-hidden="true"/>}{pending ? "Saving pet…" : pet ? "Save Changes" : "Add Pet"}</button></div>
  </form>;
}
