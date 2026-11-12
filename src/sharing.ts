import type { Issue } from './domain.js';

export type ShareableIssue=Pick<Issue,'id'|'title'|'category'|'address'|'status'>;
export function reportPath(id:string) {return `/relatos/${encodeURIComponent(id)}`;}
export function reportIdFromPath(path:string):string|undefined {
  const match=/^\/relatos\/([^/]+)\/?$/.exec(path);
  if(!match)return;
  try {return decodeURIComponent(match[1]) || undefined;} catch {return;}
}
export function reportShareData(issue:ShareableIssue,origin:string) {
  return {
    title:`${issue.title} | Like Cidade`,
    text:`${issue.title}\n${issue.category} · ${issue.address}\nSituação: ${issue.status}. Acompanhe no Like Cidade.`,
    url:new URL(reportPath(issue.id),origin).href,
  };
}
export function reportShareLinks(issue:ShareableIssue,origin:string) {
  const data=reportShareData(issue,origin);
  return {
    whatsapp:`https://wa.me/?${new URLSearchParams({text:`${data.text}\n${data.url}`})}`,
    facebook:`https://www.facebook.com/sharer/sharer.php?${new URLSearchParams({u:data.url})}`,
    x:`https://x.com/intent/tweet?${new URLSearchParams({url:data.url,text:`${issue.title}\n${issue.category} no Like Cidade. Quem curte, cuida!`})}`,
  };
}
