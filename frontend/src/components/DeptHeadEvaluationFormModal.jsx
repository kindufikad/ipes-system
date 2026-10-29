import { useEffect, useMemo, useState, useContext } from 'react';
import { X } from 'lucide-react';
import { LanguageContext } from '../context/LanguageContext';
import LanguageToggle from './LanguageToggle';

const criteria = [
  {
    id: 'academic_assessment_compliance',
    title: 'Academic & Assessment Compliance',
    criterion_text: 'Timely submission of course outlines, exam papers, continuous assessments, and final grades.',
  },
  {
    id: 'student_advising_mentorship',
    title: 'Student Advising & Mentorship',
    criterion_text: 'Regular availability during scheduled office hours and effective guidance for Senior Essays/Projects.',
  },
  {
    id: 'research_community_service',
    title: 'Research & Community Service',
    criterion_text: 'Active engagement in academic research, publications, capacity-building workshops, and community outreach.',
  },
  {
    id: 'professional_ethics_punctuality',
    title: 'Professional Ethics & Punctuality',
    criterion_text: 'Consistent attendance in classes and department meetings, adherence to university regulations, and professional code of conduct.',
  },
  {
    id: 'instructional_innovation_e_learning',
    title: 'Instructional Innovation & E-Learning Adoption',
    criterion_text: 'Effective use of modern teaching methodologies, practical/lab sessions, and digital learning platforms (LMS).',
  },
];

const copy = {
  en: { title: 'Evaluate Department Head', scale: '1 = Very Low, 2 = Low, 3 = Average, 4 = High, 5 = Very High', deadline: 'Deadline', strengths: 'Strengths / Key Achievements', weaknesses: 'Areas for Improvement', submit: 'Submit Evaluation', update: 'Update Evaluation', cancel: 'Cancel', close: 'Close', submitting: 'Submitting...', score: 'Score', required: 'Please rate every criterion before submitting.' },
  am: { title: 'የዲፓርትመንት ኃላፊ ግምገማ', scale: '1 = በጣም ዝቅተኛ፣ 2 = ዝቅተኛ፣ 3 = መካከለኛ፣ 4 = ከፍተኛ፣ 5 = በጣም ከፍተኛ', deadline: 'መጨረሻ ቀን', strengths: 'ጥንካሬዎች / ዋና ስኬቶች', weaknesses: 'ማሻሻያ የሚያስፈልጋቸው አካባቢዎች', submit: 'ግምገማ ያስገቡ', update: 'ግምገማ ያዘምኑ', cancel: 'ሰርዝ', close: 'ዝጋ', submitting: 'በመላክ ላይ...', score: 'ውጤት', required: 'ከመላክዎ በፊት ሁሉንም መስፈርቶች ይመዝኑ።' },
};

const DeptHeadEvaluationFormModal = ({ open, head, mode = 'create', onClose, onSubmit, submitting = false, error = '' }) => {
  const { language, toggleLanguage } = useContext(LanguageContext);
  const [scores, setScores] = useState({});
  const [strengths, setStrengths] = useState('');
  const [weaknesses, setWeaknesses] = useState('');
  const [localError, setLocalError] = useState('');
  const t = copy[language] || copy.en;

  useEffect(() => {
    if (!open) return;
    const saved = typeof head?.criteria_scores === 'string' ? (() => { try { return JSON.parse(head.criteria_scores); } catch { return {}; } })() : (head?.criteria_scores || {});
    setScores(mode === 'edit' ? saved : {});
    setStrengths(mode === 'edit' ? head?.strengths || '' : '');
    setWeaknesses(mode === 'edit' ? head?.weaknesses || '' : '');
    setLocalError('');
  }, [open, head, mode]);

  const totalScore = useMemo(() => {
    return criteria.reduce((sum, criterion) => sum + ((Number(scores[criterion.id]) || 0) / 5) * 6, 0);
  }, [scores]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (criteria.some((criterion) => !scores[criterion.id])) {
      setLocalError(t.required);
      return;
    }
    setLocalError('');
    onSubmit({ instructor_id: head.instructor_id, criteria_scores: scores, total_score: Number(totalScore.toFixed(2)), strengths, weaknesses, deadline: head.deadline });
  };

  if (!open || !head) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="dept-head-evaluation-title">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div><h2 id="dept-head-evaluation-title" className="text-xl font-bold text-slate-900">{t.title}</h2><p className="mt-1 text-sm text-slate-500">{head.department_head_name}</p></div>
          <div className="flex items-center gap-2"><LanguageToggle language={language} onChange={toggleLanguage} /><button type="button" onClick={onClose} aria-label={t.close} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
        </div>
        <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900"><div className="flex flex-wrap justify-between gap-3"><span>{t.scale}</span><strong>{t.deadline}: {head.deadline || '-'}</strong></div></div>
        {error || localError ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error || localError}</div> : null}
        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          <fieldset className="space-y-3">
            <legend className="border-b border-slate-200 pb-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Academic Performance Criteria</legend>
            {criteria.map((criterion, index) => (
              <div key={criterion.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-900"><span className="mr-2 font-mono text-xs text-slate-400">{index + 1}.</span>{criterion.title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{criterion.criterion_text}</p>
                <div className="mt-3 flex gap-2" role="group" aria-label={`Rating for ${criterion.title}`}>
                  {[1, 2, 3, 4, 5].map((rating) => <button key={rating} type="button" onClick={() => setScores((current) => ({ ...current, [criterion.id]: rating }))} aria-pressed={scores[criterion.id] === rating} className={`h-10 w-10 rounded-full text-sm font-bold ${scores[criterion.id] === rating ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:ring-blue-400'}`}>{rating}</button>)}
                </div>
              </div>
            ))}
          </fieldset>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-right font-bold text-blue-700">{t.score}: {totalScore.toFixed(2)} / 30</div>
          <label className="block text-sm font-medium text-slate-700">{t.strengths}<textarea rows="3" value={strengths} onChange={(event) => setStrengths(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3" /></label>
          <label className="block text-sm font-medium text-slate-700">{t.weaknesses}<textarea rows="3" value={weaknesses} onChange={(event) => setWeaknesses(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3" /></label>
          <div className="flex justify-end gap-3"><button type="button" onClick={onClose} disabled={submitting} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600">{t.cancel}</button><button type="submit" disabled={submitting} className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{submitting ? t.submitting : mode === 'edit' ? t.update : t.submit}</button></div>
        </form>
      </div>
    </div>
  );
};

export default DeptHeadEvaluationFormModal;
