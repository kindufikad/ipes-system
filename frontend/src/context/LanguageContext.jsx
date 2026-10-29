import { createContext, useCallback, useMemo, useState } from 'react';
import { translations } from '../translations';

const LANGUAGE_STORAGE_KEY = 'ipes-language-preference';

export const LanguageContext = createContext({
  language: 'en',
  toggleLanguage: () => {},
  setLanguage: () => {},
  strings: translations.en,
});

export const LanguageProvider = ({ children }) => {
  const getInitialLanguage = () => {
    try {
      const savedLanguage = typeof window !== 'undefined'
        ? window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
        : null;
      if (savedLanguage === 'am' || savedLanguage === 'en') return savedLanguage;
    } catch (error) {
      // Ignore storage errors and fall back to browser preference.
    }

    const nav = typeof navigator !== 'undefined' && navigator.language ? navigator.language.toLowerCase() : '';
    if (nav.startsWith('am')) return 'am';
    return 'en';
  };

  const [language, setLanguage] = useState(getInitialLanguage);

  const updateLanguage = useCallback((nextLanguage) => {
    const normalized = nextLanguage === 'am' ? 'am' : 'en';
    setLanguage(normalized);
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
    } catch (error) {
      console.warn('Unable to save language preference:', error);
    }
  }, []);

  const toggleLanguage = useCallback(() => {
    updateLanguage(language === 'en' ? 'am' : 'en');
  }, [language, updateLanguage]);

  const value = useMemo(
    () => ({ language, toggleLanguage, setLanguage: updateLanguage, strings: translations[language] || translations.en }),
    [language, toggleLanguage, updateLanguage]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};
