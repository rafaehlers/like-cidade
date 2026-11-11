let loader: Promise<void> | undefined;
export function loadMaps(): Promise<void> {
  return loader ??= new Promise<void>((resolve, reject) => {
    const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
    if (!key || key === 'YOUR_API_KEY') { reject(new Error('missing-key')); return; }
    if (typeof window.google !== 'undefined' && typeof google.maps?.importLibrary === 'function') { resolve(); return; }
    const callback = `__likeCidadeMapsReady`;
    const target = window as unknown as Record<string, unknown>;
    const script = document.createElement('script');
    let settled = false;
    const timeout = window.setTimeout(() => fail('load-timeout'), 20000);
    const fail = (message: string) => {
      if (settled) return;
      settled = true; window.clearTimeout(timeout); delete target[callback]; reject(new Error(message));
    };
    target[callback] = () => {
      if (settled) return;
      settled = true; window.clearTimeout(timeout); delete target[callback]; resolve();
    };
    target.gm_authFailure = () => window.dispatchEvent(new Event('maps-auth-error'));
    const params = new URLSearchParams({ key, v: 'weekly', loading: 'async', callback, language: 'pt-BR', region: 'BR' });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => fail('network-error');
    document.head.append(script);
  });
}
