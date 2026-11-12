import { useEffect, useState } from 'react';
import { ArrowUpRight, Medal, Trophy, LoaderCircle } from 'lucide-react';
import type { UserId } from '../domain';
import { PILOT_CITIES, type PilotCity } from '../profiles';
import type { RankingPeriod, RankingRow, RankingSnapshot, RankingTheme } from '../ranking';
import { loadRanking } from '../storage';
import Avatar from './Avatar';
import Modal from './Modal';

export default function Ranking({userId,revision,onClose,onOpenProfile}:{userId:UserId;revision:number;onClose:()=>void;onOpenProfile:(id:UserId)=>void}) {
  const [period,setPeriod]=useState<RankingPeriod>('all');const [city,setCity]=useState<PilotCity|'all'>('all');const [theme,setTheme]=useState<RankingTheme>('all');
  const [data,setData]=useState<RankingSnapshot>();const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [retry,setRetry]=useState(0);const [tick,setTick]=useState(0);
  useEffect(()=>{const timer=setInterval(()=>setTick(value=>value+1),60000);return ()=>clearInterval(timer);},[]);
  useEffect(()=>{
    let active=true;const controller=new AbortController();setLoading(true);setError('');
    loadRanking({period,city,theme,userId},controller.signal).then(snapshot=>{if(active)setData(snapshot);}).catch(error=>{if(active)setError(error.message);}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;controller.abort();};
  },[period,city,theme,userId,revision,retry,tick]);
  const row=(item:RankingRow)=><button key={item.profile.id} className={`ranking-row ${item.profile.id===userId?'is-you':''}`} onClick={()=>onOpenProfile(item.profile.id)} aria-label={`${item.position}º lugar: ${item.profile.nickname}, ${item.points} pontos${item.profile.id===userId?', você':''}`}>
    <span className={`ranking-position position-${item.position}`}>{item.position<=3?<Medal size={22}/>:item.position}<small>{item.position<=3?`${item.position}º`:''}</small></span><Avatar profile={item.profile}/><span className="ranking-person"><strong>{item.profile.nickname}{item.profile.id===userId && <em>Você</em>}</strong><small>{city==='all'?'Participação nas cidades do piloto':city}</small></span><span className="ranking-score"><strong>{item.points.toLocaleString('pt-BR')}</strong><small>pontos</small></span><ArrowUpRight size={15}/>
  </button>;
  return <Modal title="Ranking de moradores" onClose={onClose} wide><div className="ranking-page">
    <div className="ranking-intro"><span className="ranking-hero-icon"><Trophy size={28}/></span><div><h2>A vizinhança em ação</h2><p>Cada contribuição ajuda a construir uma cidade melhor.</p></div></div>
    <div className="ranking-filters"><div className="ranking-periods" role="group" aria-label="Período do ranking">{([['week','Esta semana'],['month','Este mês'],['all','Todo o período']] as const).map(([key,label])=><button key={key} aria-pressed={period===key} onClick={()=>setPeriod(key)}>{label}</button>)}</div><div className="ranking-selects"><label>Cidade<select value={city} onChange={event=>setCity(event.target.value as PilotCity|'all')}><option value="all">Todas as cidades</option>{PILOT_CITIES.map(city=><option key={city}>{city}</option>)}</select></label><label>Tipo de contribuição<select value={theme} onChange={event=>setTheme(event.target.value as RankingTheme)}><option value="all">Todas as contribuições</option><option value="reports">Relatos</option><option value="supports">Apoios</option><option value="accessibility">Acessibilidade</option></select></label></div></div>
    {error && <div className="profile-notice" role="alert"><span>{error}</span><button className="text-button" onClick={()=>setRetry(value=>value+1)}>Tentar novamente</button></div>}
    {loading?<div className="profile-loading" role="status"><LoaderCircle className="animate-spin"/>Atualizando classificação…</div>:!error && data && <>
      {data.hasDemo && <p className="ranking-demo-note"><strong>Demonstração com dados fictícios.</strong> Os totais incluem pontuação simulada para testar rankings, níveis e conquistas. Veja a separação no extrato de cada perfil.</p>}
      <div className="ranking-list-heading"><h3>Top 10</h3><span>{data.participants} {data.participants===1?'morador':'moradores'}{city==='all'?'':' com contribuições nesta cidade'}</span></div>
      {!data.rows.length?<div className="profile-empty"><Trophy/><h3>Nenhuma contribuição neste recorte</h3><p>Experimente outra cidade, período ou tipo de contribuição.</p></div>:<div className="ranking-list">{data.rows.map(row)}</div>}
      {data.own && !data.rows.some(item=>item.profile.id===userId) && <div className="ranking-own"><p>Sua posição</p>{row(data.own)}</div>}
      {!data.own && <p className="profile-footnote">Seu perfil não tem contribuições neste recorte ou não é de morador.</p>}
    </>}
    <details className="ranking-method"><summary>Como funciona a classificação</summary><p>A classificação soma os créditos e estornos do período. A semana começa segunda-feira à meia-noite; o mês, no dia 1º, no horário de Brasília. Pessoas empatadas compartilham a posição; a ordem entre elas é estável.</p><p>O filtro de cidade considera onde cada contribuição ocorreu, independentemente do município do perfil. Nas ações reais, a cidade precisa estar identificada na referência do relato; referências sem cidade reconhecida contam apenas no ranking geral. Dados simulados já têm sua cidade definida.</p><p>Acessibilidade reúne relatos sobre rampas de acesso e piso tátil. Gestores e administradores não participam do ranking de moradores. Não há check-in.</p></details>
  </div></Modal>;
}
