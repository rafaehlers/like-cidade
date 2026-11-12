import { ACCESSIBILITY_SUBCATEGORIES, PILOT_CITIES, type PilotCity, type PointEntry, type PublicProfile } from './profiles.js';
export type RankingPeriod='week'|'month'|'all';
export type RankingTheme='all'|'reports'|'supports'|'accessibility';
export type RankingRow={profile:PublicProfile;points:number;position:number;demoPoints:number};
export type CityRankingRow={city:PilotCity;points:number;position:number;participants:number};
export type RankingSnapshot={rows:RankingRow[];own?:RankingRow;participants:number;cityRows:CityRankingRow[];period:RankingPeriod;city:PilotCity|'all';theme:RankingTheme;hasDemo:boolean;revision:number;updatedAt:string};
export type RankingEvent=Pick<PointEntry,'action'|'amount'|'createdAt'|'subcategory'|'demo'|'city'> & {userId:string};
export function cityFromReference(address:string):PilotCity|undefined {
  const normalized=address.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const matches=PILOT_CITIES.filter(city=>new RegExp(`\\b${city.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}\\b`).test(normalized));
  return matches.length===1?matches[0]:undefined;
}
export function periodStart(period:RankingPeriod,now:Date):string|undefined {
  if(period==='all')return;
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const n=(key:string)=>Number(parts.find(part=>part.type===key)!.value);
  const local=new Date(Date.UTC(n('year'),n('month')-1,n('day')));
  if(period==='month')local.setUTCDate(1);
  else local.setUTCDate(local.getUTCDate()-(local.getUTCDay()+6)%7);
  // Resolve the IANA offset at the boundary, without relying on the server timezone.
  const offsetParts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',timeZoneName:'longOffset'}).formatToParts(local);
  const offset=offsetParts.find(part=>part.type==='timeZoneName')!.value.match(/GMT([+-])(\d{2}):(\d{2})/);
  const minutes=offset?(Number(offset[2])*60+Number(offset[3]))*(offset[1]==='-'?-1:1):0;
  return new Date(local.getTime()-minutes*60000).toISOString();
}
export function buildRanking(profiles:PublicProfile[],events:RankingEvent[],options:{period:RankingPeriod;city:PilotCity|'all';theme:RankingTheme;userId?:string;now:Date;revision:number}):RankingSnapshot {
  const start=periodStart(options.period,options.now);const end=options.now.toISOString();
  const residents=profiles.filter(profile=>profile.role==='resident');
  const residentIds=new Set(residents.map(profile=>profile.id));
  const scores=new Map<string,{points:number;demoPoints:number;count:number}>();
  const cityScores=new Map<PilotCity,{points:number;residents:Set<string>}>();
  for(const entry of events) {
    if(!residentIds.has(entry.userId))continue;
    if(entry.createdAt>end || (start && entry.createdAt<start) || (options.city!=='all' && entry.city!==options.city))continue;
    if(options.theme==='reports' && entry.action!=='report')continue;
    if(options.theme==='supports' && entry.action!=='support')continue;
    if(options.theme==='accessibility' && (entry.action!=='report'||!ACCESSIBILITY_SUBCATEGORIES.includes(entry.subcategory ?? '')))continue;
    const score=scores.get(entry.userId) ?? {points:0,demoPoints:0,count:0};
    score.points+=entry.amount;if(entry.demo)score.demoPoints+=entry.amount;score.count++;scores.set(entry.userId,score);
    if(entry.city && PILOT_CITIES.includes(entry.city)) {
      const cityScore=cityScores.get(entry.city) ?? {points:0,residents:new Set<string>()};
      cityScore.points+=entry.amount;cityScore.residents.add(entry.userId);cityScores.set(entry.city,cityScore);
    }
  }
  // Municipality rankings follow contribution locations, never a profile's home city.
  const sorted=residents.filter(profile=>options.city==='all'||scores.has(profile.id)).map(profile=>({profile,points:scores.get(profile.id)?.points ?? 0,demoPoints:scores.get(profile.id)?.demoPoints ?? 0,position:0}))
    .sort((a,b)=>b.points-a.points||a.profile.id.localeCompare(b.profile.id));
  let rank=0;let last:number|undefined;
  sorted.forEach((row,index)=>{if(row.points!==last)rank=index+1;row.position=rank;last=row.points;});
  const cityRows:CityRankingRow[]=[...cityScores].map(([city,score])=>({city,points:score.points,participants:score.residents.size,position:0}))
    .sort((a,b)=>b.points-a.points||a.city.localeCompare(b.city,'pt-BR'));
  rank=0;last=undefined;
  cityRows.forEach((row,index)=>{if(row.points!==last)rank=index+1;row.position=rank;last=row.points;});
  return {rows:sorted.slice(0,10),own:sorted.find(row=>row.profile.id===options.userId),participants:sorted.length,cityRows,period:options.period,city:options.city,theme:options.theme,hasDemo:sorted.some(row=>row.demoPoints!==0),revision:options.revision,updatedAt:end};
}
