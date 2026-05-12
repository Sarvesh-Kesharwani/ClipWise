import { useEffect, useState } from 'react';
import { applyTheme, resolveInitialTheme, type ThemeMode } from '../utils/theme';

interface Props {
  className?: string;
  variant?: 'pill' | 'icon';
}

export default function ThemeToggle({ className, variant = 'pill' }: Props) {
  const [mode, setMode] = useState<ThemeMode>(() => resolveInitialTheme());

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  const next: ThemeMode = mode === 'dark' ? 'light' : 'dark';
  const label = mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  const glyph = mode === 'dark' ? <SunIcon /> : <MoonIcon />;

  return (
    <button
      type="button"
      className={`theme-toggle ${variant} ${className ?? ''}`}
      onClick={() => setMode(next)}
      aria-label={label}
      title={label}
    >
      {glyph}
      {variant === 'pill' && <span className="theme-toggle-text">{mode === 'dark' ? 'Light' : 'Dark'}</span>}
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
