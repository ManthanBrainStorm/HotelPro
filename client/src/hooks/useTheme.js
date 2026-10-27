import { useEffect, useState } from 'react';

export default function useTheme() {
  const [theme, setTheme] = useState(document.documentElement.getAttribute('data-bs-theme') || 'light');
  useEffect(() => {
    document.documentElement.setAttribute('data-bs-theme', theme);
    try { localStorage.setItem('hp_theme', theme); } catch { /* storage may be blocked */ }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}
