import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUpRight, Building2, ChevronRight, Medal, Trophy, LoaderCircle, Users } from 'lucide-react';
import type { UserId } from '../domain';
import { PILOT_CITIES, type PilotCity } from '../profiles';
import type { CityRankingRow, RankingPeriod, RankingRow, RankingSnapshot, RankingTheme } from '../ranking';
import { loadRanking } from '../storage';
import Avatar from './Avatar';
import Modal from './Modal';

type RankingTab='residents'|'cities';
const number=(value:number)=>value.toLocaleString('pt-BR');
function Position({value}:{value:number}) {
  return <span className={`ranking-position position-${value}`}>{value<=3?<Medal size={22}/>:value}<small>{value<=3?`${value}º`:''}</small></span>;
}

export default function Ranking({userId,revision,onClose,onOpenProfile}:{userId:UserId;revision:number;onClose:()=>void;onOpenProfile:(id:UserId)=>void}) {
  const [tab,setTab]=useState<RankingTab>('residents');
  const [period,setPeriod]=useState<RankingPeriod>('all');const [city,setCity]=useState<PilotCity|'all'>('all');const [theme,setTheme]=useState<RankingTheme>('all');
  const [data,setData]=useState<RankingSnapshot>();const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [retry,setRetry]=useState(0);const [tick,setTick]=useState(0);
  const tabId=useId();const tabRefs=useRef<Partial<Record<RankingTab,HTMLButtonElement|null>>>({});
  const requestedCity=tab==='cities'?'all':city;
  const currentData=data?.period===period&&data.city===requestedCity&&data.theme===theme?data:undefined;
  useEffect(()=>{const timer=setInterval(()=>setTick(value=>value+1),60000);return ()=>clearInterval(timer);},[]);
  useEffect(()=>{
    let active=true;const controller=new AbortController();setLoading(true);setError('');
    loadRanking({period,city:requestedCity,theme,userId},controller.signal).then(snapshot=>{if(active)setData(snapshot);}).catch(error=>{if(active)setError(error.message);}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;controller.abort();};
  },[period,requestedCity,theme,userId,revision,retry,tick]);
  function navigateTabs(event:KeyboardEvent<HTMLButtonElement>) {
    let next:RankingTab;
    if(event.key==='ArrowLeft'||event.key==='ArrowRight')next=tab==='residents'?'cities':'residents';
    else if(event.key==='Home')next='residents';else if(event.key==='End')next='cities';else return;
    event.preventDefault();setTab(next);tabRefs.current[next]?.focus();
  }
  function openCity(value:PilotCity) {setCity(value);setTab('residents');tabRefs.current.residents?.focus();}
  const row=(item:RankingRow)=><button key={item.profile.id} className={`ranking-row ${item.profile.id===userId?'is-you':''}`} onClick={()=>onOpenProfile(item.profile.id)} aria-label={`${item.position}º lugar: ${item.profile.nickname}, ${item.points} pontos${item.profile.id===userId?', você':''}`}>
    <Position value={item.position}/><Avatar profile={item.profile}/><span className="ranking-person"><strong>{item.profile.nickname}{item.profile.id===userId && <em>Você</em>}</strong><small>{city==='all'?'Participação nas cidades do piloto':city}</small></span><span className="ranking-score"><strong>{number(item.points)}</strong><small>pontos</small></span><ArrowUpRight size={15}/>
  </button>;
  const cityRow=(item:CityRankingRow)=><button key={item.city} className="ranking-row city-ranking-row" onClick={()=>openCity(item.city)} aria-label={`${item.position}º lugar: ${item.city}, ${item.points} pontos. Ver moradores desta cidade`}>
    <Position value={item.position}/><span className="ranking-city-icon"><Building2 size={23} aria-hidden="true"/></span><span className="ranking-person"><strong>{item.city}</strong><small>{number(item.participants)} {item.participants===1?'morador participante':'moradores participantes'}</small></span><span className="ranking-score"><strong>{number(item.points)}</strong><small>pontos</small></span><ChevronRight size={16}/>
  </button>;
  return <Modal title="Ranking" onClose={onClose} wide><div className="ranking-page">
    <div className="ranking-tabs" role="tablist" aria-label="Tipo de ranking">{([['residents','Moradores',Users],['cities','Cidades',Building2]] as const).map(([key,label,Icon])=><button key={key} ref={element=>{tabRefs.current[key]=element;}} id={`${tabId}-${key}-tab`} role="tab" type="button" aria-selected={tab===key} aria-controls={`${tabId}-${key}-panel`} tabIndex={tab===key?0:-1} onClick={()=>setTab(key)} onKeyDown={navigateTabs}><Icon size={17} aria-hidden="true"/>{label}</button>)}</div>
    <div role="tabpanel" id={`${tabId}-${tab}-panel`} aria-labelledby={`${tabId}-${tab}-tab`} tabIndex={0}>
      <div className="ranking-intro"><span className="ranking-hero-icon">{tab==='cities'?<Building2 size={28}/>:<Trophy size={28}/>}</span><div><h2>{tab==='cities'?'Cidades em ação':'A vizinhança em ação'}</h2><p>{tab==='cities'?'Pontos somados pelas contribuições feitas em cada cidade.':'Cada contribuição ajuda a construir uma cidade melhor.'}</p></div></div>
      <div className="ranking-filters"><div className="ranking-periods" role="group" aria-label="Período do ranking">{([['week','Esta semana'],['month','Este mês'],['all','Todo o período']] as const).map(([key,label])=><button key={key} aria-pressed={period===key} onClick={()=>setPeriod(key)}>{label}</button>)}</div><div className={`ranking-selects ${tab==='cities'?'ranking-selects-cities':''}`}>{tab==='residents'&&<label>Cidade<select value={city} onChange={event=>setCity(event.target.value as PilotCity|'all')}><option value="all">Todas as cidades</option>{PILOT_CITIES.map(city=><option key={city}>{city}</option>)}</select></label>}<label>Tipo de contribuição<select value={theme} onChange={event=>setTheme(event.target.value as RankingTheme)}><option value="all">Todas as contribuições</option><option value="reports">Relatos</option><option value="supports">Apoios</option><option value="accessibility">Acessibilidade</option></select></label></div></div>
      {error && <div className="profile-notice" role="alert"><span>{error}</span><button className="text-button" onClick={()=>setRetry(value=>value+1)}>Tentar novamente</button></div>}
      {loading||(!currentData&&!error)?<div className="profile-loading" role="status"><LoaderCircle className="animate-spin"/>Atualizando classificação…</div>:!error && currentData && (tab==='cities'?<>
        <div className="ranking-list-heading"><h3>Classificação das cidades</h3><span>{currentData.cityRows.length} {currentData.cityRows.length===1?'cidade':'cidades'}</span></div>
        {!currentData.cityRows.length?<div className="profile-empty"><Building2/><h3>Nenhuma cidade neste recorte</h3><p>Experimente outro período ou tipo de contribuição.</p></div>:<><div className="ranking-list">{currentData.cityRows.map(cityRow)}</div><p className="profile-footnote">Selecione uma cidade para ver seus moradores no ranking.</p></>}
      </>:<>
        <div className="ranking-list-heading"><h3>Top 10</h3><span>{currentData.participants} {currentData.participants===1?'morador':'moradores'}{city==='all'?'':' com contribuições nesta cidade'}</span></div>
        {!currentData.rows.length?<div className="profile-empty"><Trophy/><h3>Nenhuma contribuição neste recorte</h3><p>Experimente outra cidade, período ou tipo de contribuição.</p></div>:<div className="ranking-list">{currentData.rows.map(row)}</div>}
        {currentData.own && !currentData.rows.some(item=>item.profile.id===userId) && <div className="ranking-own"><p>Sua posição</p>{row(currentData.own)}</div>}
        {!currentData.own && <p className="profile-footnote">Seu perfil não tem contribuições neste recorte ou não é de morador.</p>}
      </>)}
      <details className="ranking-method"><summary>Como funciona a classificação</summary><p>A classificação soma os créditos e estornos do período. A semana começa segunda-feira à meia-noite; o mês, no dia 1º, no horário de Brasília. Empates compartilham a posição; a ordem entre empatados é estável.</p>{tab==='cities'?<><p>O total de cada cidade reúne os pontos de todos os moradores que contribuíram nela, inclusive os que estão fora do Top 10. Cada contribuição conta para a cidade onde ocorreu, independentemente do município do perfil. Contribuições sem município identificado não entram neste ranking.</p><p>O número de participantes considera os moradores com contribuições ou estornos na cidade durante o período. Esta classificação mede a participação dos moradores, sem avaliar o desempenho da prefeitura.</p></>:<p>O filtro de cidade considera onde cada contribuição ocorreu, independentemente do município do perfil. A cidade precisa estar identificada na referência do relato; referências sem cidade reconhecida contam apenas no ranking geral.</p>}<p>Acessibilidade reúne relatos sobre rampas de acesso e piso tátil. Gestores e administradores não somam pontos nestas classificações.</p></details>
    </div>
  </div></Modal>;
}
