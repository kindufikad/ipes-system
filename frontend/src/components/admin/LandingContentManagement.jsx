import { useEffect, useRef, useState } from 'react';
import { ImagePlus, RefreshCw, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../../services/api';

const assetLabels = {
  about_page_image: 'About page image',
  system_logo: 'System logo',
  university_logo: 'University logo',
};

const LandingContentManagement = () => {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);
  const [contactSettings, setContactSettings] = useState({ contact_email: '', contact_phone: '', contact_office_hours: '' });
  const [contactSaving, setContactSaving] = useState(false);
  const inputRefs = useRef({});

  const loadSettings = async () => {
    setLoading(true);
    try {
      const rows = await adminApi.getLandingContent();
      const next = {};
      rows.forEach((row) => {
        next[row.setting_key] = row.setting_key === 'home_hero_images'
          ? JSON.parse(row.setting_value || '[]')
          : row.setting_value;
      });
      setSettings(next);
    } catch (error) {
      toast.error(error?.message || 'Unable to load landing page settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
    adminApi.getContactSettings().then((values) => setContactSettings((current) => ({ ...current, ...values }))).catch(() => {});
  }, []);

  const saveContactSettings = async (event) => {
    event.preventDefault();
    setContactSaving(true);
    try {
      await Promise.all(Object.entries(contactSettings).map(([key, value]) => adminApi.updateContactSetting(key, value)));
      toast.success('Contact information saved.');
    } catch (error) {
      toast.error(error?.message || 'Unable to save contact information.');
    } finally {
      setContactSaving(false);
    }
  };

  const upload = async (key, files) => {
    if (!files.length) return;
    setSavingKey(key);
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      await adminApi.uploadLandingContent(key, formData);
      await loadSettings();
      toast.success('Landing page image saved.');
    } catch (error) {
      toast.error(error?.message || 'Unable to save landing page image.');
    } finally {
      setSavingKey(null);
    }
  };

  const remove = async (key) => {
    setSavingKey(key);
    try {
      await adminApi.deleteLandingContent(key);
      await loadSettings();
      toast.success('Landing page image removed.');
    } catch (error) {
      toast.error(error?.message || 'Unable to remove landing page image.');
    } finally {
      setSavingKey(null);
    }
  };

  const heroImages = Array.isArray(settings.home_hero_images) ? settings.home_hero_images : [];

  return (
    <section className="space-y-6" aria-labelledby="landing-content-title">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Brand & content</p>
          <h2 id="landing-content-title" className="mt-2 text-2xl font-bold text-slate-900">Landing Page Management</h2>
          <p className="mt-1 text-slate-600">Update public images without changing application code.</p>
        </div>
        <button type="button" onClick={loadSettings} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <form onSubmit={saveContactSettings} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h3 className="font-semibold text-slate-900">Contact Information</h3>
          <p className="mt-1 text-sm text-slate-500">These values appear on the public Contact Us page.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {[[ 'contact_email', 'Admin email', 'email' ], [ 'contact_phone', 'Support phone number', 'text' ], [ 'contact_office_hours', 'Office hours', 'text' ]].map(([key, label, type]) => <label key={key} className="text-sm font-medium text-slate-700">{label}<input type={type} value={contactSettings[key]} onChange={(event) => setContactSettings((current) => ({ ...current, [key]: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500" required /></label>)}
          </div>
          <button type="submit" disabled={contactSaving} className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{contactSaving ? 'Saving...' : 'Save Contact Information'}</button>
        </form>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div><h3 className="font-semibold text-slate-900">Home hero carousel</h3><p className="mt-1 text-sm text-slate-500">Upload one or more images to append to the carousel.</p></div>
            <ImagePlus className="text-blue-600" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {heroImages.map((image) => <img key={image} src={image} alt="Hero preview" className="h-32 w-full rounded-xl object-cover" />)}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <input ref={(element) => { inputRefs.current.home_hero_images = element; }} type="file" accept="image/*" multiple className="hidden" onChange={(event) => { void upload('home_hero_images', Array.from(event.target.files || [])); event.target.value = ''; }} />
            <button type="button" onClick={() => inputRefs.current.home_hero_images?.click()} disabled={savingKey === 'home_hero_images'} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">Upload hero images</button>
            <button type="button" onClick={() => remove('home_hero_images')} disabled={!heroImages.length || savingKey === 'home_hero_images'} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"><Trash2 size={16} /> Clear carousel</button>
          </div>
        </article>

        {Object.entries(assetLabels).map(([key, label]) => {
          const image = settings[key];
          return <article key={key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4"><div><h3 className="font-semibold text-slate-900">{label}</h3><p className="mt-1 text-sm text-slate-500">Upload a replacement image.</p></div><ImagePlus className="text-blue-600" /></div>
            <div className="mt-4 flex h-32 items-center justify-center rounded-xl bg-slate-100 p-3">{image ? <img src={image} alt={`${label} preview`} className="max-h-full max-w-full object-contain" /> : <span className="text-sm text-slate-400">Using default asset</span>}</div>
            <input ref={(element) => { inputRefs.current[key] = element; }} type="file" accept="image/*" className="hidden" onChange={(event) => { void upload(key, Array.from(event.target.files || [])); event.target.value = ''; }} />
            <div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => inputRefs.current[key]?.click()} disabled={savingKey === key} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">Upload replacement</button><button type="button" onClick={() => remove(key)} disabled={!image || savingKey === key} className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">Use default</button></div>
          </article>;
        })}
      </div>
    </section>
  );
};

export default LandingContentManagement;
