import { useContext } from 'react';
import { LanguageContext } from './LanguageContext';
import enCriteria from '../locales/en.json';
import amCriteria from '../locales/am.json';

const getValue = (source, path) => path.split('.').reduce((value, key) => value?.[key], source);

export const useTranslation = () => {
  const { language, strings } = useContext(LanguageContext);
  const locale = language === 'am' ? amCriteria : enCriteria;

  const t = (key, fallback = '') => getValue(locale, key) ?? getValue(strings, key) ?? fallback;

  return { t, language };
};
