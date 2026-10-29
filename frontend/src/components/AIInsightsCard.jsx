import { useEffect, useState } from 'react';
import { AlertTriangle, BrainCircuit, CheckCircle2, RefreshCw, Sparkles } from 'lucide-react';
import { aiApi } from '../services/api';

const AIInsightsCard = ({ action, input = {}, title = 'AI Insights', description = 'Evidence-based guidance for your current evaluation data.', autoLoad = false }) => {
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadInsight = async () => {
    setLoading(true);
    setError('');
    try {
      setInsight(await aiApi.getInsight(action, input));
    } catch (requestError) {
      setError(requestError?.message || 'Unable to load AI insight.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoLoad) void loadInsight();
  }, [autoLoad]);

  return (
    <section className="overflow-hidden rounded-2xl border border-cyan-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-cyan-100 bg-gradient-to-r from-cyan-50 to-blue-50 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-600 text-white shadow-lg shadow-cyan-600/20"><BrainCircuit size={20} /></span>
          <div><div className="flex items-center gap-2"><h3 className="font-bold text-slate-900">{title}</h3><span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-700 ring-1 ring-cyan-200"><Sparkles size={11} /> AI</span></div><p className="mt-1 text-sm text-slate-600">{description}</p></div>
        </div>
        <button type="button" onClick={() => void loadInsight()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-700 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />{loading ? 'Analyzing...' : insight ? 'Refresh' : 'Generate Insight'}</button>
      </div>
      <div className="p-5">
        {loading && <div className="space-y-3" aria-live="polite"><div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" /><div className="h-4 w-full animate-pulse rounded bg-slate-100" /><div className="h-4 w-5/6 animate-pulse rounded bg-slate-100" /></div>}
        {error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertTriangle size={17} className="mt-0.5 shrink-0" />{error}</div>}
        {!loading && !error && !insight && <p className="text-sm text-slate-500">Generate an insight when the relevant evaluation data is ready.</p>}
        {!loading && insight && <div className="space-y-5"><div><h4 className="font-semibold text-slate-900">{insight.title}</h4><p className="mt-1 text-sm leading-6 text-slate-600">{insight.summary}</p></div>{insight.sentiment && <div><p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Sentiment</p><div className="flex h-2 overflow-hidden rounded-full bg-slate-100"><span className="bg-emerald-500" style={{ width: `${insight.sentiment.positive}%` }} /><span className="bg-slate-400" style={{ width: `${insight.sentiment.neutral}%` }} /><span className="bg-rose-500" style={{ width: `${insight.sentiment.negative}%` }} /></div><div className="mt-2 flex gap-4 text-xs text-slate-500"><span className="text-emerald-700">Positive {insight.sentiment.positive}%</span><span>Neutral {insight.sentiment.neutral}%</span><span className="text-rose-700">Negative {insight.sentiment.negative}%</span></div></div>}{[['Strengths', insight.strengths], ['Areas for Growth', insight.areasForGrowth], ['Recommendations', insight.recommendations], ['Risks', insight.risks], ['Flags', insight.flags]].map(([label, items]) => items?.length ? <div key={label}><p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p><ul className="space-y-2">{items.map((item, index) => <li key={`${label}-${index}`} className="flex gap-2 text-sm leading-5 text-slate-700"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-cyan-600" />{item}</li>)}</ul></div> : null)}</div>}
      </div>
    </section>
  );
};

export default AIInsightsCard;