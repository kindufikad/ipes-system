import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';
import { ThemeContext } from './ThemeContextValue';
import { getThemeStorageKey } from '../utils/themePreference';

const readTheme = (storageKey) => {
  try {
    const savedTheme = window.localStorage.getItem(storageKey);
    if (savedTheme) return savedTheme === 'dark';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
};

export const ThemeProvider = ({ children }) => {
  const { pathname } = useLocation();
  const { user, role } = useAuth();
  const storageKey = getThemeStorageKey({ pathname, user, role });
  const [themeState, setThemeState] = useState(() => ({ storageKey, isDark: readTheme(storageKey) }));
  const isDark = themeState.storageKey === storageKey
    ? themeState.isDark
    : readTheme(storageKey);

  useEffect(() => {
    setThemeState((current) => current.storageKey === storageKey
      ? current
      : { storageKey, isDark: readTheme(storageKey) });
  }, [storageKey]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.colorScheme = isDark ? 'dark' : 'light';
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      window.localStorage.setItem(storageKey, isDark ? 'dark' : 'light');
    } catch (error) {
      console.warn('Unable to save theme preference:', error);
    }
  }, [isDark, storageKey]);

  const toggleTheme = () => setThemeState({ storageKey, isDark: !isDark });

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeProvider;
