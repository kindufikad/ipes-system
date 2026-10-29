import { useContext, useEffect, useMemo, useState } from 'react';
import { Clock3, X } from 'lucide-react';
import LanguageToggle from './LanguageToggle';
import { LanguageContext } from '../context/LanguageContext';
import { deadlineToneClasses, getDeadlineState } from '../utils/evaluationDeadline';
import { formatEvaluationDeadline } from '../utils/formatEvaluationDeadline';

const criteriaGroups = [
  {
    category: { en: 'Leadership & Institutional Management', am: 'አመራር እና ተቋማዊ አስተዳደር' },
    items: [
      { key: 'leadership', label: { en: 'Leadership and institutional management', am: 'አመራር እና ተቋማዊ አስተዳደር' } },
      { key: 'strategic_planning', label: { en: 'Strategic planning and execution', am: 'ስትራቴጂካዊ እቅድ እና አፈጻጸም' } },
    ],
  },
  {
    category: { en: 'Academic Quality Assurance', am: 'የትምህርት ጥራት ማረጋገጫ' },
    items: [
      { key: 'academic_quality', label: { en: 'Academic quality assurance', am: 'የትምህርት ጥራት ማረጋገጫ' } },
    ],
  },
  {
    category: { en: 'Communication & Stakeholder Engagement', am: 'ግንኙነት እና የባለድርሻ አካላት ተሳትፎ' },
    items: [
      { key: 'stakeholder_engagement', label: { en: 'Communication and stakeholder engagement', am: 'ግንኙነት እና የባለድርሻ አካላት ተሳትፎ' } },
    ],
  },
  {
    category: { en: 'Accountability & Reporting', am: 'ተጠያቂነት እና ሪፖርት ማድረግ' },
    items: [
      { key: 'accountability', label: { en: 'Accountability, reporting, and follow-through', am: 'ተጠያቂነት፣ ሪፖርት እና ተከታታይ አፈጻጸም' } },
    ],
  },
];

const labels = {
  en: {
    title: 'Academic Directorate Evaluation Form',
    subtitle: 'Evaluate performance using the shared 1-5 scale.',
    name: 'Staff Name (Evaluated Staff)',
    deadline: 'Deadline & Time Remaining',
    department: 'Department & College',
    term: 'Academic Year & Semester',
    scale: 'Shared rating scale: 1 = lowest, 5 = highest, NA = not applicable.',
    strengths: 'Strengths and key achievements',
    weaknesses: 'Areas for improvement',
    cancel: 'Cancel',
    close: 'Close',
    submit: 'Submit Evaluation',
    update: 'Update Evaluation',
    submitting: 'Submitting...',
    viewOnly: 'Evaluation details',
    noDeadline: 'No deadline set',
    open: 'Open (auto-lock off)',
    dayShort: 'd',
    left: 'left',
    passed: 'Deadline passed',
    validationError: 'Rate every criterion from 1 to 5 or mark it NA. At least one criterion needs a numeric rating.',
    scoreTitle: 'Vice President Evaluation · 30%',
    scorePrompt: 'Rate at least one criterion to calculate.',
    scoreResult: 'Evaluation score',
    closeAria: 'Close evaluation',
  },
  am: {
    title: 'የአካዳሚክ ዳይሬክቶሬት ግምገማ ቅጽ',
    subtitle: 'የጋራውን ከ1-5 መለኪያ በመጠቀም አፈጻጸምን ይገምግሙ።',
    name: 'የሰራተኛ ስም (የሚገመገም)',
    deadline: 'የመጨረሻ ቀን እና የቀረው ጊዜ',
    department: 'ዲፓርትመንት እና ኮሌጅ',
    term: 'የትምህርት ዓመት እና ሴሚስተር',
    scale: 'የጋራ መለኪያ፦ 1 = ዝቅተኛ፣ 5 = ከፍተኛ፣ NA = አይመለከትም።',
    strengths: 'ጥንካሬዎች እና ዋና ስኬቶች',
    weaknesses: 'ማሻሻያ የሚያስፈልጋቸው ነጥቦች',
    cancel: 'ሰርዝ',
    close: 'ዝጋ',
    submit: 'ግምገማውን አስገባ',
    update: 'ግምገማውን አዘምን',
    submitting: 'በመላክ ላይ...',
    viewOnly: 'የግምገማ ዝርዝር',
    noDeadline: 'የመጨረሻ ቀን አልተወሰነም',
    open: 'ክፍት (ራስ-ሰር መቆለፊያ ጠፍቷል)',
    dayShort: 'ቀን',
    left: 'ቀርቷል',
    passed: 'የመጨረሻ ቀን አልፏል',
    validationError: 'ለእያንዳንዱ መስፈርት ከ1 እስከ 5 ይስጡ ወይም NA ብለው ይምረጡ። ቢያንስ አንድ መስፈርት ቁጥራዊ ውጤት ሊኖረው ይገባል።',
    scoreTitle: 'የምክትል ፕሬዝዳንት ግምገማ · 30%',
    scorePrompt: 'ለማስላት ቢያንስ አንድ መስፈርት ይሙሉ።',
    scoreResult: 'የግምገማ ውጤት',
    closeAria: 'ግምገማውን ዝጋ',
  },
};

const parseRatings = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
};

const formatDeadline = (deadline, language, autoLock = true) => {
  const copy = labels[language] || labels.en;
  if (!deadline) return { date: copy.noDeadline, badge: copy.noDeadline, tone: 'neutral', expired: false };
  const state = getDeadlineState(deadline);
  const date = state.date ? formatEvaluationDeadline(deadline, language === 'am' ? 'am-ET' : 'en-US') : String(deadline);
  if (state.expired) return { date, badge: autoLock ? copy.passed : copy.open, tone: autoLock ? state.tone : 'neutral', expired: autoLock };
  if (state.daysRemaining == null) return { date, badge: copy.noDeadline, tone: state.tone, expired: false };
  return { date, badge: `${state.daysRemaining}${copy.dayShort} ${copy.left}`, tone: state.tone, expired: false };
};

const scoreFromRatings = (ratings) => {
  const responses = criteriaGroups.flatMap((group) => group.items).map(({ key }) => ratings[key]);
  if (responses.some((value) => value !== 'NA' && (!Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 5))) return null;
  const values = responses.filter((value) => value !== 'NA').map(Number);
  if (!values.length) return null;
  return Number(((values.reduce((sum, value) => sum + value, 0) / (values.length * 5)) * 100).toFixed(2));
};

const VicePresidentEvaluationModal = ({ open, candidate, mode = 'create', isSubmitting = false, errorMessage = '', onClose, onSubmit }) => {
  const { language, setLanguage } = useContext(LanguageContext);
  const [ratings, setRatings] = useState({});
  const [strengths, setStrengths] = useState('');
  const [weaknesses, setWeaknesses] = useState('');
  const [formError, setFormError] = useState('');
  const isReadOnly = mode === 'view';
  const copy = labels[language] || labels.en;
  const score = useMemo(() => scoreFromRatings(ratings), [ratings]);
  const autoLock = candidate?.deadline_auto_lock === undefined || Number(candidate.deadline_auto_lock) !== 0;
  const deadline = useMemo(() => formatDeadline(candidate?.deadline, language, autoLock), [candidate?.deadline, language, autoLock]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event) => { if (event.key === 'Escape' && !isSubmitting) onClose(); };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open, isSubmitting, onClose]);

  useEffect(() => {
    if (!open || !candidate) return;
    setRatings(parseRatings(candidate.ratings));
    setStrengths(candidate.strengths || '');
    setWeaknesses(candidate.weaknesses || '');
    setFormError('');
  }, [candidate, mode, open]);

  if (!open || !candidate) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    if (score === null) {
      setFormError(copy.validationError);
      return;
    }
    if (deadline.expired) {
      setFormError(copy.passed);
      return;
    }
    await onSubmit({ candidate, ratings, strengths, weaknesses });
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSubmitting) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="vice-president-evaluation-title" className="flex max-h-[min(92vh,900px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-800">MEKDELA AMBA UNIVERSITY</p>
            <h2 id="vice-president-evaluation-title" className="mt-1 text-xl font-bold text-slate-900">{copy.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{copy.subtitle}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <LanguageToggle language={language} onChange={setLanguage} />
            <button type="button" onClick={onClose} disabled={isSubmitting} aria-label={copy.closeAria} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"><X size={20} /></button>
          </div>
        </header>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-7">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <article className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{copy.name}</p>
                <p className="mt-2 break-words font-semibold text-slate-900">{candidate.full_name || candidate.email}</p>
                <p className="mt-1 text-xs text-slate-500">ID: {candidate.employee_id || candidate.academic_directorate_id}</p>
              </article>
              <article className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{copy.deadline}</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{deadline.date}</p>
                <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${deadlineToneClasses[deadline.tone]}`}><Clock3 size={13} />{deadline.badge}</span>
              </article>
              <article className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{copy.department}</p>
                <p className="mt-2 break-words font-semibold text-slate-900">{candidate.department_name || '—'}</p>
                <p className="mt-1 break-words text-sm text-slate-600">{candidate.college_name || '—'}</p>
              </article>
              <article className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{copy.term}</p>
                <p className="mt-2 font-semibold text-slate-900">{candidate.academic_year || '—'}</p>
                <p className="mt-1 text-sm text-slate-600">{candidate.semester || '—'}</p>
              </article>
            </div>

            <p className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">{copy.scale}</p>
            {errorMessage || formError ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{errorMessage || formError}</p> : null}
            {isReadOnly && <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{copy.viewOnly}</p>}

            <div className="space-y-4">
              {criteriaGroups.map((group) => (
                <section key={group.category.en} className="overflow-hidden rounded-lg border border-slate-200">
                  <h3 className="bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800">{group.category[language]}</h3>
                  <div className="divide-y divide-slate-100">
                    {group.items.map((criterion) => (
                      <fieldset key={criterion.key} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <legend className="text-sm font-medium text-slate-800">{criterion.label[language]}</legend>
                        <div className="flex flex-wrap gap-2" role="group" aria-label={criterion.label[language]}>
                          {[1, 2, 3, 4, 5, 'NA'].map((value) => {
                            const selected = String(ratings[criterion.key]) === String(value);
                            return <button key={value} type="button" disabled={isReadOnly || isSubmitting} aria-pressed={selected} onClick={() => setRatings((current) => ({ ...current, [criterion.key]: value }))} className={`min-w-10 rounded-full border px-3 py-2 text-sm font-semibold transition ${selected ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-blue-500 hover:text-blue-700'} disabled:cursor-default disabled:opacity-70`}>{value}</button>;
                          })}
                        </div>
                      </fieldset>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
              <div><p className="text-sm font-semibold text-slate-800">{copy.scoreTitle}</p><p className="text-xs text-slate-500">{score === null ? copy.scorePrompt : `${copy.scoreResult} ${score.toFixed(2)} / 100`}</p></div>
              <strong className="text-lg text-blue-800">{score === null ? '—' : `${(score * 0.3).toFixed(2)} / 30`}</strong>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-semibold text-slate-700">{copy.strengths}<textarea rows={3} maxLength={4000} value={strengths} onChange={(event) => setStrengths(event.target.value)} disabled={isReadOnly || isSubmitting} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50" /></label>
              <label className="block text-sm font-semibold text-slate-700">{copy.weaknesses}<textarea rows={3} maxLength={4000} value={weaknesses} onChange={(event) => setWeaknesses(event.target.value)} disabled={isReadOnly || isSubmitting} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50" /></label>
            </div>
          </div>

          <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="min-h-11 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{isReadOnly ? copy.close : copy.cancel}</button>
            {!isReadOnly && <button type="submit" disabled={isSubmitting || score === null || deadline.expired} className="min-h-11 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300">{isSubmitting ? copy.submitting : mode === 'edit' ? copy.update : copy.submit}</button>}
          </footer>
        </form>
      </section>
    </div>
  );
};

export default VicePresidentEvaluationModal;