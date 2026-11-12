import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { PRIORITIES } from '../management';

const groups = [
  { priority: 'Alta', categories: 'Água e esgoto, incluindo drenagem e alagamento; árvore caída ou galho quebrado.' },
  { priority: 'Média', categories: 'Buraco, iluminação e acessibilidade (rampas de acesso e piso tátil).' },
  { priority: 'Baixa', categories: 'Demais ocorrências de calçada, lixo e espaço público.' },
] as const;

export default function PriorityCriteria() {
  return <details className="service-priority-criteria">
    <summary><SlidersHorizontal size={17} aria-hidden="true"/><span>Critérios de priorização</span><ChevronDown size={16} aria-hidden="true"/></summary>
    <div className="priority-criteria-content">
      <p>Cada ocorrência recebe uma prioridade (Alta, Média ou Baixa), usada para ordenar as pendências da prefeitura. O responsável pode ajustar a prioridade no atendimento, registrando a justificativa no comentário interno.</p>
      <ol>
        <li><strong>Risco da categoria:</strong> define a prioridade inicial, conforme a tabela.</li>
        <li><strong>Apoios:</strong> ao chegar a 10 apoios, a ocorrência sobe um nível.</li>
        <li><strong>Tempo em aberto:</strong> após 30 dias sem solução, a ocorrência sobe um nível.</li>
      </ol>
      <p>Os acréscimos se somam, até o limite de prioridade Alta. A prioridade manual prevalece até que o responsável selecione “Automática” novamente.</p>
      <table>
        <caption className="sr-only">Prioridade inicial por categoria ou tipo de problema</caption>
        <thead><tr><th scope="col">Prioridade inicial</th><th scope="col">Categorias e tipos de problema</th></tr></thead>
        <tbody>{groups.map(group=><tr key={group.priority}><th scope="row"><span className={`priority priority-${PRIORITIES.indexOf(group.priority)}`}>{group.priority}</span></th><td>{group.categories}</td></tr>)}</tbody>
      </table>
    </div>
  </details>;
}
