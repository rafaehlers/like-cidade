import { useEffect, useRef, useState } from 'react';
import { AtSign, Check, Copy, Facebook, MessageCircle, Share2 } from 'lucide-react';
import { reportShareData, reportShareLinks, type ShareableIssue } from '../sharing';

export default function IssueShare({issue}:{issue:ShareableIssue}) {
  const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  const linkInput=useRef<HTMLInputElement>(null);
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{setMessage('');setBusy(false);},[issue.id]);
  const data=reportShareData(issue,window.location.origin);const links=reportShareLinks(issue,window.location.origin);
  async function copyLink() {
    try {await navigator.clipboard.writeText(data.url);if(alive.current)setMessage('Link copiado!');}
    catch {if(alive.current){linkInput.current?.focus();linkInput.current?.select();setMessage('Selecione e copie o link abaixo.');}}
  }
  async function share() {
    setBusy(true);setMessage('');
    try {await navigator.share(data);}
    catch(error) {if(alive.current&&(error as DOMException).name!=='AbortError')setMessage('Use uma das opções abaixo ou copie o link.');}
    finally {if(alive.current)setBusy(false);}
  }
  return <section className="issue-share" aria-label="Compartilhar relato">
    <h3><Share2 size={16} aria-hidden="true"/>Compartilhar relato</h3>
    <p>Convide outras pessoas a acompanhar este cuidado.</p>
    <div className="issue-share-options">
      <a href={links.whatsapp} target="_blank" rel="noopener noreferrer" aria-label="Compartilhar no WhatsApp"><MessageCircle size={17} aria-hidden="true"/>WhatsApp</a>
      <a href={links.facebook} target="_blank" rel="noopener noreferrer" aria-label="Compartilhar no Facebook"><Facebook size={17} aria-hidden="true"/>Facebook</a>
      <a href={links.x} target="_blank" rel="noopener noreferrer" aria-label="Compartilhar no X"><AtSign size={17} aria-hidden="true"/>X</a>
      {typeof navigator.share==='function'&&<button type="button" onClick={()=>void share()} disabled={busy}><Share2 size={17} aria-hidden="true"/>{busy?'Abrindo…':'Mais opções'}</button>}
    </div>
    <div className="issue-share-link"><input ref={linkInput} type="url" aria-label="Link público do relato" value={data.url} readOnly onFocus={event=>event.target.select()}/><button type="button" onClick={()=>void copyLink()} aria-label="Copiar link do relato">{message==='Link copiado!'?<Check size={17}/>:<Copy size={17}/>}<span>Copiar link</span></button></div>
    <p className="issue-share-feedback" role="status" aria-live="polite">{message}</p>
  </section>;
}
