import { useContext } from 'react';
import { Globe2 } from 'lucide-react';
import { LanguageContext } from '../context/LanguageContext';

const LanguageSwitcher = () => {
  const { language, toggleLanguage } = useContext(LanguageContext);

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-white text-sm font-semibold transition hover:bg-white/20"
    >
      <Globe2 className="h-4 w-4" />
      {language === 'en' ? 'EN' : 'አማ'}
    </button>
  );
};

export default LanguageSwitcher;
