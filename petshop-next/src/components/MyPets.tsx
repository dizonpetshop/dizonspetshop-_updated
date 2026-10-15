"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import AdminIcon from "@/components/AdminIcon";
import AddPetForm from "@/components/AddPetForm";
import { archivePet } from "@/app/client/actions";

type Pet = { id:number; petName:string; species:string|null; hasPhoto:boolean };
function PetPhoto({pet,version}:{pet:Pet;version:number}){
 const [failed,setFailed]=useState(false);
 const src=`/api/pets/${pet.id}/image?v=${version}`;
 useEffect(()=>setFailed(false),[src]);
 return <div className={`myPetPhoto ${pet.hasPhoto&&!failed?"hasPhoto":""}`}>{pet.hasPhoto&&!failed?<img src={src} alt={pet.petName} onError={()=>setFailed(true)}/>:<span><AdminIcon name="paw" size={38}/></span>}</div>;
}
export default function MyPets({pets}:{pets:Pet[]}){
 const router=useRouter();
 const [editing,setEditing]=useState<Pet|null>(null),[removing,setRemoving]=useState<Pet|null>(null);
 const [editBusy,setEditBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
 const [versions,setVersions]=useState<Record<number,number>>({});
 const [pending,startTransition]=useTransition();
 const removingRef=useRef(false),addRef=useRef<HTMLDetailsElement>(null),editDialog=useRef<HTMLDialogElement>(null),removeDialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const duration=message==="Pet removed successfully."?3000:message==="Pet profile added successfully."?2000:0;if(!duration)return;const timer=window.setTimeout(()=>setMessage(""),duration);return()=>window.clearTimeout(timer);},[message]);
 useEffect(()=>{if(editing)editDialog.current?.showModal();else editDialog.current?.close();},[editing]);
 useEffect(()=>{if(removing)removeDialog.current?.showModal();else removeDialog.current?.close();},[removing]);
 function openAdd(){if(!addRef.current)return;setMessage("");addRef.current.open=true;addRef.current.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"nearest"});addRef.current.querySelector<HTMLInputElement>('input[name=petName]')?.focus({preventScroll:true});}
 function remove(){if(!removing||removingRef.current||pending)return;const form=new FormData();form.set("id",String(removing.id));form.set("inline","1");removingRef.current=true;setError("");startTransition(async()=>{try{const result=await archivePet(form);if(!result.ok){setError(result.message);return;}setMessage(result.message);setRemoving(null);router.refresh();}catch{setError("Unable to remove this pet. Please try again.");}finally{removingRef.current=false;}});}
 return <div className="myPetsManagement">
 <div className="myPetsToolbar"><span>{pets.length} registered pet{pets.length===1?"":"s"}</span></div>
 {message&&<div className="addPetNotice success myPetsNotice" role="status">{message}</div>}
 <details ref={addRef} className="clientActionPanel addPetPanel"><summary>Add a pet profile</summary><AddPetForm onSaved={notice=>{setMessage(notice);if(addRef.current)addRef.current.open=false;}}/></details>
 {pets.length?<div className="myPetsGrid">{pets.map(pet=><article className="myPetCard" key={pet.id} data-pet-id={pet.id}><PetPhoto pet={pet} version={versions[pet.id]||0}/><div className="myPetInfo"><h2 title={pet.petName}>{pet.petName}</h2><span>{pet.species||"Pet"}</span></div><div className="myPetActions"><button className="myPetEditButton" type="button" onClick={()=>{setEditBusy(false);setEditing(pet);}}><AdminIcon name="edit" size={15}/>Edit Pet</button><button className="myPetRemoveButton" type="button" onClick={()=>{setError("");setRemoving(pet);}}><AdminIcon name="trash" size={15}/>Remove Pet</button></div></article>)}</div>:<div className="myPetsEmpty"><span><AdminIcon name="paw" size={34}/></span><h2>No pets added yet</h2><p>Start by adding your first pet profile.</p><button className="myPetsAddButton" type="button" onClick={openAdd}>Add Your First Pet</button></div>}
 <dialog ref={editDialog} className="myPetDialog" aria-labelledby="edit-pet-title" onCancel={event=>{if(editBusy)event.preventDefault();else setEditing(null);}}><header><div><h2 id="edit-pet-title">Edit Pet Profile</h2><p>Update your pet&apos;s name, type, or photo.</p></div><button className="myPetDialogClose" type="button" disabled={editBusy} aria-label="Close edit pet" onClick={()=>setEditing(null)}><AdminIcon name="close"/></button></header>{editing&&<AddPetForm key={editing.id} pet={{...editing,photoVersion:versions[editing.id]||0}} onPendingChange={setEditBusy} onSaved={notice=>{setVersions(current=>({...current,[editing.id]:Date.now()}));setMessage(notice);setEditing(null);}}/>}</dialog>
 <dialog ref={removeDialog} className="myPetDialog myPetRemoveDialog" role="alertdialog" aria-labelledby="remove-pet-title" aria-describedby="remove-pet-description" onCancel={event=>{if(pending)event.preventDefault();else setRemoving(null);}}><span className="myPetRemoveIcon"><AdminIcon name="trash" size={25}/></span><h2 id="remove-pet-title">Remove {removing?.petName}?</h2><p id="remove-pet-description">This pet will be removed from your active My Pets list and won&apos;t be available for new grooming bookings. Existing appointment history will be preserved.</p>{error&&<div className="addPetNotice error" role="alert">{error}</div>}<div className="myPetConfirmActions"><button type="button" disabled={pending} onClick={()=>setRemoving(null)}>Cancel</button><button className="myPetConfirmRemove" type="button" disabled={pending} onClick={remove}>{pending&&<span className="addPetSpinner" aria-hidden="true"/>}{pending?"Removing…":"Remove Pet"}</button></div></dialog>
 </div>;
}