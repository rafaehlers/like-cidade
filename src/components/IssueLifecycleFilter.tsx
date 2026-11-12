import { CircleDot, Layers } from 'lucide-react';
import type { IssueLifecycle } from '../domain';
import GraveyardIcon from './GraveyardIcon';

export default function IssueLifecycleFilter({ value, onChange }: { value: IssueLifecycle; onChange: (value: IssueLifecycle) => void }) {
  return <div className="lifecycle-filter" role="group" aria-label="Ocorrências no mapa">
    <button type="button" aria-pressed={value === 'open'} onClick={() => onChange('open')}><CircleDot size={16} aria-hidden="true" />Em aberto</button>
    <button type="button" aria-pressed={value === 'all'} onClick={() => onChange('all')}><Layers size={16} aria-hidden="true" />Todas</button>
    <button type="button" className="graveyard-filter" aria-pressed={value === 'graveyard'} title="Ocorrências encerradas" onClick={() => onChange('graveyard')}><GraveyardIcon size={16} aria-hidden="true" />Graveyard</button>
  </div>;
}
