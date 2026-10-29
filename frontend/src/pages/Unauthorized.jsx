import { Link } from 'react-router-dom';

const Unauthorized = () => (
  <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
    <section className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200"><p className="text-sm font-bold uppercase tracking-[0.2em] text-rose-600">403</p><h1 className="mt-3 text-3xl font-bold text-slate-900">Unauthorized</h1><p className="mt-3 text-slate-600">You do not have access to this dashboard.</p><Link to="/" className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">Return home</Link></section>
  </main>
);

export default Unauthorized;
