import { Link } from 'react-router-dom';
import BackButton from '../components/BackButton';

const SettingsPage = () => (
  <main className="min-h-screen bg-slate-50 px-4 py-24 text-slate-900 sm:px-6">
    <section className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="settings-title">
      <BackButton />
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">Account</p>
      <h1 id="settings-title" className="mt-2 text-3xl font-bold">Dashboard Settings</h1>
      <p className="mt-2 text-slate-600">Manage your account security settings.</p>
      <Link to="/change-password" className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">Change Password</Link>
    </section>
  </main>
);

export default SettingsPage;