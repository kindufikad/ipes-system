import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const DepartmentPerformanceAnalytics = ({ data = [] }) => (
  <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm" aria-labelledby="department-performance-analytics-title">
    <div className="mb-6">
      <h2 id="department-performance-analytics-title" className="text-lg font-semibold text-slate-900">Department Performance Analytics</h2>
      <p className="text-sm text-slate-600">Monitor evaluation coverage and overall satisfaction per department.</p>
    </div>
    <div className="h-80">
      {data.length ? (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 8 }}>
            <XAxis dataKey="department" tick={{ fill: '#64748b', fontSize: 12 }} interval={0} angle={data.length > 4 ? -25 : 0} textAnchor={data.length > 4 ? 'end' : 'middle'} height={data.length > 4 ? 55 : 30} />
            <YAxis domain={[0, 'auto']} ticks={[0, 20, 40, 60, 80]} tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(value) => `${value}%`} />
            <Tooltip formatter={(value) => [`${value}%`, 'Satisfaction']} />
            <Bar dataKey="satisfaction" fill="#0EA5E9" radius={[10, 10, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-full items-center justify-center rounded-2xl bg-slate-50 text-sm text-slate-500">No evaluation scores are available yet.</div>
      )}
    </div>
  </section>
);

export default DepartmentPerformanceAnalytics;