import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Accessibility, ArrowUpRight, Award, Camera, Check, CircleHelp, Eye, Footprints, Heart, History, LoaderCircle, LockKeyhole, MapPin, Pencil, Plus, Trophy } from 'lucide-react';
import type { Issue, IssueSnapshot, UserId } from '../domain';
import { PEOPLE } from '../domain';
import { LEVELS, PILOT_CITIES, POINT_RULES, type Achievement, type PilotCity, type ProfileDetails, type ProfileUpdate, type PublicProfile } from '../profiles';
import { loadProfile, prepareAvatar, saveProfile } from '../storage';
import Avatar from './Avatar';
import Modal from './Modal';

const date=(value: string)=>new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
const number=(value: number)=>value.toLocaleString('pt-BR');
function BadgeIcon({id}: {id: Achievement['id']}) { const Icon=id==='first-step'?Footprints:id==='accessibility'?Accessibility:Eye;return <Icon size={26} strokeWidth={1.6} />; }

function EditProfile({profile,onCancel,onSave}: {profile: PublicProfile;onCancel:()=>void;onSave:(snapshot:IssueSnapshot)=>void}) {
  const [nickname,setNickname]=useState(profile.nickname);
  const [city,setCity]=useState<PilotCity>(profile.city);
  const [bio,setBio]=useState(profile.bio);
  const [avatar,setAvatar]=useState<string|null|undefined>();
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  const [preparing,setPreparing]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  const mounted=useRef(true);
  const prepareVersion=useRef(0);
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
  async function submit(event:FormEvent) {
    event.preventDefault(); setError('');setSaving(true);
    try { const snapshot=await saveProfile(profile.id,{nickname,city,bio,avatar} as ProfileUpdate);onSave(snapshot); }
    catch(error) {if(mounted.current)setError(error instanceof Error?error.message:'Não foi possível salvar o perfil.');}
    finally {if(mounted.current)setSaving(false);}
  }
  return <form className="edit-profile" onSubmit={submit}>
    <fieldset disabled={saving || preparing}>
      <div className="edit-avatar"><Avatar profile={{...profile,nickname,avatarUrl:avatar===null?undefined:avatar ?? profile.avatarUrl}} size="large"/><div><button type="button" className="button-secondary" onClick={()=>input.current?.click()}><Camera size={16}/>{preparing?'Preparando foto…':'Escolher foto'}</button>{(avatar || (avatar!==null && profile.avatarUrl)) && <button className="text-button" type="button" onClick={()=>{setAvatar(null);if(input.current)input.current.value='';}}>Remover foto</button>}<small>JPG, PNG, WebP ou AVIF · até 15 MB</small></div></div>
      <input className="sr-only" ref={input} aria-label="Foto de perfil" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={async event=>{
        const file=event.target.files?.[0];if(!file)return;const version=++prepareVersion.current;setPreparing(true);setError('');
        try {const prepared=await prepareAvatar(file);if(mounted.current && version===prepareVersion.current)setAvatar(prepared);}
        catch(error){if(mounted.current)setError(error instanceof Error?error.message:'Não foi possível preparar a foto.');}
        finally{if(mounted.current && version===prepareVersion.current)setPreparing(false);}
      }}/>
      <label>Apelido público<input value={nickname} onChange={event=>setNickname(event.target.value)} required minLength={2} maxLength={30} autoComplete="nickname"/><small>É assim que você aparece nos relatos e comentários. Evite usar seu e-mail.</small></label>
      <label>Município<select value={city} onChange={event=>setCity(event.target.value as PilotCity)}>{PILOT_CITIES.map(city=><option key={city}>{city}</option>)}</select></label>
      <label>Sobre você <span>(opcional)</span><textarea value={bio} onChange={event=>setBio(event.target.value)} maxLength={160} rows={3} placeholder="O que você gosta de cuidar na sua cidade?"/><small>{bio.length}/160 caracteres · Esta informação é pública.</small></label>
    </fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-footer"><button type="button" className="button-secondary" disabled={saving} onClick={onCancel}>Cancelar</button><button type="submit" className="button-primary" disabled={saving||preparing}>{saving?<LoaderCircle size={16} className="animate-spin"/>:<Check size={16}/>}Salvar perfil</button></div>
  </form>;
}

export default function UserProfile({id,currentUserId,revision,issues,onClose,onSnapshot,onOpenIssue,onOpenRanking}: {id:UserId;currentUserId:UserId;revision:number;issues:Issue[];onClose:()=>void;onSnapshot:(snapshot:IssueSnapshot)=>void;onOpenIssue:(issue:Issue)=>void;onOpenRanking:()=>void}) {
  const [data,setData]=useState<ProfileDetails>();
  const [error,setError]=useState('');
  const [retry,setRetry]=useState(0);
  const [editing,setEditing]=useState(false);
  const [tab,setTab]=useState<'overview'|'ledger'|'reports'|'rules'>('overview');
  const [filter,setFilter]=useState('all');
  useEffect(()=>{
    const controller=new AbortController();let active=true;setError('');
    loadProfile(id,controller.signal).then(value=>{if(active)setData(value);}).catch(error=>{if(active)setError(error.message);});
    return ()=>{active=false;controller.abort();};
  },[id,revision,retry]);
  const own=id===currentUserId;
  const profile=data?.profile;
  const resident=profile?.role==='resident';
  const reports=issues.filter(issue=>issue.authorId===id);
  const ledger=data?.ledger.filter(entry=>filter==='all'||(filter==='credits'?entry.amount>0:entry.amount<0)) ?? [];
  return <Modal title={editing?'Editar perfil':own?'Meu perfil':'Perfil público'} onClose={onClose} wide>
    <div className="user-profile">
      {error && <div role="alert" className="profile-notice"><span>{error}</span><button type="button" className="text-button" onClick={()=>setRetry(value=>value+1)}>Tentar novamente</button></div>}
      {!data && !error && <div className="profile-loading"><LoaderCircle className="animate-spin"/>Abrindo perfil…</div>}
      {data && profile && (editing?<EditProfile profile={profile} onCancel={()=>setEditing(false)} onSave={snapshot=>{onSnapshot(snapshot);setEditing(false);setRetry(value=>value+1);}}/>:<>
        <div className="profile-hero">
          <div className="profile-identity"><Avatar profile={profile} size="large"/><div><p className="profile-eyebrow">{PEOPLE[id]?.role ?? 'Morador'} · Perfil público</p><h2>{profile.nickname}</h2><p className="profile-city"><MapPin size={14}/>{profile.city}</p></div>{own && <button className="button-secondary profile-edit-button" onClick={()=>setEditing(true)} aria-label="Editar perfil"><Pencil size={14}/><span>Editar perfil</span></button>}</div>
          {profile.bio && <p className="profile-bio">{profile.bio}</p>}
          {resident ? <div className="level-card"><div className="level-emblem"><Trophy size={26}/></div><div className="level-copy"><span>Nível {data.level.level}</span><h3>{data.level.title}</h3><p>{data.nextLevel ? `${number(Math.max(0,data.nextLevel.threshold-data.total))} pontos para ${data.nextLevel.title}`:'Você alcançou o nível mais alto!'}</p><div className="level-track" role="progressbar" aria-label="Progresso para o próximo nível" aria-valuenow={Math.round(data.progress)} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${data.progress}%`}}/></div></div><div className="profile-points"><strong>{number(data.total)}</strong><span>pontos</span></div></div>:<p className="profile-notice">A pontuação e as conquistas são destinadas aos moradores. Este perfil participa da gestão da demonstração.</p>}
          {resident && <div className="profile-ranking-summary"><span>{data.demoPoints>0?`${number(data.demoPoints)} pts fictícios · ${number(data.actualPoints)} pts por ações reais`:'Pontuação por suas contribuições'}</span><button className="text-button" onClick={onOpenRanking}><Trophy size={14}/>Ver ranking</button></div>}
        </div>
        <nav className="profile-tabs" aria-label="Seções do perfil">{([
          ['overview','Visão geral',Award],['ledger','Extrato de pontos',History],['reports',own?'Meus relatos':'Relatos',MapPin],['rules','Como pontuar',CircleHelp],
        ] as const).filter(([key])=>resident || key==='reports' || key==='overview').map(([key,label,Icon])=><button key={key} aria-current={tab===key?'page':undefined} onClick={()=>setTab(key)}><Icon size={16}/>{label}</button>)}</nav>
        <div className="profile-body">
          {tab==='overview' && <>
            {resident && <>{data.demoPoints>0 && <p className="ranking-demo-note">As estatísticas e conquistas abaixo incluem atividades fictícias para testar o perfil.</p>}<div className="profile-stats"><div><MapPin/><strong>{data.stats.reports}</strong><span>relatos</span></div><div><Heart/><strong>{data.stats.supports}</strong><span>apoios</span></div><div><Check/><strong>{data.stats.conclusions}</strong><span>concluídos</span></div></div>
            <div className="profile-section-heading"><div><h3>Conquistas</h3><p>Cada cuidado conta uma história.</p></div><span>{data.achievements.filter(item=>item.earnedAt).length}/{data.achievements.length}</span></div>
            <div className="achievement-grid">{data.achievements.map(item=><article key={item.id} className={`achievement-card ${item.earnedAt?'is-earned':''}`}><div className={`badge-art badge-${item.id}`}><BadgeIcon id={item.id}/>{item.earnedAt?<Check className="badge-check" size={14}/>:<LockKeyhole className="badge-lock" size={13}/>}</div><h4>{item.title}</h4><p>{item.description}</p><span>{item.earnedAt?`Conquistado em ${new Date(item.earnedAt).toLocaleDateString('pt-BR')}`:!item.available?'Aguarda validação de soluções':`${Math.min(item.progress,item.target)} de ${item.target}`}</span></article>)}</div></>}
            <p className="profile-footnote">Os exemplos do mapa não rendem pontos. Este perfil pode incluir atividades fictícias de demonstração, identificadas no extrato. Comentários não pontuam.{resident && ' Conquistas refletem contribuições válidas; estornos podem alterar o progresso.'}</p>
          </>}
          {tab==='ledger' && <><div className="profile-section-heading"><div><h3>Extrato de pontos</h3><p>Créditos e estornos, sem apagar o histórico.</p></div><label className="ledger-filter"><span className="sr-only">Filtrar extrato</span><select value={filter} onChange={event=>setFilter(event.target.value)}><option value="all">Tudo</option><option value="credits">Créditos</option><option value="reversals">Estornos</option></select></label></div>
            {!ledger.length?<div className="profile-empty"><History/><h3>{data.ledger.length?'Nenhum lançamento neste filtro':'Seu próximo cuidado pode ser o primeiro'}</h3><p>{data.ledger.length?'Escolha outro filtro para ver seu histórico.':'Registre uma ocorrência ou apoie o relato de outra pessoa para começar.'}</p></div>:<ol className="ledger-list">{ledger.map(entry=><li key={entry.id}><span className={`ledger-symbol ${entry.amount<0?'is-reversal':''}`}>{entry.amount>0?<Plus size={16}/>:<History size={16}/>}</span><div className="ledger-copy"><strong>{entry.reason}</strong><span>{issues.some(issue=>issue.id===entry.issueId)?<button className="profile-inline-link" onClick={()=>onOpenIssue(issues.find(issue=>issue.id===entry.issueId)!)}>{entry.issueTitle}<ArrowUpRight size={12}/></button>:entry.issueTitle}</span><small>{date(entry.createdAt)}{entry.demo?' · Fictício':''}{entry.city?` · ${entry.city}`:''}{entry.reversesId?' · Estorno de crédito anterior':''}</small></div><div className="ledger-amount"><strong className={entry.amount>0?'credit':'debit'}>{entry.amount>0?'+':''}{entry.amount}</strong><small>Saldo {number(entry.balance)}</small></div></li>)}</ol>}
          </>}
          {tab==='reports' && <><div className="profile-section-heading"><div><h3>{own?'Meus relatos':'Relatos publicados'}</h3><p>{reports.length} {reports.length===1?'ocorrência registrada':'ocorrências registradas'}</p></div></div>{!reports.length?<div className="profile-empty"><MapPin/><h3>Nenhum relato ainda</h3><p>As ocorrências publicadas por este perfil aparecerão aqui.</p></div>:<div className="profile-reports">{reports.map(issue=><button key={issue.id} onClick={()=>onOpenIssue(issue)}>{issue.photo?<img src={issue.photo} alt="" loading="lazy"/>:<span className="report-placeholder"><MapPin/></span>}<span><strong>{issue.title}</strong><small>{issue.category} · {issue.status}{issue.sample?' · Exemplo fictício':''}</small></span><ArrowUpRight size={16}/></button>)}</div>}</>}
          {tab==='rules' && <><div className="profile-section-heading"><div><h3>Quem curte, cuida. E evolui.</h3><p>Pontos por ações que ajudam a cidade.</p></div></div><ul className="point-rules">{POINT_RULES.map(rule=><li key={rule.action}><span>{rule.label}{!rule.available && <small>Disponível quando o fluxo de validação de soluções estiver implementado</small>}</span><b>+{rule.points}</b></li>)}</ul><h3 className="profile-levels-title">Os níveis da vizinhança</h3><ol className="profile-levels">{LEVELS.map(level=><li key={level.level} className={level.level===data.level.level?'current-level':''}><span>{level.level}</span><strong>{level.title}</strong><small>{number(level.threshold)} pts</small></li>)}</ol><p className="profile-footnote">Cada apoio vale uma vez por ocorrência. Retirar o apoio estorna os 2 pontos; apoiar novamente só repõe esse valor. Não é possível apoiar o próprio relato. Remoções pela administração geram estornos. “Resolvida” ainda não significa conclusão confirmada.</p><p className="profile-footnote">Nesta versão, acessibilidade inclui as subcategorias de rampas de acesso e piso tátil em Calçada. O município do perfil não muda a localização dos relatos.</p></>}
        </div>
      </>)}
    </div>
  </Modal>;
}
