import type { Issue } from './domain';
import type { PointEntry } from './profiles';

// Adapt only the imported fixtures for display; keep stored records and user text intact.
export function displayIssue<T extends Issue>(issue: T): T {
  if (!issue.sample || !/^(demo-city-v1-|example-)/.test(issue.id)) return issue;
  const description = issue.description
    ?.replace(/^Exemplo fictício para testes\. A foto é ilustrativa, de outro local, e não comprova um problema nesta cidade\.\s*Cenário: /, '')
    .replace(/ Este é um relato fictício para explorar a demonstração\.$/, '')
    .replace(/ Exemplo fictício de acompanhamento de uma ocorrência\.$/, '')
    .replace(/ Exemplo fictício, sem correspondência com um problema real neste endereço\.$/, '');
  return {
    ...issue,
    description,
    address: issue.address.replace(/ · (localização ilustrativa|exemplo)$/, ''),
    author: issue.author === 'Morador de exemplo' ? 'Morador' : issue.author,
    comments: issue.comments?.map(comment => ({
      ...comment,
      text: comment.id === `${issue.id}-comment-0`
        ? comment.text.replace(/^Comentário fictício: /, '')
        : comment.id === `${issue.id}-comment-1` && comment.text === 'Atendimento simulado para testar a conversa e o acompanhamento do relato. Não há envio ao órgão público.'
          ? 'Acompanhamento do relato registrado.' : comment.text,
    })),
    history: issue.history.map(event => ({
      ...event,
      label: ['Ocorrência de exemplo criada', 'Relato fictício de demonstração criado com foto ilustrativa'].includes(event.label)
        ? 'Ocorrência registrada' : event.label.replace(/^Atendimento simulado: /, 'Atendimento: '),
      author: event.author === 'Demonstração' ? 'Sistema' : event.author,
    })),
  };
}

export function displayPointEntry(entry: PointEntry): PointEntry {
  if (!entry.demo || !entry.id.startsWith('demo-ranking-v1:')) return entry;
  return {
    ...entry,
    reason: entry.reason.replace(/^Demonstração fictícia: /, '').replace(/^ocorrência registrada$/, 'Ocorrência registrada').replace(/^apoio a outra ocorrência$/, 'Apoio a outra ocorrência'),
    issueTitle: entry.issueTitle.replace(/^(Relato|Apoio) fictício — /, '$1 — '),
  };
}
