import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';

const AuditTimelineModal = ({ open, logs = [], onClose }) => {
  const [query, setQuery] = useState('');
  const [expandedLogIds, setExpandedLogIds] = useState(() => new Set());

  const filteredLogs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return logs;
    return logs.filter((entry) => (
      [entry.user, entry.action, entry.desc, entry.ip, entry.browser]
        .some((value) => String(value || '').toLowerCase().includes(normalizedQuery))
    ));
  }, [logs, query]);

  const toggleLog = (id) => {
    setExpandedLogIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="audit-timeline-title">
      <div className="flex max-h-[min(760px,calc(100vh-2rem))] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Security control plane</p>
            <h2 id="audit-timeline-title" className="mt-1 text-xl font-semibold tracking-tight text-slate-950">All Activity</h2>
            <p className="mt-1 text-sm text-slate-500">Review the complete audit timeline and event metadata.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close activity modal" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><X size={20} /></button>
        </header>

        <div className="border-b border-slate-200 px-6 py-4">
          <div className="relative max-w-xl">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search activity, user, description, or IP address" className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
          </div>
        </div>

        <div className="overflow-y-auto px-6">
          {filteredLogs.length ? filteredLogs.map((entry) => (
            <article key={entry.id} className="border-b border-slate-100 py-4 last:border-0">
              <button type="button" onClick={() => toggleLog(entry.id)} aria-expanded={expandedLogIds.has(entry.id)} className="flex w-full items-start gap-3 text-left">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-start justify-between gap-2">
                    <span className="font-semibold text-slate-900">{entry.action || 'System event'}</span>
                    <span className="flex items-center gap-2 text-xs text-slate-400">{entry.time || '--'}{expandedLogIds.has(entry.id) ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span>
                  </span>
                  <span className="mt-1 block text-sm text-slate-600">{entry.desc || '--'}</span>
                  <span className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500"><span>By {entry.user || 'System'}</span><span>IP: {entry.ip || 'N/A'}</span></span>
                </span>
              </button>
              {expandedLogIds.has(entry.id) ? <div className="ml-5 mt-3 border-l border-slate-200 pl-4 text-xs text-slate-500"><p>Event ID: {entry.id}</p><p className="mt-1 break-all">Client: {entry.browser || 'Not recorded'}</p></div> : null}
            </article>
          )) : <p className="py-12 text-center text-sm text-slate-500">No activity matches your search.</p>}
        </div>

        <footer className="border-t border-slate-200 px-6 py-4 text-sm text-slate-500">Showing {filteredLogs.length} of {logs.length} events</footer>
      </div>
    </div>
  );
};

export default AuditTimelineModal;
