import type { Category, Issue, IssueSnapshot, Status, UserId } from './domain.js';
import { ACCESSIBILITY_SUBCATEGORIES, type PilotCity, type PublicProfile } from './profiles.js';
export type Priority='Baixa'|'Média'|'Alta';
export const PRIORITIES:Priority[]=['Baixa','Média','Alta'];
export type AgencyScope={userId:UserId;city:PilotCity;category:Category;department:string};
export type ServiceEvent={id:string;authorId:UserId;author:string;comment:string;createdAt:string;status?:Status;priority?:Priority|'auto';photo?:string};
export type ManagedIssue=Issue & {city?:PilotCity;neighborhood?:string;priority:Priority;priorityOverride?:Priority;serviceEvents:ServiceEvent[];serviceVersion:number};
export type AssignmentVersion={userId:UserId;city:PilotCity;version:number};
export type AuditRecord={id:string;actor:string;target:string;city:string;createdAt:string;before:AgencyScope[];after:AgencyScope[]};
export type ManagementSnapshot=Omit<IssueSnapshot,'issues'|'profiles'|'capabilities'> & {issues:ManagedIssue[];profiles:PublicProfile[];capabilities:{admin:boolean;service:boolean};scopes:AgencyScope[];assignmentVersions:AssignmentVersion[];cities:{city:PilotCity|'unknown';count:number}[];audit:AuditRecord[]};
export type AssignmentUpdate={city:PilotCity;targetUserId:UserId;expectedVersion:number;assignments:{category:Category;department:string}[]};
export type ServiceUpdate={comment:string;status:Status;expectedStatus:Status;expectedVersion:number;priority?:Priority|'auto';photo?:string};
export function neighborhoodFromReference(address:string,city?:PilotCity):string|undefined {
  if(!city)return;
  const clean=address.replace(/\s*·.*$/,'').trim();
  const part=clean.split(/\s+[—–]\s+/).at(-1)!;
  const prefix=part.split(',').slice(0,-1).join(',').replace(/^Praça no\s+/i,'').trim();
  // Only accept a single named neighborhood immediately preceding the municipality.
  if(!prefix || prefix.includes(',') || /\d|\b(rua|avenida|av\.|r\.)\b/i.test(prefix) || !part.endsWith(city))return;
  return prefix;
}
export function automaticPriority(issue:Pick<Issue,'category'|'subcategory'|'createdAt'|'likes'>,now=Date.now()):Priority {
  let priority=issue.category==='Água e esgoto'||issue.subcategory==='Árvore caída ou galho quebrado'?2:
    issue.category==='Buraco'||issue.category==='Iluminação'||ACCESSIBILITY_SUBCATEGORIES.includes(issue.subcategory ?? '')?1:0;
  if(issue.likes.length>=10)priority++;
  if(now-new Date(issue.createdAt).getTime()>=30*86400000)priority++;
  return PRIORITIES[Math.min(2,priority)];
}
export function serviceStats(issues:ManagedIssue[]) {
  const resolved=issues.filter(issue=>issue.status==='Resolvida');
  const durations=resolved.flatMap(issue=>{const events=issue.history.filter(event=>event.label==='Situação alterada para resolvida');const at=events.at(-1)?.createdAt;return at?[Math.max(0,(new Date(at).getTime()-new Date(issue.createdAt).getTime())/86400000)]:[];});
  return {total:issues.length,pending:issues.length-resolved.length,resolved:resolved.length,resolutionRate:issues.length?Math.round(resolved.length/issues.length*100):0,averageDays:durations.length?durations.reduce((a,b)=>a+b,0)/durations.length:undefined};
}
