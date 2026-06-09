import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

const STORAGE_KEY = 'nutwatch-theme';
const ThemeContext = createContext(null);

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          mode: ['system', 'light', 'dark', 'auto'].includes(parsed.mode) ? parsed.mode : 'system',
          lightStart: typeof parsed.lightStart === 'number' ? parsed.lightStart : 6,
          lightEnd: typeof parsed.lightEnd === 'number' ? parsed.lightEnd : 20,
        };
      }
    }
  } catch {}
  return { mode: 'system', lightStart: 6, lightEnd: 20 };
}

export function isLightHour(start, end) {
  const now = new Date().getHours();
  if (start === end) return false;
  if (start < end) return now >= start && now < end;
  return now >= start || now < end;
}

function computeTheme(mode, lightStart, lightEnd) {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  if (mode === 'auto') return isLightHour(lightStart, lightEnd) ? 'light' : 'dark';
  if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
  return 'dark';
}

function persistConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {}
}

export function ThemeProvider({ children }) {
  const [config, setConfigState] = useState(loadConfig);

  const theme = useMemo(() => computeTheme(config.mode, config.lightStart, config.lightEnd), [config]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    persistConfig(config);
  }, [config]);

  const setMode = useCallback((mode) => {
    setConfigState(prev => ({ ...prev, mode }));
  }, []);

  const updateConfig = useCallback((partial) => {
    setConfigState(prev => ({ ...prev, ...partial }));
  }, []);

  const toggleTheme = useCallback(() => {
    setConfigState(prev => {
      const current = computeTheme(prev.mode, prev.lightStart, prev.lightEnd);
      return { ...prev, mode: current === 'dark' ? 'light' : 'dark' };
    });
  }, []);

  const value = {
    theme,
    toggleTheme,
    mode: config.mode,
    lightStart: config.lightStart,
    lightEnd: config.lightEnd,
    setMode,
    updateConfig,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
