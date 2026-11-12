import { reportShareData, type ShareableIssue } from '../src/sharing.js';

const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export function renderReportPage(template:string,issue:(ShareableIssue & {hasPhoto:boolean})|undefined,origin:string) {
  const base=new URL(origin);
  if(!['https:','http:'].includes(base.protocol)||base.username||base.password)throw new Error('PUBLIC_SITE_URL deve ser uma origem HTTP ou HTTPS válida.');
  const data=issue?reportShareData(issue,base.origin):{title:'Relato indisponível | Like Cidade',text:'Este relato foi removido ou não está mais disponível.',url:base.origin};
  const image=issue?.hasPhoto?new URL(`/api/issues/${encodeURIComponent(issue.id)}/photo`,base.origin).href:new URL('/favicon.png?v=2',base.origin).href;
  const meta=(property:string,content:string)=>`<meta property="${property}" content="${escapeHtml(content)}" />`;
  const tags=[meta('og:type','article'),meta('og:locale','pt_BR'),meta('og:site_name','Like Cidade'),meta('og:title',data.title),meta('og:description',data.text),meta('og:url',data.url),meta('og:image',image),meta('og:image:alt',issue?.hasPhoto?`Foto do relato: ${issue.title}`:'Like Cidade'),'<meta name="twitter:card" content="summary_large_image" />',`<link rel="canonical" href="${escapeHtml(data.url)}" />`,!issue?'<meta name="robots" content="noindex" />':''].join('\n');
  return template.replace(/<title>[^]*?<\/title>/i,()=>`<title>${escapeHtml(data.title)}</title>`)
    .replace(/<meta\s+name="description"[^>]*>/i,()=>`<meta name="description" content="${escapeHtml(data.text)}" />`)
    .replace(/<\/head>/i,()=>`${tags}\n</head>`);
}
