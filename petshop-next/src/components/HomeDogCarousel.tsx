"use client";

import {useEffect,useState} from 'react';

const photos=[
  {src:'/assets/dogs/tan-dog.jpg',alt:'A freshly groomed tan dog with a rounded haircut'},
  {src:'/assets/dogs/brown-dog.jpg',alt:'A brown dog with a rounded teddy-style trim'},
  {src:'/assets/dogs/white-dog.jpg',alt:'A white dog posing after grooming'},
  {src:'/assets/dogs/cream-dog.jpg',alt:'A fluffy cream dog at the grooming salon'},
  {src:'/assets/dogs/black-tan-dog.jpg',alt:'A black and tan dog standing on the grooming table'},
];

export default function HomeDogCarousel(){
  const [index,setIndex]=useState(0),[reduced,setReduced]=useState(true),[visible,setVisible]=useState(true);
  useEffect(()=>{
    const media=window.matchMedia('(prefers-reduced-motion: reduce)');
    const motion=()=>setReduced(media.matches);
    const visibility=()=>setVisible(document.visibilityState==='visible');
    motion();visibility();media.addEventListener('change',motion);document.addEventListener('visibilitychange',visibility);
    return()=>{media.removeEventListener('change',motion);document.removeEventListener('visibilitychange',visibility);};
  },[]);
  const playing=!reduced&&visible;
  useEffect(()=>{if(!playing)return;const timer=window.setInterval(()=>setIndex(value=>(value+1)%photos.length),5000);return()=>window.clearInterval(timer);},[playing]);
  return <section className="homeDogCarousel" aria-label="Dogs groomed at Dizon's" aria-roledescription="carousel">
    <div className="homeDogSlides" aria-live={playing?'off':'polite'}>
      {photos.map((photo,position)=><figure className="homeDogSlide" key={photo.src} hidden={position!==index} role="group" aria-roledescription="slide" aria-label={`${position+1} of ${photos.length}`}><img src={photo.src} alt={photo.alt} loading={position===0?'eager':'lazy'} decoding="async" fetchPriority={position===0?'high':'auto'}/></figure>)}
    </div>
  </section>;
}
