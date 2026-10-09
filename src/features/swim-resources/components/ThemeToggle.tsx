'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';

type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeToggleProps {
  singleIcon?: boolean;
}

const subscribe = (callback: () => void) => {
  window.addEventListener('theme-change', callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener('theme-change', callback);
    window.removeEventListener('storage', callback);
  };
};

const getSnapshot = (): ThemeMode => {
  const saved = localStorage.getItem('velocity-theme') as ThemeMode | null;
  if (saved === 'light' || saved === 'dark' || saved === 'system') {
    return saved;
  }
  return 'system';
};

const getServerSnapshot = (): ThemeMode => 'system';

export default function ThemeToggle({ singleIcon = false }: ThemeToggleProps) {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = (newMode: ThemeMode) => {
    localStorage.setItem('velocity-theme', newMode);
    if (newMode === 'system') {
      document.documentElement.setAttribute('data-theme', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', newMode);
    }
    window.dispatchEvent(new Event('theme-change'));
  };

  const cycleTheme = () => {
    const nextMode: Record<ThemeMode, ThemeMode> = {
      light: 'dark',
      dark: 'system',
      system: 'light',
    };
    setTheme(nextMode[mode]);
  };

  if (singleIcon) {
    return (
      <button
        type="button"
        className="flex items-center justify-center w-8 h-8 rounded-md text-text-secondary hover:text-text-primary hover:bg-hover-bg transition-colors"
        onClick={cycleTheme}
        title={`Theme: ${mode.charAt(0).toUpperCase() + mode.slice(1)} (click to toggle)`}
        aria-label={`Current theme: ${mode}. Click to toggle.`}
      >
        {mode === 'light' && <Sun size={16} className="shrink-0" />}
        {mode === 'dark' && <Moon size={16} className="shrink-0" />}
        {mode === 'system' && <Monitor size={16} className="shrink-0" />}
      </button>
    );
  }

  return (
    <div 
      className="inline-flex flex-row items-center p-0.5 rounded-full bg-hover-bg/70 border border-border/80 gap-0.5"
      role="group" 
      aria-label="Theme selection"
    >
      <button
        type="button"
        className={`flex items-center justify-center w-7 h-7 rounded-full transition-all duration-150 ${
          mode === 'light' 
            ? 'bg-surface text-text-primary shadow-xs' 
            : 'text-text-secondary hover:text-text-primary'
        }`}
        onClick={() => setTheme('light')}
        title="Light theme"
        aria-label="Light theme"
      >
        <Sun size={14} className="shrink-0" />
      </button>

      <button
        type="button"
        className={`flex items-center justify-center w-7 h-7 rounded-full transition-all duration-150 ${
          mode === 'dark' 
            ? 'bg-surface text-text-primary shadow-xs' 
            : 'text-text-secondary hover:text-text-primary'
        }`}
        onClick={() => setTheme('dark')}
        title="Dark theme"
        aria-label="Dark theme"
      >
        <Moon size={14} className="shrink-0" />
      </button>

      <button
        type="button"
        className={`flex items-center justify-center w-7 h-7 rounded-full transition-all duration-150 ${
          mode === 'system' 
            ? 'bg-surface text-text-primary shadow-xs' 
            : 'text-text-secondary hover:text-text-primary'
        }`}
        onClick={() => setTheme('system')}
        title="System theme"
        aria-label="System theme"
      >
        <Monitor size={14} className="shrink-0" />
      </button>
    </div>
  );
}
