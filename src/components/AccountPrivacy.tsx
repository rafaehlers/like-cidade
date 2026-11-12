import { useEffect, useState } from 'react';
import { Download, LoaderCircle, Mail, ShieldCheck, Trash2 } from 'lucide-react';
import { deleteMyAccount, exportMyData, loadPrivacyCapabilities } from '../storage';
import { LEGAL_CONTACT, privacyMailto, type DeletionReceipt, type PrivacyCapabilities } from '../legal';
import Modal from './Modal';
import LegalLinks from './LegalLinks';

function download(value:unknown,filename:string) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=filename;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export default function AccountPrivacy({profileId,onBusyChange}:{profileId:string;onBusyChange:(busy:boolean)=>void}) {
  const [capabilities,setCapabilities]=useState<PrivacyCapabilities>();
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const [confirm,setConfirm]=useState(false);const [confirmation,setConfirmation]=useState('');const [acknowledged,setAcknowledged]=useState(false);
  const [receipt,setReceipt]=useState<DeletionReceipt>();
  useEffect(()=>{const controller=new AbortController();loadPrivacyCapabilities(controller.signal).then(setCapabilities).catch(error=>{if(!controller.signal.aborted)setError(error.message);});return()=>controller.abort();},[]);
  useEffect(()=>{onBusyChange(busy);return()=>onBusyChange(false);},[busy,onBusyChange]);
  const ownSession=capabilities?.accountId===profileId;
  async function exportData(){setBusy(true);setError('');try{download(await exportMyData(),'like-cidade-meus-dados.json');}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
  async function erase(){setBusy(true);setError('');try{const value=await deleteMyAccount(confirmation,acknowledged);try{localStorage.removeItem('like-cidade-user');localStorage.removeItem('like-cidade-role');}catch{/* Deletion is complete even when browser storage is unavailable. */}setReceipt(value);setConfirm(false);}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
  return <section className="account-privacy" aria-labelledby="account-privacy-title">
    <h3 id="account-privacy-title"><ShieldCheck size={21} aria-hidden="true"/>Privacidade e dados</h3>
    <p>Você controla as informações da sua conta. Consulte as políticas, baixe uma cópia ou solicite a exclusão.</p>
    <LegalLinks/>
    {!capabilities&&!error&&<p role="status"><LoaderCircle size={16} className="animate-spin"/>Verificando os recursos da sua conta…</p>}
    {capabilities?.verified&&!ownSession&&<p className="account-privacy-notice">A sessão verificada não corresponde a este perfil. Abra o perfil da conta conectada para gerenciar os dados.</p>}
    {capabilities?.reason&&<p className="account-privacy-notice" id="privacy-access-hint">{capabilities.reason}</p>}
    <div className="account-privacy-actions">
      <article><h4>Baixar meus dados</h4><p>Arquivo JSON com perfil, fotos, relatos, comentário enviado, apoios, pontos e seus registros de atendimento. Não inclui dados privados de outras pessoas.</p><button type="button" className="button-secondary" disabled={busy||!capabilities?.canExport||!ownSession} aria-describedby={capabilities?.reason?'privacy-access-hint':undefined} onClick={()=>void exportData()}>{busy?<LoaderCircle size={16} className="animate-spin"/>:<Download size={16}/>}Baixar meus dados</button></article>
      <article><h4>Excluir conta e dados</h4><p>Remove seu perfil, fotos, relatos, apoios e pontuação da base ativa. O próximo passo explica o alcance da exclusão e pede sua confirmação.</p><button type="button" className="button-secondary account-delete-button" disabled={busy||!capabilities?.canDelete||!ownSession} aria-describedby={capabilities?.reason?'privacy-access-hint':undefined} onClick={()=>{setConfirmation('');setAcknowledged(false);setError('');setConfirm(true);}}><Trash2 size={16}/>Excluir conta e dados</button></article>
    </div>
    <div className="account-privacy-contact"><h4>Solicitar atendimento</h4><p>Para acesso, correção, exclusão, informação sobre compartilhamento ou outro direito, fale com {LEGAL_CONTACT.controller}. Não envie senhas ou documentos sensíveis espontaneamente.</p><a className="button-secondary" href={privacyMailto()}><Mail size={16}/>{LEGAL_CONTACT.email}</a><a className="text-button" href={privacyMailto('Solicitação de exclusão de conta e dados — Like Cidade')}>Solicitar exclusão por e-mail</a></div>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {confirm&&<Modal title="Excluir conta e dados?" onClose={()=>{if(!busy)setConfirm(false);}}><form className="account-delete-confirm" onSubmit={event=>{event.preventDefault();void erase();}}>
      <p>Esta ação é permanente. Antes de continuar, você pode voltar e baixar seus dados.</p><ul><li>Seu perfil, foto, vínculos de acesso, relatos e fotos publicados, apoios e pontos serão removidos.</li><li>Interações e pontos ligados aos seus relatos também deixam de estar disponíveis.</li><li>Atendimentos que você fez em relatos de outras pessoas ficam sem seu nome, comentário e foto, preservando apenas a sequência de status e prioridade.</li><li>Backups e cópias de fornecedores ou de quem recebeu um compartilhamento precisam de verificação pelo responsável. Eventuais hipóteses legais de conservação serão informadas no atendimento.</li></ul>
      <fieldset disabled={busy}><label className="account-delete-ack"><input type="checkbox" checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)} required/><span>Entendi o alcance da exclusão e que ela não pode ser desfeita.</span></label><label>Digite EXCLUIR MINHA CONTA<input value={confirmation} onChange={e=>setConfirmation(e.target.value)} required autoComplete="off" spellCheck={false}/></label></fieldset>
      {error&&<p className="form-error" role="alert">{error}</p>}<div className="modal-footer"><button type="button" className="button-secondary" disabled={busy} onClick={()=>setConfirm(false)}>Cancelar</button><button type="submit" className="button-primary" disabled={busy||confirmation!=='EXCLUIR MINHA CONTA'||!acknowledged}>{busy?<LoaderCircle size={16} className="animate-spin"/>:<Trash2 size={16}/>}Excluir minha conta</button></div>
    </form></Modal>}
    {receipt&&<Modal title="Conta excluída" onClose={()=>window.location.replace('/conta-excluida')}><div className="account-delete-confirm"><p>A exclusão da base ativa foi concluída. Guarde este comprovante para acompanhar qualquer solicitação sobre backups ou fornecedores.</p><p className="deletion-receipt">Protocolo: {receipt.receiptId}</p><p>{new Date(receipt.completedAt).toLocaleString('pt-BR')}</p><div className="modal-footer"><button className="button-secondary" onClick={()=>download(receipt,'like-cidade-comprovante-exclusao.json')}>Baixar comprovante</button><button className="button-primary" onClick={()=>window.location.replace('/conta-excluida')}>Concluir</button></div></div></Modal>}
  </section>;
}
