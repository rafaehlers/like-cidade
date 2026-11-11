import { useEffect, useState } from 'react';
import { validPosition, type Position } from './domain';
import { lookupStreet } from './mapAddress';

export function useSuggestedAddress(point: Position) {
  const [address, setAddress] = useState({ value: '', suggestion: '', edited: false });
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable' | 'invalid'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    // Never leave an old automatic address attached to a different map point.
    setAddress(previous => ({ ...previous, value: previous.edited ? previous.value : '', suggestion: '' }));
    if (!validPosition(point)) { setStatus('invalid'); return; }
    setStatus('loading');
    const timer = window.setTimeout(async () => {
      try {
        const suggestion = await lookupStreet(point);
        if (!active) return;
        setAddress(previous => ({ ...previous, suggestion: suggestion ?? '', value: previous.edited ? previous.value : suggestion ?? '' }));
        setStatus(suggestion ? 'ready' : 'unavailable');
      } catch { if (active) setStatus('unavailable'); }
    }, 600);
    return () => { active = false; window.clearTimeout(timer); };
  }, [point.lat, point.lng, attempt]);

  return {
    ...address, status,
    edit: (value: string) => setAddress(previous => ({ ...previous, value, edited: true })),
    useSuggestion: () => setAddress(previous => ({ ...previous, value: previous.suggestion, edited: false })),
    retry: () => setAttempt(previous => previous + 1),
  };
}
