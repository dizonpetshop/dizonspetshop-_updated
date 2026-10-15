"use client";
import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
export default function AppointmentRefresh(){const router=useRouter();useEffect(()=>{const refresh=()=>{if(!document.hidden)router.refresh();};const interval=setInterval(refresh,30000);window.addEventListener('focus',refresh);return()=>{clearInterval(interval);window.removeEventListener('focus',refresh);};},[router]);return null;}
