import type { CityInfo, CityInfoQuery } from '../src/cityInfo.js';
import { RequestError } from './errors.js';

type Statement={rank?:string;mainsnak?:{snaktype?:string;datavalue?:{value?:unknown}};qualifiers?:Record<string,{datavalue?:{value?:{time?:string}}}[]>};
type Entity={id:string;claims?:Record<string,Statement[]>;labels?:Record<string,{value:string}>;aliases?:Record<string,{value:string}[]>};
type WikiPage={pageid:number;title:string;missing?:boolean;pageprops?:{wikibase_item?:string;disambiguation?:string};extract?:string};
const normal=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]/g,'');
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const claims=(entity:Entity|undefined,property:string)=>(entity?.claims?.[property] ?? []).filter(row=>row.rank!=='deprecated'&&row.mainsnak?.datavalue?.value!==undefined);
const values=(entity:Entity|undefined,property:string)=>claims(entity,property).map(row=>row.mainsnak!.datavalue!.value);
const ids=(entity:Entity|undefined,property:string)=>values(entity,property).flatMap(value=>record(value)&&typeof value.id==='string'&&/^Q\d+$/.test(value.id)?[value.id]:[]);
const names=(entity:Entity)=>[...Object.values(entity.labels ?? {}).map(item=>item.value),...Object.values(entity.aliases ?? {}).flatMap(items=>items.map(item=>item.value))];
const label=(entity:Entity|undefined,fallback:string)=>entity?.labels?.pt?.value ?? entity?.labels?.en?.value ?? fallback;
const safeUrl=(value:unknown,host?:string)=>{try{if(typeof value!=='string')return;const url=new URL(value);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||(host&&url.hostname!==host))return;return url.href;}catch{return;}};
export function geographicSummary(text:string) {
  // Population comes from the dated, structured field rather than a second estimate in prose.
  const sentences=text.replace(/\[\d+\]/g,'').split(/(?<=[.!?])\s+(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ])/u)
    .filter(sentence=>!/(popula[çc][aã]o|habitantes|populos[ao]|censo|estimativa)/iu.test(sentence)).slice(0,2);
  const words=sentences.join(' ').split(/\s+/).filter(Boolean);
  return words.slice(0,120).join(' ')+(words.length>120?'…':'');
}

export function parseCityQuery(query:Record<string,unknown>):CityInfoQuery {
  if(Object.keys(query).some(key=>!['name','region','regionCode','countryCode'].includes(key)))throw new RequestError(400,'Parâmetros de cidade inválidos.');
  function text(key:string,max:number,required=false) {const value=query[key] ?? '';if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim())||/[\u0000-\u001f\u007f|<>\[\]{}]/.test(value))throw new RequestError(400,'Confira o nome, o estado e o país da cidade.');return value.trim();}
  const countryCode=text('countryCode',2,true).toUpperCase();if(!/^[A-Z]{2}$/.test(countryCode))throw new RequestError(400,'País inválido.');
  return {name:text('name',100,true),region:text('region',100),regionCode:text('regionCode',100),countryCode};
}

export function latestQuantity(entity:Entity,property:string,unit:string,now:number) {
  return claims(entity,property).flatMap(row=>{
    const value=row.mainsnak!.datavalue!.value;
    if(!record(value)||typeof value.amount!=='string'||typeof value.unit!=='string'||!(unit==='1'?value.unit==='1':value.unit.endsWith(`/entity/${unit}`)))return [];
    const amount=Number(value.amount);if(!Number.isFinite(amount)||(property==='P1082'&&(!Number.isSafeInteger(amount)||amount<0))||(property==='P2046'&&amount<=0))return [];
    const time=row.qualifiers?.P585?.[0]?.datavalue?.value?.time;
    const date=time?.match(/^\+(\d{4})-(\d{2})-(\d{2})/);
    if(date && (Number(date[1])>new Date(now).getUTCFullYear()||(date[2]!=='00'&&date[3]!=='00'&&`${date[1]}-${date[2]}-${date[3]}`>new Date(now).toISOString().slice(0,10))))return [];
    return [{value:amount,year:date?Number(date[1]):undefined,date:date?date.slice(1).join(''):'',preferred:row.rank==='preferred'}];
  }).sort((a,b)=>b.date.localeCompare(a.date)||Number(b.preferred)-Number(a.preferred))[0];
}

export class CityInfoService {
  private cache=new Map<string,{value:CityInfo;expires:number}>();
  private pending=new Map<string,Promise<CityInfo>>();
  constructor(private fetcher:typeof fetch=fetch,private now=()=>Date.now()) {}
  async lookup(raw:CityInfoQuery):Promise<CityInfo> {
    const city=parseCityQuery(raw);const key=JSON.stringify([normal(city.name),normal(city.region),normal(city.regionCode),city.countryCode]);
    const cached=this.cache.get(key);if(cached&&cached.expires>this.now())return cached.value;
    const pending=this.pending.get(key);if(pending)return pending;
    if(this.pending.size>=16)throw new RequestError(429,'Aguarde um instante e tente consultar a cidade novamente.');
    const request=this.load(city).then(value=>{if(this.cache.size>=64)this.cache.delete(this.cache.keys().next().value!);this.cache.set(key,{value,expires:this.now()+24*3600000});return value;}).finally(()=>this.pending.delete(key));
    this.pending.set(key,request);return request;
  }
  private async json(host:'pt.wikipedia.org'|'www.wikidata.org',params:Record<string,string>,signal:AbortSignal):Promise<Record<string,unknown>> {
    const url=new URL(`https://${host}/w/api.php`);url.search=new URLSearchParams({...params,format:'json',formatversion:'2'}).toString();
    const response=await this.fetcher(url,{signal,redirect:'error',headers:{'User-Agent':'LikeCidade/0.1 (+https://likecidade.com.br; city information)','Accept':'application/json'}});
    if(!response.ok)throw new Error('A fonte não respondeu.');
    const text=await response.text();if(text.length>3000000)throw new Error('Resposta muito grande.');
    const data:unknown=JSON.parse(text);if(!record(data)||data.error)throw new Error('Resposta da fonte inválida.');return data;
  }
  private async entities(entityIds:string[],signal:AbortSignal):Promise<Record<string,Entity>> {
    const unique=[...new Set(entityIds.filter(id=>/^Q\d+$/.test(id)))].slice(0,40);if(!unique.length)return {};
    const data=await this.json('www.wikidata.org',{action:'wbgetentities',ids:unique.join('|'),props:'claims|labels|aliases',languages:'pt|en'},signal);
    return record(data.entities)?data.entities as Record<string,Entity>:{};
  }
  private async pages(city:CityInfoQuery,signal:AbortSignal,search=false) {
    const titles=[`${city.name} (${city.region})`,`${city.name} (${city.regionCode})`,city.name].filter((value,index,array)=>array.indexOf(value)===index&&!value.includes('()'));
    const query=await this.json('pt.wikipedia.org',{action:'query',prop:'pageprops|extracts',exintro:'1',explaintext:'1',exsentences:'3',redirects:'1',meta:'siteinfo',siprop:'rightsinfo',
      ...(search?{generator:'search',gsrsearch:`"${city.name}" "${city.region}"`,gsrnamespace:'0',gsrlimit:'5'}:{titles:titles.join('|')})},signal);
    const result=record(query.query)?query.query:{};
    return {pages:Array.isArray(result.pages)?(result.pages as WikiPage[]).filter(page=>!page.missing&&page.pageprops?.wikibase_item&&page.pageprops.disambiguation===undefined):[],license:record(result.rightsinfo)?safeUrl(result.rightsinfo.url,'creativecommons.org'):undefined};
  }
  private async match(pages:WikiPage[],city:CityInfoQuery,signal:AbortSignal) {
    const entities=await this.entities(pages.map(page=>page.pageprops!.wikibase_item!),signal);
    const related:Record<string,Entity>={...entities};
    let frontier=Object.values(entities).flatMap(entity=>[...ids(entity,'P131'),...ids(entity,'P17')]);
    // Validate country and the state/region, including cities nested under a district.
    for(let depth=0;depth<3&&frontier.length;depth++) {
      const loaded=await this.entities(frontier.filter(id=>!related[id]),signal);Object.assign(related,loaded);
      frontier=Object.values(loaded).flatMap(entity=>ids(entity,'P131')).filter(id=>!related[id]);
    }
    for(const page of pages) {
      const entity=entities[page.pageprops!.wikibase_item!];if(!entity||!names(entity).some(name=>normal(name)===normal(city.name)))continue;
      const country=ids(entity,'P17').map(id=>related[id]).find(item=>values(item,'P297').some(code=>code===city.countryCode));if(!country)continue;
      const seen=new Set<string>();const parents:Entity[]=[];let queue=ids(entity,'P131');
      for(let depth=0;depth<3;depth++){const next:string[]=[];for(const id of queue){if(seen.has(id))continue;seen.add(id);const parent=related[id];if(parent){parents.push(parent);next.push(...ids(parent,'P131'));}}queue=next;}
      const region=parents.find(parent=>values(parent,'P300').includes(`${city.countryCode}-${city.regionCode.toUpperCase()}`)||names(parent).some(name=>!!city.region&&normal(name)===normal(city.region)));
      if((city.region||city.regionCode)&&!region)continue;
      // Coordinates identify a geographic entity and never use the visitor's GPS.
      const coordinate=values(entity,'P625').find(value=>record(value)&&typeof value.latitude==='number'&&typeof value.longitude==='number'&&String(value.globe).endsWith('/entity/Q2'));
      if(!record(coordinate)||typeof coordinate.latitude!=='number'||typeof coordinate.longitude!=='number'||Math.abs(coordinate.latitude)>90||Math.abs(coordinate.longitude)>180)continue;
      return {page,entity,country,region,coordinates:{lat:coordinate.latitude,lng:coordinate.longitude}};
    }
  }
  private async load(city:CityInfoQuery):Promise<CityInfo> {
    const signal=AbortSignal.timeout(12000);
    try {
      let source=await this.pages(city,signal);let match=await this.match(source.pages,city,signal);
      if(!match){source=await this.pages(city,signal,true);match=await this.match(source.pages,city,signal);}
      if(!match)throw new RequestError(404,'Não encontramos um artigo que corresponda com segurança a esta cidade e estado.');
      const {entity,page,country,region,coordinates}=match;const now=this.now();
      const population=latestQuantity(entity,'P1082','1',now);const area=latestQuantity(entity,'P2046','Q712226',now);const elevation=latestQuantity(entity,'P2044','Q11573',now);
      const wikipediaUrl=`https://pt.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g,'_'))}`;
      const sectionData:Record<string,unknown>=await this.json('pt.wikipedia.org',{action:'parse',pageid:String(page.pageid),prop:'sections'},signal).catch(()=>({}));
      const parsed:Record<string,unknown>=record(sectionData.parse)?sectionData.parse:{};const sections:unknown[]=Array.isArray(parsed.sections)?parsed.sections:[];
      const topics=['historia','geografia','demografia','economia','turismo','cultura'];
      const links=sections.flatMap(section=>{
        if(!record(section)||typeof section.line!=='string'||typeof section.anchor!=='string'||section.toclevel!==1)return [];
        const title=section.line.replace(/<[^>]*>/g,'').replace(/\[\d+\]/g,'').trim();if(!topics.includes(normal(title)))return [];
        const url=new URL(wikipediaUrl);url.hash=section.anchor;return [{title,url:url.href}];
      }).sort((a,b)=>topics.indexOf(normal(a.title))-topics.indexOf(normal(b.title))).slice(0,6);
      return {name:label(entity,city.name),region:label(region,city.region),country:label(country,city.countryCode),summary:geographicSummary(page.extract ?? ''),
        population:population&&Number.isSafeInteger(population.value)&&population.value>=0?{value:population.value,year:population.year}:undefined,
        areaKm2:area&&area.value>0?area.value:undefined,elevationM:elevation?.value,coordinates,wikipediaUrl,wikidataUrl:`https://www.wikidata.org/wiki/${entity.id}`,
        officialWebsite:values(entity,'P856').flatMap(value=>{const url=safeUrl(value);return url?[url]:[];})[0],sections:links,fetchedAt:new Date(now).toISOString(),wikipediaLicenseUrl:source.license};
    } catch(error) {if(error instanceof RequestError)throw error;throw new RequestError(502,'Não foi possível consultar a Wikipédia agora. Tente novamente em instantes.');}
  }
}
