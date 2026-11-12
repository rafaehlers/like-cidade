import { useEffect, useState } from 'react';
import { BookOpen, ExternalLink, Landmark, LoaderCircle, MapPin, Mountain, Navigation, Ruler, Users } from 'lucide-react';
import { cityInfoKey, wikipediaSearchUrl, type CityIdentity, type CityInfo } from '../cityInfo';
import { loadCityInfo } from '../storage';
import Modal from './Modal';

const number=(value:number,maximumFractionDigits=0)=>value.toLocaleString('pt-BR',{maximumFractionDigits});
const coordinate=(value:number,positive:string,negative:string)=>`${number(Math.abs(value),5)}° ${value<0?negative:positive}`;

export default function CityInfoModal({city,onClose}:{city:CityIdentity;onClose:()=>void}) {
  const [result,setResult]=useState<{key:string;data?:CityInfo;error?:string}>();const [retry,setRetry]=useState(0);
  const key=cityInfoKey(city);const current=result?.key===key?result:undefined;const data=current?.data;
  useEffect(()=>{
    const controller=new AbortController();let active=true;setResult(undefined);
    loadCityInfo(city,controller.signal).then(data=>{if(active)setResult({key,data});}).catch(error=>{if(active)setResult({key,error:error instanceof Error?error.message:'Não foi possível consultar esta cidade.'});});
    return()=>{active=false;controller.abort();};
  },[key,retry]);
  return <Modal title={`Sobre ${city.name}`} onClose={onClose} wide>
    <div className="city-info-content">
      <p className="city-info-region"><MapPin size={15} aria-hidden="true"/>{[city.region,city.country].filter(Boolean).join(' · ')}</p>
      {!current&&<div className="city-info-loading" role="status"><LoaderCircle size={24} className="animate-spin"/><p>Consultando a Wikipédia e os dados da cidade…</p></div>}
      {current?.error&&<div className="city-info-error" role="alert"><p>{current.error}</p><div><button className="button-secondary" onClick={()=>setRetry(value=>value+1)}>Tentar novamente</button><a className="button-secondary" href={wikipediaSearchUrl(city)} target="_blank" rel="noopener noreferrer">Buscar na Wikipédia<ExternalLink size={14}/></a></div></div>}
      {data&&<>
        {data.summary&&<p className="city-info-summary">{data.summary}</p>}
        <dl className="city-info-facts">
          <div><dt><Users size={17}/>População</dt><dd>{data.population?number(data.population.value):'Não informada'}</dd><small>{data.population?.year?`Referência: ${data.population.year}`:'Ano não informado na fonte'}</small></div>
          <div><dt><Ruler size={17}/>Área territorial</dt><dd>{data.areaKm2===undefined?'Não informada':<>{number(data.areaKm2,3)} <span>km²</span></>}</dd><small>Dados do Wikidata</small></div>
          <div><dt><Mountain size={17}/>Altitude</dt><dd>{data.elevationM===undefined?'Não informada':<>{number(data.elevationM,1)} <span>m</span></>}</dd><small>Dados do Wikidata</small></div>
          <div><dt><Navigation size={17}/>Coordenadas</dt><dd className="city-info-coordinates">{data.coordinates?<>{coordinate(data.coordinates.lat,'N','S')}<br/>{coordinate(data.coordinates.lng,'L','O')}</>:'Não informadas'}</dd><small>Referência da cidade</small></div>
        </dl>
        <section className="city-info-reading"><h3><BookOpen size={17}/>Explore na Wikipédia</h3><div className="city-info-links"><a href={data.wikipediaUrl} target="_blank" rel="noopener noreferrer"><span>Artigo completo</span><ExternalLink size={14}/></a>{data.sections.map(section=><a key={section.url} href={section.url} target="_blank" rel="noopener noreferrer"><span>{section.title}</span><ExternalLink size={14}/></a>)}</div></section>
        {data.officialWebsite&&<a className="city-info-official" href={data.officialWebsite} target="_blank" rel="noopener noreferrer"><Landmark size={18}/><span>Site oficial do município</span><ExternalLink size={15}/></a>}
        <p className="city-info-sources">Resumo: <a href={data.wikipediaUrl} target="_blank" rel="noopener noreferrer">Wikipédia</a>{data.wikipediaLicenseUrl&&<> · <a href={data.wikipediaLicenseUrl} target="_blank" rel="noopener noreferrer">CC BY-SA</a></>}. Dados geográficos e populacionais: <a href={data.wikidataUrl} target="_blank" rel="noopener noreferrer">Wikidata</a>. Consulta em {new Date(data.fetchedAt).toLocaleDateString('pt-BR')}.</p>
      </>}
    </div>
  </Modal>;
}
