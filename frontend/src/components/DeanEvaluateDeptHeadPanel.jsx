import { useContext, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { deanApi } from '../services/api';
import { LanguageContext } from '../context/LanguageContext';
import DeptHeadEvaluationFormModal from './DeptHeadEvaluationFormModal';

const copy = {
  en: { title: 'Evaluate Department Heads', description: 'Review Department Heads registered under your college.', head: 'Department Head / Instructor', department: 'Department', deadline: 'Deadline', action: 'Action', evaluated: 'Evaluated', evaluate: 'Evaluate', details: 'View Details', edit: 'Edit/Update', loading: 'Loading evaluations...', empty: 'No Department Heads are registered under your college.', close: 'Close', score: 'Score', strengths: 'Strengths / Key Achievements', weaknesses: 'Areas for Improvement' },
  am: { title: 'የዲፓርትመንት ኃላፊዎችን ይገምግሙ', description: 'በኮሌጅዎ ስር የተመዘገቡ የዲፓርትመንት ኃላፊዎችን ይገምግሙ።', head: 'የዲፓርትመንት ኃላፊ / መምህር', department: 'ዲፓርትመንት', deadline: 'መጨረሻ ቀን', action: 'ድርጊት', evaluated: 'ተገምግሟል', evaluate: 'ይገምግሙ', details: 'ዝርዝር ይመልከቱ', edit: 'ያርትዑ/ያዘምኑ', loading: 'ግምገማዎች በመጫን ላይ...', empty: 'በኮሌጅዎ ስር የተመዘገቡ የዲፓርትመንት ኃላፊዎች የሉም።', close: 'ዝጋ', score: 'ውጤት', strengths: 'ጥንካሬዎች / ዋና ስኬቶች', weaknesses: 'ማሻሻያ የሚያስፈልጋቸው አካባቢዎች' },
};

const DeanEvaluateDeptHeadPanel = () => {
  const { language } = useContext(LanguageContext);
  const [heads, setHeads] = useState([]);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState('create');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [details, setDetails] = useState(null);
  const t = copy[language] || copy.en;

  const loadHeads = async () => {
    setLoading(true);
    try { const rows = await deanApi.getDepartmentHeadsForEvaluation(); setHeads(Array.isArray(rows) ? rows : []); setError(''); }
    catch (loadError) { setError(loadError?.message || 'Unable to load Department Head evaluations.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void loadHeads(); }, []);

  const open = (head, nextMode) => { setSelected(head); setMode(nextMode); };
  const submit = async (payload) => {
    setSubmitting(true);
    try {
      if (mode === 'edit') await deanApi.updateDeptHeadEvaluation(selected.evaluation_id, payload);
      else await deanApi.submitDeptHeadEvaluation(payload);
      setSelected(null);
      await loadHeads();
    } catch (submitError) { setError(submitError?.message || 'Unable to save evaluation.'); }
    finally { setSubmitting(false); }
  };

  return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="mb-6"><h2 className="text-xl font-bold text-slate-900">{t.title}</h2><p className="mt-1 text-sm text-slate-500">{t.description}</p></div>
    {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
    {loading ? <p className="py-8 text-center text-sm text-slate-500">{t.loading}</p> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-gray-50"><tr><th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{t.head}</th><th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{t.deadline}</th><th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{t.action}</th></tr></thead><tbody className="divide-y divide-gray-200 bg-white">{heads.length ? heads.map((head) => { const evaluated = head.is_evaluated || ['submitted', 'completed', 'approved'].includes(String(head.status || '').toLowerCase()); const headName = head.department_head_name || head.full_name || head.name || 'Department Head'; return <tr key={head.department_head_id}><td className="px-6 py-4 font-bold text-gray-900">{headName}<span className="block text-xs font-normal text-gray-500">{head.department || 'Unassigned Department'}</span></td><td className="px-6 py-4 whitespace-nowrap text-gray-600">{head.deadline || '-'}</td><td className="px-6 py-4">{evaluated ? <div className="flex items-center gap-3"><span className="font-medium text-green-600">✓ {t.evaluated} ({Number(head.score || 0).toFixed(2)}/30)</span><button type="button" onClick={() => setDetails(head)} className="text-sm font-semibold text-blue-700 underline hover:text-blue-900">{t.details}</button><button type="button" onClick={() => open(head, 'edit')} className="text-sm font-semibold text-blue-700 underline hover:text-blue-900">{t.edit}</button></div> : <button type="button" onClick={() => open(head, 'create')} className="inline-flex items-center gap-1.5 font-semibold text-blue-700 hover:text-blue-900">★ {t.evaluate}</button>}</td></tr>; }) : <tr><td colSpan="3" className="px-6 py-8 text-center text-sm text-gray-500">{t.empty}</td></tr>}</tbody></table></div>}
    <DeptHeadEvaluationFormModal open={Boolean(selected)} head={selected} mode={mode} onClose={() => setSelected(null)} onSubmit={submit} submitting={submitting} />
    {details ? <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl"><div className="flex justify-between"><div><h2 className="text-xl font-bold">{t.details}</h2><p className="text-sm text-slate-500">{details.department_head_name}</p></div><button type="button" onClick={() => setDetails(null)} aria-label={t.close}><X /></button></div><p className="mt-5 font-semibold text-blue-700">{t.score}: {Number(details.score || 0).toFixed(2)} / 30</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><div><h3 className="text-sm font-semibold">{t.strengths}</h3><p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{details.strengths || '-'}</p></div><div><h3 className="text-sm font-semibold">{t.weaknesses}</h3><p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{details.weaknesses || '-'}</p></div></div></div></div> : null}
  </section>;
};

export default DeanEvaluateDeptHeadPanel;
