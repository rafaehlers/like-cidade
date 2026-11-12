import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LocateFixed, Map as MapIcon, MapPinned, Plus, Minus, RefreshCw, Satellite, X, MousePointer2 } from 'lucide-react';
import { CENTER, type Category, type Issue, type Position } from '../domain';
import { loadMaps } from '../maps';
import { createMapMarker } from '../mapMarker';
import CategoryIcon from './CategoryIcon';
import { createIssueLayer } from '../mapClusters';
import { mapStyles } from '../mapStyles';
import type { Theme } from '../useTheme';

const CLUSTERING_ENABLED = import.meta.env.VITE_MAP_CLUSTERING_ENABLED?.trim().toLowerCase() !== 'false';

type Props = {
  theme: Theme; issues: Issue[]; selectedId?: string; center: Position; userLocation?: Position;
  placing: boolean; onSelect: (id: string) => void; onPick: (p: Position) => void;
  onBounds: (bounds: google.maps.LatLngBoundsLiteral) => void;
  onCenterChange: (position: Position) => void;
  onLocate: () => void; locating: boolean; onCancelPlace: () => void; onReady: (ready: boolean) => void;
};
export default function MapView(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const markers = useRef<google.maps.OverlayView[]>([]);
  const [pinIcons, setPinIcons] = useState<{ id: string; category: Category; element: HTMLButtonElement }[]>([]);
  const [zoom, setZoom] = useState(15);
  const [mapStyle, setMapStyle] = useState<'roadmap' | 'satellite'>(() => {
    try { return localStorage.getItem('like-cidade-map-style') === 'satellite' ? 'satellite' : 'roadmap'; }
    catch { return 'roadmap'; }
  });
  const issueLayer = useMemo(() => createIssueLayer(props.issues, CLUSTERING_ENABLED), [props.issues]);
  const latest = useRef(props); latest.current = props;
  const [state, setState] = useState<'loading' | 'ready' | 'missing-key' | 'error'>('loading');
  useEffect(() => {
    let cancelled = false;
    const listeners: google.maps.MapsEventListener[] = [];
    const onAuthError = () => { setState('error'); latest.current.onReady(false); };
    window.addEventListener('maps-auth-error', onAuthError);
    loadMaps().then(async () => {
      const { Map } = await google.maps.importLibrary('maps') as google.maps.MapsLibrary;
      if (cancelled || !container.current) return;
      const instance = new Map(container.current, {
        center: latest.current.center || CENTER, zoom: 15, mapTypeId: mapStyle,
        // Local styles require a raster map without a cloud Map ID.
        renderingType: google.maps.RenderingType.RASTER,
        styles: mapStyles(latest.current.theme),
        disableDefaultUI: true, clickableIcons: false, gestureHandling: 'greedy',
      });
      map.current = instance;
      listeners.push(instance.addListener('zoom_changed', () => setZoom(instance.getZoom() ?? 15)));
      listeners.push(instance.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (latest.current.placing && e.latLng) latest.current.onPick(e.latLng.toJSON());
      }));
      listeners.push(instance.addListener('idle', () => {
        const bounds = instance.getBounds(); if (bounds) latest.current.onBounds(bounds.toJSON());
        const center = instance.getCenter(); if (center) latest.current.onCenterChange(center.toJSON());
      }));
      setState('ready'); latest.current.onReady(true);
    }).catch(error => { if (!cancelled) { setState(error.message === 'missing-key' ? 'missing-key' : 'error'); latest.current.onReady(false); } });
    return () => { cancelled = true; listeners.forEach(l => l.remove()); window.removeEventListener('maps-auth-error', onAuthError); markers.current.forEach(m => m.setMap(null)); map.current = null; };
  }, []);
  useEffect(() => { map.current?.panTo(props.center); }, [props.center]);
  useEffect(() => {
    if (map.current && state === 'ready') map.current.setOptions({ styles: mapStyles(props.theme) });
  }, [props.theme, state]);
  useEffect(() => {
    if (!map.current || state !== 'ready') return;
    map.current.setMapTypeId(mapStyle);
    try { localStorage.setItem('like-cidade-map-style', mapStyle); } catch { /* The map still works without localStorage. */ }
  }, [mapStyle, state]);
  useEffect(() => {
    if (!map.current || state !== 'ready') return;
    map.current.setOptions({ draggableCursor: props.placing ? 'crosshair' : null });
  }, [props.placing, state]);
  useEffect(() => {
    markers.current.forEach(m => m.setMap(null)); markers.current = [];
    if (!map.current || state !== 'ready') { setPinIcons([]); return; }
    const icons: typeof pinIcons = [];
    issueLayer.atZoom(zoom).forEach(feature => {
      const content = document.createElement('button');
      content.type = 'button';
      const [lng, lat] = feature.geometry.coordinates;
      const position = { lat, lng };
      if ('cluster_id' in feature.properties) {
        const { cluster_id, point_count, point_count_abbreviated, openCount } = feature.properties;
        content.className = `map-pin map-cluster ${openCount === 0 ? 'map-pin-resolved' : ''}`;
        content.textContent = String(point_count_abbreviated);
        content.setAttribute('aria-label', `Agrupamento com ${point_count} relatos. Aproximar mapa`);
        content.title = `${point_count} relatos · ${openCount} em aberto · clique para aproximar`;
        content.addEventListener('click', () => {
          map.current?.panTo(position);
          map.current?.setZoom(issueLayer.expansionZoom(cluster_id));
        });
      } else {
        const { issue } = feature.properties;
        content.className = `map-pin ${issue.status === 'Resolvida' ? 'map-pin-resolved' : ''} ${props.selectedId === issue.id ? 'map-pin-selected' : ''}`;
        content.setAttribute('aria-label', issue.title); content.title = `${issue.category} · ${issue.title} · ${issue.status}`;
        content.addEventListener('click', () => latest.current.onSelect(issue.id));
        icons.push({ id: issue.id, category: issue.category, element: content });
      }
      markers.current.push(createMapMarker(map.current!, position, content));
    });
    setPinIcons(icons);
    if (props.userLocation) {
      const dot = document.createElement('div'); dot.className = 'user-location-dot'; dot.title = 'Sua localização aproximada';
      markers.current.push(createMapMarker(map.current, props.userLocation, dot, true));
    }
  }, [issueLayer, zoom, props.selectedId, props.userLocation, state]);
  return <section className="map-panel" aria-label="Mapa de ocorrências">
    {pinIcons.map(pin => createPortal(<CategoryIcon category={pin.category} size={21} />, pin.element, pin.id))}
    <div ref={container} className="absolute inset-0" />
    {state !== 'ready' && <div className="map-unavailable">
      <div className="empty-map-icon"><MapPinned size={36} strokeWidth={1.4} /></div>
      <h2>{state === 'loading' ? 'Abrindo o mapa…' : state === 'missing-key' ? 'Vamos colocar a cidade no mapa' : 'Não conseguimos abrir o mapa'}</h2>
      <p>{state === 'missing-key' ? 'A conexão com o Google Maps ainda precisa ser configurada. Enquanto isso, explore os relatos pela lista.' : state === 'error' ? 'Confira a conexão e a configuração do Google Maps. Seus relatos continuam disponíveis na lista.' : 'Só um instante. Estamos preparando os arredores.'}</p>
      {state !== 'loading' && <button className="button-secondary" onClick={() => window.location.reload()}><RefreshCw size={16} />Tentar novamente</button>}
    </div>}
    {props.userLocation && <div className="map-location-label"><span className="live-dot" />Localização ativada</div>}
    {props.placing && <div className="placing-message"><MousePointer2 size={18} /><span>Toque no mapa para posicionar o relato</span><button aria-label="Cancelar escolha de local" onClick={props.onCancelPlace}><X size={18} /></button></div>}
    {state === 'ready' && <div className="map-style-switch" role="group" aria-label="Estilo do mapa">
      <button type="button" aria-label="Mapa de ruas" aria-pressed={mapStyle === 'roadmap'} onClick={() => setMapStyle('roadmap')}><MapIcon size={16} aria-hidden="true" />Ruas</button>
      <button type="button" aria-label="Mapa de satélite" aria-pressed={mapStyle === 'satellite'} onClick={() => setMapStyle('satellite')}><Satellite size={16} aria-hidden="true" />Satélite</button>
    </div>}
    <div className="map-controls">
      <button aria-label="Centralizar na minha localização" title="Minha localização" onClick={props.onLocate} disabled={props.locating}><LocateFixed size={20} className={props.locating ? 'animate-pulse' : ''} /></button>
      {state === 'ready' && <div className="zoom-controls"><button aria-label="Aproximar mapa" onClick={() => map.current?.setZoom((map.current.getZoom() ?? 15) + 1)}><Plus size={20} /></button><button aria-label="Afastar mapa" onClick={() => map.current?.setZoom((map.current.getZoom() ?? 15) - 1)}><Minus size={20} /></button></div>}
    </div>
  </section>;
}
