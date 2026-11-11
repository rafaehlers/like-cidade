import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownWideNarrow, ArrowUpRight, Building2, Check, CheckCheck, ChevronDown, CircleHelp, Clock3, Heart, Map as MapIcon, MapPin, MessageCircle, Plus, Search, ShieldCheck, SlidersHorizontal, Trash2, UserRound, X, LoaderCircle, List } from 'lucide-react';
import { CATEGORIES, CENTER, PEOPLE, STATUSES, authorName, canManage, inBounds, isUserId, type IssueSnapshot, type Issue, type Position, type UserId, type Status } from './domain';
import { addIssueComment, createSharedIssue, removeSharedIssue, setIssueStatus, setIssueSupport } from './storage';
import MapView from './components/MapView';
import Modal from './components/Modal';
import IssueForm, { type NewIssue } from './components/IssueForm';
import CategoryIcon from './components/CategoryIcon';
import { useMapCity } from './useMapCity';
import { useSharedIssues } from './useSharedIssues';

const date = (value: string) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
function StatusBadge({ status }: { status: Status }) { return <span className={`status-badge status-${STATUSES.indexOf(status)}`}><i />{status}</span>; }

export default function App() {
  const [userId, setUserId] = useState<UserId>(() => { try { const value = localStorage.getItem('like-cidade-user') ?? localStorage.getItem('like-cidade-role'); return isUserId(value) ? value : 'resident'; } catch { return 'resident'; } });
  const person = PEOPLE[userId];
  const role = person.type;
  const { issues, hydrated, loadError, connection, applySnapshot, refresh } = useSharedIssues();
  const [saving, setSaving] = useState(false);
  const mutationPending = useRef(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todas as categorias');
  const [status, setStatus] = useState('Todas as situações');
  const [sort, setSort] = useState<'recent' | 'supported'>('recent');
  const [selectedId, setSelectedId] = useState<string>();
  const [center, setCenter] = useState<Position>(CENTER);
  const [userLocation, setUserLocation] = useState<Position>();
  const [locating, setLocating] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapCenter, setMapCenter] = useState<Position>();
  const mapCity = useMapCity(mapCenter, mapReady);
  const [bounds, setBounds] = useState<google.maps.LatLngBoundsLiteral>();
  const [placing, setPlacing] = useState(false);
  const [draft, setDraft] = useState<Position>();
  const [help, setHelp] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string>();
  const [toast, setToast] = useState('');
  const [mobileView, setMobileView] = useState<'map' | 'list'>('map');
  const didLocate = useRef(false);
  const selected = issues.find(i => i.id === selectedId);

  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 5500); return () => clearTimeout(id); }, [toast]);
  const locate = useCallback(() => new Promise<Position | undefined>(resolve => {
    if (!navigator.geolocation) { setToast('Seu navegador não oferece localização. Você pode explorar o mapa e escolher um ponto.'); resolve(undefined); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(({ coords }) => { const p = { lat: coords.latitude, lng: coords.longitude }; setUserLocation(p); setCenter(p); setLocating(false); resolve(p); }, error => {
      setLocating(false); setToast(error.code === 1 ? 'Tudo bem! Você pode explorar Itajaí ou escolher um ponto no mapa sem compartilhar sua localização.' : 'Não encontramos sua localização. Você pode escolher um ponto no mapa.'); resolve(undefined);
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
  }), []);
  useEffect(() => { if (!didLocate.current) { didLocate.current = true; void locate(); } }, [locate]);
  const filtered = useMemo(() => issues.filter(i =>
    (category === 'Todas as categorias' || i.category === category) &&
    (status === 'Todas as situações' || i.status === status) &&
    `${i.title} ${i.description} ${i.address} ${i.category}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')),
  ).sort((a, b) => sort === 'supported' ? b.likes.length - a.likes.length : b.createdAt.localeCompare(a.createdAt)), [issues, category, status, query, sort]);
  const visible = useMemo(() => filtered.filter(i => !mapReady || !bounds || inBounds(i, bounds)), [filtered, mapReady, bounds]);
  function changeUser(next: UserId) { setUserId(next); setPlacing(false); try { localStorage.setItem('like-cidade-user', next); } catch { /* The demo works without localStorage. */ } setToast(`Agora você está explorando como ${PEOPLE[next].fullName}.`); }
  function openIssue(issue: Issue) { setSelectedId(issue.id); setCenter({ lat: issue.lat, lng: issue.lng }); }
  async function mutate<T extends IssueSnapshot>(action: () => Promise<T>): Promise<T> {
    if (mutationPending.current) throw new Error('Aguarde a ação anterior terminar.');
    mutationPending.current = true; setSaving(true);
    try { const snapshot = await action(); applySnapshot(snapshot); return snapshot; }
    catch (error) { setToast(error instanceof Error ? error.message : 'Não foi possível salvar. Tente novamente.'); throw error; }
    finally { mutationPending.current = false; setSaving(false); }
  }
  function like(id: string) {
    const issue = issues.find(item => item.id === id); if (!issue) return;
    void mutate(() => setIssueSupport(id, userId, !issue.likes.includes(userId))).catch(() => {});
  }
  async function createIssue(value: NewIssue) {
    if (role !== 'resident' && role !== 'admin') return;
    const snapshot = await mutate(() => createSharedIssue(value, userId));
    setDraft(undefined); setPlacing(false); setQuery(''); setCategory('Todas as categorias'); setStatus('Todas as situações'); setCenter({ lat: value.lat, lng: value.lng }); setSelectedId(snapshot.createdId); setToast('Relato publicado para todos!');
  }
  function changeStatus(id: string, next: Status) {
    if (!canManage(role) || !STATUSES.includes(next)) return;
    void mutate(() => setIssueStatus(id, userId, next)).then(() => setToast('Situação atualizada para todos.')).catch(() => {});
  }
  function deleteIssue(id: string) {
    if (role !== 'admin') return;
    void mutate(() => removeSharedIssue(id, userId)).then(() => { setSelectedId(undefined); setConfirmDelete(undefined); setToast('Relato removido da demonstração compartilhada.'); }).catch(() => {});
  }
  function beginReport() { if (role === 'agency') return; if (mapReady) { setMobileView('map'); setPlacing(true); } else setDraft(userLocation ?? center); }

  return <div className="app-shell">
    <header className="app-header">
      <div className="header-branding"><a href="/" className="brand" aria-label="Like Cidade, início"><img src="/favicon.png" alt="" /><span><b>Like</b> <b>Cidade</b></span></a>
      <div className="header-divider" /><span className="header-tagline">Quem curte, cuida</span></div>
      <div className="header-location" role="status" aria-live="polite" aria-busy={mapCity.loading} aria-label="Cidade no centro do mapa" title={mapCity.loading ? 'Identificando a cidade no centro do mapa…' : mapCity.available ? mapCity.label : 'Não foi possível identificar a cidade. Você pode continuar explorando o mapa.'}>
        {mapCity.loading ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <MapPin size={15} aria-hidden="true" />}<span>{mapCity.loading && !mapCity.available ? 'Identificando cidade…' : mapCity.label}</span>
      </div>
      <div className="header-actions">
        {role !== 'agency' && <button className="button-primary header-report-button" aria-label="Adicionar relato" title="Adicionar relato" onClick={beginReport} disabled={!hydrated || placing || saving}><Plus size={19} /><span>Adicionar relato</span></button>}
        <button className="help-button" aria-label="Como funciona" onClick={() => setHelp(true)}><CircleHelp size={18} /><span>Como funciona</span></button><span className="demo-label">DEMONSTRAÇÃO</span>
        <label className="profile-selector"><span className={`avatar avatar-${role}`}>{person.initials}</span><span className="profile-text"><small>{person.role}</small><strong>{person.name}</strong></span><select disabled={saving} aria-label="Perfil da demonstração" value={userId} onChange={e => { if (isUserId(e.target.value)) changeUser(e.target.value); }}>{Object.entries(PEOPLE).map(([id, p]) => <option key={id} value={id}>{p.fullName}</option>)}</select><ChevronDown size={16} /></label>
      </div>
    </header>
    {(loadError || connection === 'reconnecting') && <div className="connection-notice" role="status"><span>{loadError ? 'Sem conexão com o servidor. Seus dados salvos continuam no banco.' : 'Reconectando as atualizações em tempo real…'}</span><button onClick={refresh}>Tentar novamente</button></div>}
    <main className="workspace">
      <aside className={`sidebar ${mobileView === 'list' ? 'mobile-active' : ''}`} aria-label="Lista de ocorrências">
        <div className="sidebar-intro"><h1>Perto de você<span className="text-coral">.</span></h1><p>Pequenos cuidados.<br />{' '}Uma cidade melhor para todo mundo.</p></div>
        <div className="filter-area"><label className="search-field"><Search size={18} /><input type="search" placeholder="Buscar nos relatos" aria-label="Buscar nos relatos" value={query} onChange={e => setQuery(e.target.value)} /></label><div className="filter-selects"><label><SlidersHorizontal size={14} /><select aria-label="Filtrar categoria" value={category} onChange={e => setCategory(e.target.value)}><option>Todas as categorias</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label><label><select aria-label="Filtrar situação" value={status} onChange={e => setStatus(e.target.value)}><option>Todas as situações</option>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></label></div></div>
        <div className="list-heading"><span>{visible.length} {visible.length === 1 ? 'relato' : 'relatos'} {mapReady ? 'nesta área' : 'para explorar'}</span><button onClick={() => setSort(s => s === 'recent' ? 'supported' : 'recent')} title="Trocar ordenação"><ArrowDownWideNarrow size={14} />{sort === 'recent' ? 'Recentes' : 'Mais apoiados'}</button></div>
        <div className="issue-list">
          {!hydrated ? <div className="list-empty"><LoaderCircle size={22} className="animate-spin" /><p>{loadError ? 'Não foi possível abrir os relatos. Tente reconectar acima.' : 'Abrindo os relatos…'}</p></div> : !visible.length ? <div className="list-empty"><MapPin size={28} strokeWidth={1.4} /><h3>Nenhum relato por aqui</h3><p>{filtered.length ? 'Mova o mapa para explorar outra área.' : 'Experimente outros filtros ou seja a primeira pessoa a contar o que acontece por aqui.'}</p>{filtered.length > 0 && <button className="text-button" onClick={() => setCenter(CENTER)}>Ver exemplos em Itajaí<ArrowUpRight size={14} /></button>}{(query || category !== 'Todas as categorias' || status !== 'Todas as situações') && <button className="text-button" onClick={() => { setQuery(''); setCategory('Todas as categorias'); setStatus('Todas as situações'); }}>Limpar filtros</button>}</div> : visible.map(issue => <article className={`issue-card ${selectedId === issue.id ? 'issue-card-selected' : ''}`} key={issue.id}>
            <button className="issue-card-main" onClick={() => openIssue(issue)}><div className="flex justify-between items-center gap-2 mb-3"><span className={`category-name category-${CATEGORIES.indexOf(issue.category)}`}><CategoryIcon category={issue.category} size={15} />{issue.category}</span><StatusBadge status={issue.status} /></div><div className="flex gap-3"><div className="min-w-0 flex-1"><h2>{issue.title}</h2><p className="issue-address"><MapPin size={12} />{issue.address}</p></div>{issue.photo && <img className="issue-thumbnail" src={issue.photo} alt="Foto do relato" />}</div></button>
            <div className="issue-card-footer"><button className={`like-button ${issue.likes.includes(userId) ? 'is-liked' : ''}`} aria-label={`${issue.likes.includes(userId) ? 'Retirar apoio de' : 'Apoiar'} ${issue.title}`} disabled={saving} aria-pressed={issue.likes.includes(userId)} onClick={() => like(issue.id)}><Heart size={15} fill={issue.likes.includes(userId) ? 'currentColor' : 'none'} />{issue.likes.length}<span>{issue.likes.length === 1 ? 'apoio' : 'apoios'}</span></button><button className="comment-count" aria-label={`Ver comentários de ${issue.title}`} onClick={() => openIssue(issue)}><MessageCircle size={14} />{issue.comments.length}</button><span className="ml-auto">{issue.sample ? 'Exemplo fictício' : date(issue.createdAt)}</span></div>
          </article>)}
        </div>
        <div className="sidebar-bottom"><span className="flex gap-1.5 items-center"><ShieldCheck size={13} />{loadError ? 'Sem conexão com o servidor' : connection === 'connected' ? 'Atualizações em tempo real' : 'Conectando ao servidor…'}</span><span>Feito para experimentar <Heart size={11} className="text-coral" /></span></div>
      </aside>
      <div className={`map-workspace ${mobileView === 'map' ? 'mobile-active' : ''}`}>
        <MapView issues={filtered} selectedId={selectedId} center={center} userLocation={userLocation} placing={placing} onSelect={id => setSelectedId(id)} onPick={p => { setPlacing(false); setDraft(p); }} onBounds={setBounds} onCenterChange={setMapCenter} onLocate={() => { void locate(); }} locating={locating} onCancelPlace={() => setPlacing(false)} onReady={setMapReady} />
      </div>
    </main>
    <nav className="mobile-tabs" aria-label="Visualização"><button aria-pressed={mobileView === 'map'} onClick={() => setMobileView('map')}><MapIcon size={18} />Mapa</button><button aria-pressed={mobileView === 'list'} onClick={() => setMobileView('list')}><List size={18} />Relatos<span>{visible.length}</span></button></nav>
    {toast && <div className="toast" role="status"><Check size={18} /><span>{toast}</span><button aria-label="Fechar aviso" onClick={() => setToast('')}><X size={15} /></button></div>}
    {draft && <IssueForm position={draft} onClose={() => setDraft(undefined)} onSave={createIssue} onLocate={locate} locating={locating} />}
    {selected && <Modal title="Detalhes do relato" onClose={() => setSelectedId(undefined)} wide>
      <div className="detail-layout"><div className={`detail-visual category-${CATEGORIES.indexOf(selected.category)}`}>
        {selected.photo ? <img src={selected.photo} alt={`Foto: ${selected.title}`} /> : <div><CategoryIcon category={selected.category} size={70} /><span>{selected.category}</span><small>{selected.sample ? 'Relato ilustrativo · sem foto' : 'Este relato ainda não tem foto'}</small></div>}
        <div className="detail-location"><MapPin size={16} /><span>{selected.address}</span></div>
      </div><div className="detail-content"><div className="flex justify-between items-center gap-3"><StatusBadge status={selected.status} />{selected.sample && <span className="text-xs text-muted">Exemplo fictício</span>}</div><h2>{selected.title}</h2><p className="detail-description">{selected.description || 'O morador registrou o problema neste ponto do mapa.'}</p><p className="detail-meta"><UserRound size={13} />{authorName(selected.authorId, selected.author)}<span>·</span>{date(selected.createdAt)}</p>
        <button className={`support-button ${selected.likes.includes(userId) ? 'supported' : ''}`} disabled={saving} aria-pressed={selected.likes.includes(userId)} onClick={() => like(selected.id)}><Heart size={18} fill={selected.likes.includes(userId) ? 'currentColor' : 'none'} />{selected.likes.includes(userId) ? 'Você apoia este relato' : 'Também quero que resolvam'}<b>{selected.likes.length}</b></button>
        {canManage(role) && <div className="agency-controls"><label><Building2 size={15} />Atualizar atendimento<select disabled={saving} aria-label="Situação do atendimento" value={selected.status} onChange={e => changeStatus(selected.id, e.target.value as Status)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></label><small>Ação do perfil de demonstração. Sem vínculo oficial com uma instituição.</small></div>}
        <section className="detail-section"><h3><Clock3 size={16} />Histórico</h3><ol className="timeline">{selected.history.map((event, i) => <li key={`${event.createdAt}-${i}`}><strong>{event.label}</strong><span>{authorName(event.authorId, event.author)} · {date(event.createdAt)}</span></li>)}</ol></section>
        <section className="detail-section"><h3><MessageCircle size={16} />Conversa <span>{selected.comments.length}</span></h3>{!selected.comments.length && <p className="text-sm text-muted mb-3">Tem alguma informação para acrescentar?</p>}<div className="comments">{selected.comments.map(comment => <div key={comment.id}><strong>{authorName(comment.authorId, comment.author)}<span>{date(comment.createdAt)}</span></strong><p>{comment.text}</p></div>)}</div><form className="comment-form" onSubmit={async e => { e.preventDefault(); const form = e.currentTarget; const text = String(new FormData(form).get('comment') || '').trim(); if (!text) return; try { await mutate(() => addIssueComment(selected.id, userId, text)); form.reset(); } catch { /* Keep the draft available for retry. */ } }}><label className="sr-only" htmlFor="comment">Seu comentário</label><textarea disabled={saving} id="comment" name="comment" placeholder="Acrescente uma informação…" rows={2} maxLength={700} required /><button disabled={saving} className="button-secondary" type="submit">Comentar<ArrowUpRight size={15} /></button></form></section>
        {role === 'admin' && <button className="delete-button" onClick={() => setConfirmDelete(selected.id)}><Trash2 size={15} />Remover relato</button>}
      </div></div>
    </Modal>}
    {confirmDelete && <Modal title="Remover este relato?" onClose={() => setConfirmDelete(undefined)}><div className="p-6"><p className="text-muted text-sm leading-relaxed">O relato e suas interações serão removidos da demonstração compartilhada, para todos os participantes.</p><div className="modal-footer"><button className="button-secondary" onClick={() => setConfirmDelete(undefined)}>Cancelar</button><button className="button-primary" disabled={saving} onClick={() => deleteIssue(confirmDelete)}>Remover relato</button></div></div></Modal>}
    {help && <Modal title="Uma cidade melhor começa com você" onClose={() => setHelp(false)}><div className="help-content"><p>O Like Cidade aproxima quem encontra um problema de quem pode ajudar a resolver.</p><ol><li><MapPin /><div><strong>Encontre e registre</strong><span>Marque um ponto no mapa e conte o que precisa de cuidado. Uma foto ajuda.</span></div></li><li><Heart /><div><strong>Participe da conversa</strong><span>Apoie relatos e acrescente informações para a comunidade.</span></div></li><li><CheckCheck /><div><strong>Acompanhe cada passo</strong><span>Veja as atualizações do representante do órgão e o histórico do atendimento.</span></div></li></ol><div className="demo-explanation"><ShieldCheck size={21} /><p>Esta é uma demonstração sem login. Troque entre Rafael, Felipe, Gabriel e Sérgio, ou explore os perfis de representante e administrador no topo. Os relatos e interações são compartilhados com os participantes desta demonstração e atualizados em tempo real. Não há envio à prefeitura.</p></div><button className="button-primary w-full justify-center" onClick={() => setHelp(false)}>Vamos explorar<ArrowUpRight size={17} /></button></div></Modal>}
  </div>;
}
