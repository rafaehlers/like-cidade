import { useState, type FormEvent } from 'react';
import { Camera, Check, ImagePlus, LoaderCircle, LocateFixed, MapPin, X, Navigation } from 'lucide-react';
import { CATEGORIES, SUBCATEGORIES, validPosition, type Category, type Subcategory, type Position, type NewIssue } from '../domain';
import { preparePhoto } from '../storage';
import Modal from './Modal';
import CategoryIcon from './CategoryIcon';
import { useSuggestedAddress } from '../useSuggestedAddress';

export type { NewIssue } from '../domain';
export default function IssueForm({ position, onClose, onSave, onLocate, locating }: { position: Position; onClose: () => void; onSave: (value: NewIssue) => Promise<void>; onLocate: () => Promise<Position | undefined>; locating: boolean }) {
  const [point, setPoint] = useState(position);
  const [category, setCategory] = useState<Category | ''>('');
  const [subcategory, setSubcategory] = useState<Subcategory | ''>('');
  const address = useSuggestedAddress(point);
  const [photo, setPhoto] = useState<string>();
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get('title') || '').trim();
    if (title.length < 5) { setError('Conte um pouco mais no título, com pelo menos 5 caracteres.'); return; }
    if (!category) { setError('Escolha a categoria do problema.'); return; }
    if (!validPosition(point)) { setError('Confira a latitude e a longitude do ponto.'); return; }
    setSaving(true); setError('');
    try { await onSave({ title, category, subcategory: subcategory || undefined, description: String(data.get('description') || '').trim(), address: String(data.get('address') || '').trim() || 'Local marcado no mapa', photo, ...point }); }
    catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível publicar. Tente novamente.'); }
    finally { setSaving(false); }
  }
  return <Modal title="O que precisa de um cuidado?" onClose={() => { if (!saving) onClose(); }}>
    <form className="report-form" onSubmit={submit}>
      <fieldset disabled={saving} className="report-fields">
      <p className="text-sm text-muted leading-relaxed">Um relato é o primeiro passo. Conte o que você encontrou para que outras pessoas possam acompanhar.</p>
      <div className="position-summary"><MapPin size={20} className="text-coral shrink-0" /><div><strong>Local do relato</strong><p>{point.lat.toFixed(5)}, {point.lng.toFixed(5)}</p></div><button type="button" className="text-button ml-auto" disabled={locating} onClick={async () => { const p = await onLocate(); if (p) setPoint(p); }}><LocateFixed size={16} /><span>{locating ? 'Localizando…' : 'Usar GPS'}</span></button></div>
      <details className="coordinate-details"><summary><Navigation size={13} />Ajustar coordenadas</summary><div className="grid grid-cols-2 gap-3 mt-3"><label>Latitude<input aria-label="Latitude" type="number" step="any" min="-90" max="90" required value={Number.isFinite(point.lat) ? point.lat : ''} onChange={e => setPoint(p => ({ ...p, lat: e.target.value === '' ? NaN : Number(e.target.value) }))} /></label><label>Longitude<input aria-label="Longitude" type="number" step="any" min="-180" max="180" required value={Number.isFinite(point.lng) ? point.lng : ''} onChange={e => setPoint(p => ({ ...p, lng: e.target.value === '' ? NaN : Number(e.target.value) }))} /></label></div></details>
      <label>Um título para o problema <span className="text-coral">*</span><input autoFocus name="title" placeholder="Ex.: calçada quebrada perto da praça" minLength={5} maxLength={100} required /></label>
      <fieldset className="category-picker"><legend>Categoria <span className="text-coral">*</span></legend>
        <div className="category-options">{CATEGORIES.map((option, index) => <label className="category-option" key={option}>
          <input type="radio" name="category" value={option} checked={category === option} onChange={() => { setCategory(option); setSubcategory(''); }} required />
          <span className="category-option-content"><span className={`category-option-icon category-${index}`}><CategoryIcon category={option} size={20} /></span><span>{option}</span><Check size={12} className="category-option-check" aria-hidden="true" /></span>
        </label>)}</div>
      </fieldset>
      {category && <label className="subcategory-field">Subcategoria <span className="font-normal text-muted">(opcional)</span>
        <select name="subcategory" value={subcategory} onChange={event => setSubcategory(event.target.value as Subcategory | '')}>
          <option value="">Não especificar</option>
          {SUBCATEGORIES[category].map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>}
      <div><label>Rua ou ponto de referência<input name="address" placeholder="Ex.: ao lado da escola" maxLength={140} value={address.value} onChange={event => address.edit(event.target.value)} aria-describedby="address-hint" /></label>
        <div id="address-hint" className="address-hint" role="status" aria-live="polite">
          {address.status === 'loading' ? <span><LoaderCircle size={13} className="animate-spin" aria-hidden="true" />Identificando a rua pelo ponto marcado…</span>
            : address.status === 'ready' && address.edited && address.suggestion !== address.value ? <><span>Sugestão do mapa: {address.suggestion}</span><button type="button" onClick={address.useSuggestion}>Usar sugestão</button></>
            : address.status === 'ready' ? <span>Endereço sugerido pelo mapa. Você pode corrigir ou acrescentar uma referência.</span>
            : address.status === 'invalid' ? <span>Confira as coordenadas para identificar a rua. Você também pode preencher a referência.</span>
            : <><span>Não encontramos a rua automaticamente. Você pode preencher a referência.</span><button type="button" onClick={address.retry}>Tentar novamente</button></>}
        </div>
      </div>
      <label>Comentário para o atendimento <span className="font-normal text-muted">(opcional)</span><textarea name="description" rows={3} maxLength={1200} placeholder="Acrescente detalhes que ajudem o atendimento." aria-describedby="private-comment-hint" /><span id="private-comment-hint" className="private-comment-hint">Visível somente à administração e ao órgão responsável.</span></label><p className="demo-privacy-notice">Esta é uma demonstração em que qualquer pessoa pode trocar de perfil. Não inclua dados pessoais ou sigilosos.</p>
      <div><span className="field-label">Uma foto ajuda a entender</span>{photo ? <div className="photo-preview"><img src={photo} alt="Foto selecionada para o relato" /><button type="button" className="icon-button" aria-label="Remover foto selecionada" onClick={() => setPhoto(undefined)}><X size={17} /></button></div> : <label className="photo-upload"><input aria-label="Adicionar uma foto" type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={processing} onChange={async e => { const file = e.target.files?.[0]; if (!file) return; setProcessing(true); setError(''); try { setPhoto(await preparePhoto(file)); } catch (error) { setError((error as Error).message); } finally { setProcessing(false); e.target.value = ''; } }} />{processing ? <LoaderCircle className="animate-spin" size={24} /> : <ImagePlus size={25} strokeWidth={1.5} />}<strong>{processing ? 'Preparando sua foto…' : 'Escolher uma foto'}</strong><span>JPG, PNG, WebP ou AVIF · até 15 MB</span></label>}<p className="text-xs text-muted mt-2 flex gap-1.5"><Camera size={13} className="shrink-0" />Evite mostrar rostos e placas nas fotos.</p></div>
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="modal-footer"><button type="button" className="button-secondary" onClick={onClose}>Cancelar</button><button type="submit" className="button-primary" disabled={processing || saving}>{saving ? <LoaderCircle size={17} className="animate-spin" /> : <MapPin size={17} />}{saving ? 'Publicando…' : 'Publicar relato'}</button></div>
      </fieldset>
    </form>
  </Modal>;
}
