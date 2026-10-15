"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import AdminIcon from "@/components/AdminIcon";
import { messageUpdatedEvent } from "@/components/MessageBadge";
import { notificationUpdatedEvent,notificationTime } from "@/components/NotificationMenu";

type Conversation={id:number;name:string;email:string|null;preview:string|null;updatedAt:string;unread:number};
type Message={id:string;senderId:number;senderRole:string;senderName:string;content:string;imageUrl?:string|null;createdAt:string;readAt:string|null};
export default function MessagesPanel({portal,initialConversation}: {portal:'client'|'admin';initialConversation?:number}) {
  const endpoint=`/api/messages?portal=${portal}`;
  const [conversations,setConversations]=useState<Conversation[]>([]);
  const [selected,setSelected]=useState<number|null>(initialConversation||null);
  const [messages,setMessages]=useState<Message[]>([]);
  const [query,setQuery]=useState('');const[search,setSearch]=useState('');
  const[page,setPage]=useState(0);const[moreConversations,setMoreConversations]=useState(false);
  const[moreHistory,setMoreHistory]=useState(false);const[loading,setLoading]=useState(true);
  const[historyLoading,setHistoryLoading]=useState(false);const[sending,setSending]=useState(false);
  const[draft,setDraft]=useState('');const[error,setError]=useState('');const[sendError,setSendError]=useState('');
  const[mobileChat,setMobileChat]=useState(!!initialConversation);
  const [attachment,setAttachment]=useState<File|null>(null),[preview,setPreview]=useState('');const attachmentRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(!attachment){setPreview('');return;}const url=URL.createObjectURL(attachment);setPreview(url);return()=>URL.revokeObjectURL(url);},[attachment]);
  function clearAttachment(){setAttachment(null);if(attachmentRef.current)attachmentRef.current.value='';}
  function chooseImage(file?:File){if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>1500000){setSendError('Choose a JPG, PNG, or WebP image smaller than 1.5 MB.');if(attachmentRef.current)attachmentRef.current.value='';return;}setAttachment(file);setSendError('');}
  const sendingRef=useRef(false);const retry=useRef<{key:string;content:string;conversationId:number;image:File|null}|null>(null);
  const generation=useRef(0);const readThrough=useRef('');const historyRef=useRef<HTMLDivElement>(null);
  const panelRef=useRef<HTMLElement>(null);
  const lastInitial=useRef(initialConversation);
  useEffect(()=>{if(lastInitial.current!==initialConversation&&!sendingRef.current){lastInitial.current=initialConversation;if(initialConversation)open(initialConversation);}},[initialConversation,sending]);
  const composerRef=useRef<HTMLTextAreaElement>(null);const lastMessage=useRef('');
  useEffect(()=>{const timer=setTimeout(()=>{setSearch(query);setPage(0);},250);return()=>clearTimeout(timer);},[query]);
  const request=useCallback(async(body:object|FormData)=>{const r=await fetch(endpoint,{method:'POST',...(body instanceof FormData?{body}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});const data=await r.json();if(!r.ok)throw new Error(data.error||'The message request failed.');return data;},[endpoint]);
  const load=useCallback(async()=>{
    const version=generation.current;
    try{
      const r=await fetch(`${endpoint}&q=${encodeURIComponent(search)}&page=${page}`,{cache:'no-store'});const data=await r.json();if(!r.ok)throw new Error(data.error);
      if(version!==generation.current)return;
      setConversations(data.conversations);setMoreConversations(data.hasMore);setError('');
      if(selected){
        const response=await fetch(`${endpoint}&conversation=${selected}`,{cache:'no-store'});const chat=await response.json();if(!response.ok)throw new Error(chat.error);
        if(version!==generation.current)return;
        setMessages(current=>{const all=new Map(current.map(item=>[item.id,item]));for(const item of chat.messages)all.set(item.id,item);return [...all.values()].sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:1);});
        if(!messagesLoaded.current)setMoreHistory(chat.hasMore);
        messagesLoaded.current=true;
        const last=chat.messages.at(-1)?.id;
        if(last && last!==lastMessage.current){lastMessage.current=last;requestAnimationFrame(()=>{if(historyRef.current)historyRef.current.scrollTop=historyRef.current.scrollHeight;});}
        // Later arrivals stay unread until fetched in a visible chat.
        if(last && !document.hidden && panelRef.current?.getClientRects().length && (window.innerWidth>700||mobileChat) && readThrough.current!==last){
          await request({action:'read',conversationId:selected,throughId:last});
          if(version!==generation.current)return;
          readThrough.current=last;setConversations(current=>current.map(c=>c.id===selected?{...c,unread:0}:c));window.dispatchEvent(new Event(messageUpdatedEvent));
        }
      }
    }catch(e){if(version===generation.current)setError(e instanceof Error?e.message:'Messages could not be loaded.');}
    finally{if(version===generation.current)setLoading(false);}
  },[endpoint,search,page,selected,mobileChat,request]);
  const messagesLoaded=useRef(false);
  useEffect(()=>{
    generation.current++;setLoading(true);void load();
    const refresh=()=>{if(!document.hidden)void load();};const timer=setInterval(refresh,5000);
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
    return()=>{generation.current++;clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[load]);
  function open(id:number){if(sendingRef.current)return;generation.current++;setSelected(id);setMessages([]);messagesLoaded.current=false;readThrough.current='';lastMessage.current='';setMobileChat(true);setDraft('');clearAttachment();setSendError('');retry.current=null;}
  async function start(){if(sendingRef.current)return;sendingRef.current=true;setSending(true);setSendError('');try{const data=await request({action:'start'});openAfterStart(data.conversationId);}catch(e){setSendError(e instanceof Error?e.message:'Conversation could not be started.');}finally{sendingRef.current=false;setSending(false);}}
  function openAfterStart(id:number){generation.current++;setSelected(id);setMessages([]);messagesLoaded.current=false;setMobileChat(true);readThrough.current='';}
  async function send(){
    if(!selected||sendingRef.current||(!draft.trim()&&!attachment))return;
    const content=draft.trim();if(content.length>2000){setSendError('Messages can contain at most 2,000 characters.');return;}
    sendingRef.current=true;setSending(true);setSendError('');
    if(!retry.current||retry.current.content!==content||retry.current.conversationId!==selected||retry.current.image!==attachment)retry.current={key:crypto.randomUUID().replaceAll('-',''),content,conversationId:selected,image:attachment};
    try{const fields={action:'send',conversationId:selected,content,requestKey:retry.current.key};let payload:typeof fields|FormData=fields;if(attachment){payload=new FormData();for(const [key,value] of Object.entries(fields))payload.set(key,String(value));payload.set('image',attachment);}const data=await request(payload);setMessages(current=>current.some(m=>m.id===data.message.id)?current:[...current,data.message]);setDraft('');clearAttachment();retry.current=null;window.dispatchEvent(new Event(messageUpdatedEvent));window.dispatchEvent(new Event(notificationUpdatedEvent));await load();composerRef.current?.focus();}
    catch(e){setSendError(e instanceof Error?e.message:'Your message could not be sent. Please try again.');}
    finally{sendingRef.current=false;setSending(false);}
  }
  async function older(){if(!selected||!messages.length||historyLoading)return;setHistoryLoading(true);try{const r=await fetch(`${endpoint}&conversation=${selected}&before=${messages[0].id}`,{cache:'no-store'});const data=await r.json();if(!r.ok)throw new Error(data.error);setMessages(current=>{const all=new Map([...data.messages,...current].map((item:Message)=>[item.id,item]));return [...all.values()];});setMoreHistory(data.hasMore);}catch(e){setError(e instanceof Error?e.message:'History could not be loaded.');}finally{setHistoryLoading(false);}}
  const active=conversations.find(c=>c.id===selected);
  return <section ref={panelRef} className={`messagingWorkspace ${mobileChat?'showChat':''}`} aria-label="Messages">
    <aside className="chatConversations"><header>{portal==='admin'&&<h2>Support Inbox</h2>}<small>{portal==='admin'?'Customer conversations':'Your conversation with shop support'}</small></header>{portal==='admin'&&<label className="chatSearch"><AdminIcon name="search" size={17}/><input placeholder="Search customer name or email" value={query} onChange={e=>setQuery(e.target.value)} aria-label="Search conversations"/></label>}
      <div className="chatConversationList">{loading&&!conversations.length?<p className="chatState" role="status">Loading conversations…</p>:conversations.length?conversations.map(c=><button type="button" className={c.id===selected?'active':''} key={c.id} disabled={sending} onClick={()=>open(c.id)} aria-pressed={c.id===selected}><span className="chatAvatar">{c.name.split(/\s+/).slice(0,2).map(n=>n[0]).join('').toUpperCase()}</span><span className="chatConversationCopy"><b>{c.name}</b><small>{c.preview||'No messages yet'}</small><time dateTime={c.updatedAt}>{notificationTime(c.updatedAt)}</time></span>{c.unread>0&&<b className="chatUnreadBadge">{c.unread>99?'99+':c.unread}</b>}</button>):<div className="chatState"><AdminIcon name="message" size={30}/><b>{search?'No matching conversations':portal==='admin'?'No conversations yet':'No messages yet'}</b><p>{search?'Try another customer name or email.':portal==='admin'?'Customer messages will appear here.':'Have a question? Send a message to our support team.'}</p>{portal==='client'&&!search&&<button type="button" disabled={sending} onClick={()=>void start()}>{sending?'Starting…':'Start Conversation'}</button>}</div>}</div>
      {portal==='admin'&&(page>0||moreConversations)&&<div className="chatPagination"><button type="button" disabled={!page} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page+1}</span><button type="button" disabled={!moreConversations} onClick={()=>setPage(p=>p+1)}>Next</button></div>}
    </aside>
    <div className="chatWindow">{selected?<><header><button className="chatBack" type="button" disabled={sending} onClick={()=>setMobileChat(false)} aria-label="Back to conversations"><AdminIcon name="back" size={20}/></button><div><h2>{active?.name||(portal==='client'?"Dizon's Shop Support":'Customer conversation')}</h2><small>{portal==='client'?'Our team will reply here.':active?.email||'Shared shop support inbox'}</small></div></header>
      <div className="chatHistory" ref={historyRef} aria-label="Message history" aria-live="polite" aria-relevant="additions text">{moreHistory&&<button className="chatOlder" type="button" disabled={historyLoading} onClick={()=>void older()}>{historyLoading?'Loading…':'Load earlier messages'}</button>}{loading&&!messages.length?<p className="chatState" role="status">Loading messages…</p>:messages.length?messages.map(m=>{const outgoing=portal==='client'?m.senderRole==='User':m.senderRole!=='User';return <article className={`chatMessage ${outgoing?'outgoing':'incoming'}`} key={m.id}><small>{outgoing?(portal==='client'?'You':'Support team'):(portal==='client'?'Shop support':m.senderName)}</small>{m.imageUrl&&<a className="chatImageLink" href={m.imageUrl} target="_blank" rel="noopener noreferrer" aria-label="Open message image"><img src={m.imageUrl} alt="Shared message image" loading="lazy"/></a>}{m.content&&<p>{m.content}</p>}<time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'Asia/Manila'})}</time></article>;}):<div className="chatState"><AdminIcon name="message" size={30}/><b>No messages yet</b><p>Have a question? Send a message to our support team.</p></div>}</div>
      {preview&&<div className="chatAttachmentPreview"><img src={preview} alt="Image ready to send"/><div><b>{attachment?.name}</b><small>JPG, PNG or WebP / Maximum 1.5 MB</small></div><button type="button" disabled={sending} onClick={clearAttachment} aria-label="Remove selected image"><AdminIcon name="close" size={18}/></button></div>}<form className="chatComposer" onSubmit={e=>{e.preventDefault();void send();}}><input ref={attachmentRef} className="chatImageInput" type="file" accept="image/jpeg,image/png,image/webp" disabled={sending} onChange={e=>chooseImage(e.target.files?.[0])} aria-label="Choose message image"/><button className="chatAttachButton" type="button" disabled={sending} onClick={()=>attachmentRef.current?.click()} aria-label="Attach image" title="Attach image"><AdminIcon name="image" size={23}/></button><label className="notificationSrOnly" htmlFor={`chat-compose-${portal}`}>Message</label><textarea id={`chat-compose-${portal}`} ref={composerRef} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Write a message…" maxLength={2000} rows={2} disabled={sending} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}}/><button type="submit" disabled={sending||(!draft.trim()&&!attachment)}><AdminIcon name="send" size={18}/>{sending?'Sending…':'Send'}</button></form>
    </>:<div className="chatWelcome"><AdminIcon name="message" size={44}/><h2>{portal==='client'?'Chat with Dizon’s support':'Your support inbox'}</h2><p>Select a conversation to read and reply.</p>{portal==='client'&&conversations.length===0&&<button type="button" disabled={sending} onClick={()=>void start()}>Start Conversation</button>}</div>}</div>
    {(error||sendError)&&<div className="chatError" role="alert">{sendError||error}{error&&<button type="button" onClick={()=>void load()}>Retry loading</button>}{sendError&&selected&&(draft.trim()||attachment)&&<button type="button" disabled={sending} onClick={()=>void send()}>Retry send</button>}</div>}
  </section>;
}
