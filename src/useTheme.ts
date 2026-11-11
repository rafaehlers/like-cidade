import { useEffect, useRef, useState } from 'react';

export type Theme = 'light' | 'dark';
const STORAGE_KEY = 'like-cidade-theme';

function savedTheme(): Theme | undefined {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark') return value;
  } catch { /* Theme switching also works without storage. */ }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => savedTheme() ??
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const hasPreference = useRef(Boolean(savedTheme()));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#151b19' : '#f9f9f6');
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const followSystem = (event: MediaQueryListEvent) => {
      if (!hasPreference.current) setTheme(event.matches ? 'dark' : 'light');
    };
    media.addEventListener('change', followSystem);
    return () => media.removeEventListener('change', followSystem);
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    hasPreference.current = true;
    setTheme(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* Keep the choice for this visit. */ }
  }

  return { theme, toggleTheme };
}
