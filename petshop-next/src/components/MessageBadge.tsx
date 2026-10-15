"use client";
import { useEffect, useState } from "react";
import { notificationUpdatedEvent } from "@/components/NotificationMenu";
export const messageUpdatedEvent = "petshop-messages-updated";
export default function MessageBadge({ portal, kind = "messages" }: { portal: "client" | "admin"; kind?: "messages" | "notifications" }) {
  const [count,setCount]=useState(0);
  useEffect(()=>{
    let active=true;
    const endpoint=kind==='messages'?`/api/messages?portal=${portal}&summary=1`:`/api/${portal}/notifications?take=1`;
    const load=async()=>{if(document.hidden)return;try{const r=await fetch(endpoint,{cache:'no-store'});if(r.ok){const data=await r.json();if(active)setCount(data.count);}}catch{}};
    void load();const timer=setInterval(()=>void load(),10000);
    const event=kind==='messages'?messageUpdatedEvent:notificationUpdatedEvent;
    const refresh=()=>void load();window.addEventListener(event,refresh);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
    return()=>{active=false;clearInterval(timer);window.removeEventListener(event,refresh);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[portal,kind]);
  return count>0?<b className="sidebarUnreadBadge" aria-label={`${count} unread ${kind}`}>{count>99?'99+':count}</b>:null;
}
