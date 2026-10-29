import { useContext, useEffect, useState } from 'react';
import { MoonStar, SunMedium, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../../services/api';
import { ThemeContext } from '../../context/ThemeContextValue';

const AdminSettingsModal = ({ isOpen, onClose }) => {
  const { isDark, toggleTheme } = useContext(ThemeContext);
  const [settings, setSettings] = useState({ host: 'smtp.gmail.com', port: 587, email: '', password: '', passwordConfigured: false });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    let active = true;
    setLoading(true);
    adminApi.getSmtpSettings()
      .then((saved) => {
        if (!active) return;
        setSettings({
          host: saved?.SMTP_HOST || saved?.host || 'smtp.gmail.com',
          port: Number(saved?.SMTP_PORT || saved?.port || 587),
          email: saved?.SMTP_USER || saved?.senderEmail || '',
          password: '',
          passwordConfigured: saved?.appPasswordConfigured === true,
        });
      })
      .catch((error) => {
        if (active) toast.error(error?.message || 'Unable to load SMTP settings.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [isOpen]);

  const saveSettings = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const saved = await adminApi.updateSmtpSettings({
        SMTP_HOST: settings.host,
        SMTP_PORT: settings.port,
        SMTP_USER: settings.email.trim(),
        SMTP_PASS: settings.password,
      });
      setSettings((current) => ({
        ...current,
        host: saved?.SMTP_HOST || saved?.host || current.host,
        port: Number(saved?.SMTP_PORT || saved?.port || current.port),
        email: saved?.SMTP_USER || saved?.senderEmail || current.email,
        password: '',
        passwordConfigured: true,
      }));
      toast.success('Email service settings saved securely.');
    } catch (error) {
      toast.error(error?.message || 'Unable to save SMTP settings.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="smtp-settings-title" className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">System Settings</p>
            <h2 id="smtp-settings-title" className="mt-1 text-xl font-bold text-slate-950 dark:text-white">Dashboard Settings</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Manage your display theme and verification email service.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close dashboard settings" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        <div className="mb-5 flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">System theme</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Currently {isDark ? 'Dark' : 'Light'}</p>
          </div>
          <button type="button" role="switch" aria-checked={isDark} aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggleTheme} className={`relative inline-flex h-9 w-[4.5rem] shrink-0 items-center rounded-full px-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${isDark ? 'bg-slate-700' : 'bg-blue-100'}`}>
            <span className={`flex h-7 w-7 items-center justify-center rounded-full bg-white text-blue-700 shadow transition-transform dark:text-slate-800 ${isDark ? 'translate-x-9' : 'translate-x-0'}`}>{isDark ? <MoonStar size={15} /> : <SunMedium size={15} />}</span>
          </button>
        </div>
        {loading ? <p role="status" className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">Loading saved settings...</p> : <form onSubmit={saveSettings} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Google Email
            <input type="email" autoComplete="email" required maxLength={255} value={settings.email} onChange={(event) => setSettings((current) => ({ ...current, email: event.target.value }))} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-white" placeholder="account@gmail.com" />
          </label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Google App Password
            <input type="password" autoComplete="new-password" minLength={16} maxLength={19} required={!settings.passwordConfigured} value={settings.password} onChange={(event) => setSettings((current) => ({ ...current, password: event.target.value }))} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-white" placeholder={settings.passwordConfigured ? 'Saved; enter a new password to replace it' : '16-character app password'} />
            <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{settings.passwordConfigured ? 'A password is already configured. Leave blank to keep it.' : 'The password is encrypted before it is stored.'}</span>
          </label>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">Cancel</button>
            <button type="submit" disabled={saving || !settings.email.trim() || (!settings.passwordConfigured && !settings.password)} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Saving...' : 'Save settings'}</button>
          </div>
        </form>}
      </section>
    </div>
  );
};

export default AdminSettingsModal;