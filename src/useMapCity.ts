import { useEffect, useState } from 'react';
import type { Position } from './domain';
import { cityIdentity } from './mapCity';
import type { CityIdentity } from './cityInfo';

export function useMapCity(position: Position | undefined, ready: boolean) {
  const [city, setCity] = useState<{label:string;loading:boolean;available:boolean;identity?:CityIdentity}>({ label: 'Explorando o mapa', loading: false, available: false });

  useEffect(() => {
    if (!ready || !position) return;
    let active = true;
    setCity(previous => ({ ...previous, loading: true }));
    // Wait until navigation settles, and ignore responses for older map centers.
    const timer = window.setTimeout(async () => {
      try {
        const { Geocoder } = await google.maps.importLibrary('geocoding') as google.maps.GeocodingLibrary;
        const { results } = await new Geocoder().geocode({ location: position, language: 'pt-BR' });
        if (!active) return;
        const identity = cityIdentity(results);
        setCity({ label: identity?.label ?? 'Região do mapa', loading: false, available: !!identity,identity });
      } catch {
        if (active) setCity({ label: 'Região do mapa', loading: false, available: false });
      }
    }, 700);
    return () => { active = false; window.clearTimeout(timer); };
  }, [position?.lat, position?.lng, ready]);

  return city;
}
