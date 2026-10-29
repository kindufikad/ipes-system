import { useState } from 'react';
import { FaFacebookF, FaXTwitter, FaYoutube, FaLinkedinIn, FaTelegram } from 'react-icons/fa6';
import DeveloperCreditModal from './DeveloperCreditModal';
import useLandingContent from '../hooks/useLandingContent';
import { useTranslation } from '../context/useTranslation';

const socialLinks = [
  { key: 'facebook', label: 'Facebook', href: 'https://www.facebook.com/MekdelaAmbaUniversityOfficial', icon: <FaFacebookF />, bg: 'bg-[#1877F2]' },
  { label: 'X', href: 'https://twitter.com/MekdelaAmba', icon: <FaXTwitter />, bg: 'bg-black' },
  { key: 'youtube', label: 'YouTube', href: 'https://www.youtube.com/@mekdelaambauniversity', icon: <FaYoutube />, bg: 'bg-[#FF0000]' },
  { key: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/school/mekdela-amba-university/', icon: <FaLinkedinIn />, bg: 'bg-[#0A66C2]' },
  { key: 'telegram', label: 'Telegram', href: 'https://t.me/MekdelaAmbaUniversity_MAU', icon: <FaTelegram />, bg: 'bg-[#229ED9]' },
];

const Footer = ({ className = '' }) => {
  const { t } = useTranslation();
  const landingContent = useLandingContent();
  const currentYear = new Date().getFullYear();
  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);
  const contact = landingContent.contact || {};
  const phone = contact.phone || '+251 961806188';
  const email = contact.email || 'kindufikad085@gmail.com';
  const officeHours = contact.office_hours || contact.officeHours || '';
  const visibleSocialLinks = socialLinks.map((link) => ({
    ...link,
    href: link.key ? landingContent.social_links?.[link.key] ?? link.href : link.href,
  })).filter((link) => link.href);

  return (
    <footer className={`mt-auto w-full text-white ${className}`}>
      <div className="bg-[#0F172A] px-4 py-8 md:px-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-8 lg:flex-row lg:items-center">
          <div className="flex w-full flex-col items-center justify-center lg:w-1/2">
            <h3 className="mb-4 text-xl font-bold text-white">{t('footer.followUs')}</h3>
            <div className="flex items-center justify-center gap-4">
              {visibleSocialLinks.map(({ label, href, icon, bg }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className={`flex h-11 w-11 items-center justify-center rounded-full ${bg} text-white text-xl transition-opacity hover:opacity-90`}
                >
                  {icon}
                </a>
              ))}
            </div>
          </div>

          <div className="w-full max-w-md rounded-[28px] border border-slate-600/60 bg-[#1E293B] px-6 py-6 shadow-xl lg:w-[30%]">
            <h3 className="mb-5 text-3xl font-bold text-white">{t('footer.contact')}</h3>
            <div className="space-y-4 text-lg font-medium text-white/90">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#f7c948] text-sm text-[#0d1f3a]">•</span>
                <span>{t('footer.universityLocation')}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#f7c948] text-sm text-[#0d1f3a]">✆</span>
                <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="transition-colors hover:text-blue-300 hover:underline">
                  {phone}
                </a>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#f7c948] text-sm text-[#0d1f3a]">✉</span>
                <a href={`mailto:${email}`} className="transition-colors hover:text-blue-300 hover:underline">
                  {email}
                </a>
              </div>
              {officeHours && <div className="flex items-center gap-3">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#f7c948] text-sm text-[#0d1f3a]">◷</span>
                <span>{officeHours}</span>
              </div>}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-700 bg-[#21B3E4] px-4 py-4 text-center text-lg font-semibold text-slate-200 sm:flex-row sm:text-left md:px-8 lg:px-12">
        <p className="text-base">&copy; {currentYear} {t('footer.universityName')}. {t('footer.allRightsReserved')}</p>
        <button
          type="button"
          onClick={() => setIsCreditModalOpen(true)}
          className="text-base font-bold text-white sm:ml-auto sm:text-right"
        >
          {t('footer.developedBy')}
        </button>
      </div>

      <DeveloperCreditModal open={isCreditModalOpen} onClose={() => setIsCreditModalOpen(false)} />
    </footer>
  );
};

export default Footer;
