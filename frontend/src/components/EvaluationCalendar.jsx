import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  BellRing,
  CalendarDays,
  Download,
  Filter,
  Grid3X3,
  ListFilter,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

const calendarTypeStyles = {
  Evaluation: {
    badge: 'bg-blue-50 text-blue-700 ring-blue-200',
    dot: 'bg-blue-500',
    panel: 'from-blue-500 to-cyan-500',
  },
  Review: {
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    dot: 'bg-emerald-500',
    panel: 'from-emerald-500 to-teal-500',
  },
  Audit: {
    badge: 'bg-amber-50 text-amber-700 ring-amber-200',
    dot: 'bg-amber-500',
    panel: 'from-amber-500 to-orange-500',
  },
  Deadline: {
    badge: 'bg-rose-50 text-rose-700 ring-rose-200',
    dot: 'bg-rose-500',
    panel: 'from-rose-500 to-red-500',
  },
};

const statusStyles = {
  Scheduled: 'bg-slate-100 text-slate-700 ring-slate-200',
  'In Progress': 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  Critical: 'bg-rose-100 text-rose-700 ring-rose-200',
};

const getDateKey = (dateValue) => {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return String(dateValue).slice(0, 10);
  return date.toISOString().slice(0, 10);
};

const formatCalendarDate = (value, calendarMode = 'G.C.') => {
  if (!value) return '—';
  const rawDate = new Date(value);
  if (Number.isNaN(rawDate.getTime())) return value;

  if (calendarMode === 'E.C.') {
    return toEthiopianDate(rawDate);
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(rawDate);
};

const toEthiopianDate = (date) => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  const ethiopianYear = year - 7;
  const ethiopianMonths = [
    'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit', 'Megabit', 'Miazia', 'Genbot', 'Sene', 'Hamle', 'Nehase', 'Pagume',
  ];

  const monthIndex = ((month + 8) % 12) - 1;
  const safeMonthIndex = monthIndex < 0 ? monthIndex + 12 : monthIndex;
  const ethiopianMonth = ethiopianMonths[safeMonthIndex] || 'Pagume';
  const ethiopianDay = String(day).padStart(2, '0');

  return `${ethiopianDay}-${ethiopianMonth}-${ethiopianYear} E.C.`;
};

const getAcademicYearOptions = () => ['2025/2026', '2024/2025', '2023/2024'];
const getSemesterOptions = () => ['Semester I', 'Semester II', 'Kiremt'];
const getRoleOptions = () => ['All', 'Student', 'Dept Head', 'Peer', 'Admin'];

const getCountdownText = (dateStr, timeStr) => {
  if (!dateStr) return null;

  const target = new Date(`${dateStr}T${timeStr || '00:00'}:00`);
  const now = new Date();
  const diff = target.getTime() - now.getTime();

  if (diff <= 0) return 'Closed';

  const totalHours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days > 0) return `Starts in ${days} day${days > 1 ? 's' : ''}`;
  if (hours > 0) return `Starts in ${hours} hour${hours > 1 ? 's' : ''}`;

  const minutes = Math.max(1, Math.floor((diff / (1000 * 60)) % 60));
  return `Starts in ${minutes} min`;
};

const detectConflict = (events, candidate) => {
  if (!candidate?.date || !candidate?.department) return false;

  return events.some((event) => {
    if (event.department !== candidate.department) return false;
    if (event.type !== candidate.type) return false;
    if (event.date !== candidate.date) return false;
    if (event.id === candidate.id) return false;

    const existingStart = new Date(`${event.date}T${event.time || '00:00'}`);
    const candidateStart = new Date(`${candidate.date}T${candidate.time || '00:00'}`);
    const existingEnd = new Date(existingStart.getTime() + 2 * 60 * 60 * 1000);
    const candidateEnd = new Date(candidateStart.getTime() + 2 * 60 * 60 * 1000);

    return candidateStart < existingEnd && candidateEnd > existingStart;
  });
};

const formatExportDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(date);
};

const languageLabel = (department, language = 'en') => {
  if (!department) return 'Department';
  return language === 'am' ? department.am || department.name : department.en || department.name || 'Department';
};

const EvaluationCalendar = ({ initialCollegeData = [], onCreateEvent }) => {
  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date('2026-08-20'));
  const [viewMode, setViewMode] = useState('calendar');
  const [calendarMode, setCalendarMode] = useState('G.C.');
  const [academicYear, setAcademicYear] = useState('2025/2026');
  const [semester, setSemester] = useState('Semester I');
  const [collegeFilter, setCollegeFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('All');
  const [selectedType, setSelectedType] = useState('All');
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [draft, setDraft] = useState({
    title: '',
    date: '2026-08-20',
    time: '09:00',
    type: 'Evaluation',
    college: initialCollegeData[0]?.id || 'college-1',
    department: 'dept-1-1',
    role: 'Student',
    location: '',
    description: '',
    academicYear: '2025/2026',
    semester: 'Semester I',
  });

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);

      try {
        const response = await axios.get('/api/calendar/events');
        const payload = Array.isArray(response?.data) ? response.data : response?.data?.data || [];

        if (payload.length) {
          setEvents(
            payload.map((event) => ({
              ...event,
              id: event.id || Date.now() + Math.random(),
              title: event.title || 'Evaluation Event',
              type: event.type || 'Evaluation',
              date: event.date || event.start_date || '2026-08-20',
              time: event.time || '09:00',
              college: event.college || 'college-1',
              department: event.department || 'dept-1-1',
              role: event.role || 'Student',
              status: event.status || 'Scheduled',
              academicYear: event.academicYear || '2025/2026',
              semester: event.semester || 'Semester I',
            }))
          );
        } else {
          setEvents([]);
        }
      } catch (error) {
        setEvents([]);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, []);

  const allDepartments = useMemo(() => {
    const options = [];
    initialCollegeData.forEach((college) => {
      college.departments?.forEach((department) => {
        options.push({
          id: department.id,
          label: languageLabel(department, 'en'),
          college: college.id,
        });
      });
    });
    return options;
  }, [initialCollegeData]);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const typeMatch = selectedType === 'All' || event.type === selectedType;
      const academicMatch = event.academicYear === academicYear;
      const semesterMatch = event.semester === semester;
      const collegeMatch = collegeFilter === 'all' || event.college === collegeFilter;
      const departmentMatch = departmentFilter === 'all' || event.department === departmentFilter;
      const roleMatch = roleFilter === 'All' || event.role === roleFilter;
      return typeMatch && academicMatch && semesterMatch && collegeMatch && departmentMatch && roleMatch;
    });
  }, [events, selectedType, academicYear, semester, collegeFilter, departmentFilter, roleFilter]);

  const currentMonthStart = useMemo(() => {
    const base = new Date(selectedDate);
    base.setDate(1);
    base.setHours(0, 0, 0, 0);
    return base;
  }, [selectedDate]);

  const monthDays = useMemo(() => {
    const firstDay = new Date(currentMonthStart);
    const firstWeekDay = (firstDay.getDay() + 6) % 7;
    const startDate = new Date(firstDay);
    startDate.setDate(firstDay.getDate() - firstWeekDay);

    const days = [];
    for (let i = 0; i < 42; i += 1) {
      const current = new Date(startDate);
      current.setDate(startDate.getDate() + i);
      days.push(current);
    }
    return days;
  }, [currentMonthStart]);

  const selectedDayEvents = useMemo(() => {
    const selectedKey = getDateKey(selectedDate);
    return filteredEvents.filter((event) => getDateKey(event.date) === selectedKey);
  }, [filteredEvents, selectedDate]);

  const upcomingEvents = useMemo(() => {
    const today = new Date();
    return [...filteredEvents]
      .filter((event) => new Date(`${event.date}T${event.time || '00:00'}:00`) >= today)
      .sort((a, b) => new Date(`${a.date}T${a.time || '00:00'}:00`) - new Date(`${b.date}T${b.time || '00:00'}:00`))
      .slice(0, 6);
  }, [filteredEvents]);

  const stats = useMemo(
    () => ({
      total: filteredEvents.length,
      evaluation: filteredEvents.filter((item) => item.type === 'Evaluation').length,
      review: filteredEvents.filter((item) => item.type === 'Review').length,
      audit: filteredEvents.filter((item) => item.type === 'Audit').length,
      deadline: filteredEvents.filter((item) => item.type === 'Deadline').length,
    }),
    [filteredEvents]
  );

  const monthLabel = useMemo(() => {
    return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(currentMonthStart);
  }, [currentMonthStart]);

  const handleAddEvent = async (event) => {
    event.preventDefault();

    if (!draft.title.trim()) {
      toast.error('Please enter a calendar event title.');
      return;
    }

    const candidate = { ...draft, title: draft.title.trim(), id: Date.now(), date: draft.date, time: draft.time };

    const hasConflict = detectConflict(events, candidate);
    if (hasConflict) {
      toast.error('Conflict detected: this department already has an overlapping evaluation window.');
      return;
    }

    try {
      const payload = {
        title: candidate.title,
        type: candidate.type,
        status: 'Scheduled',
        date: candidate.date,
        time: candidate.time,
        college: candidate.college,
        department: candidate.department,
        role: candidate.role,
        location: candidate.location || 'TBD',
        description: candidate.description || 'Academic scheduling event',
        academicYear: candidate.academicYear,
        semester: candidate.semester,
      };

      const response = await axios.post('/api/calendar/add', payload);
      const savedEvent = response?.data?.data || response?.data || payload;
      const normalizedEvent = {
        ...savedEvent,
        id: savedEvent.id || Date.now(),
        title: savedEvent.title || candidate.title,
        type: savedEvent.type || candidate.type,
        date: savedEvent.date || candidate.date,
        time: savedEvent.time || candidate.time,
        college: savedEvent.college || candidate.college,
        department: savedEvent.department || candidate.department,
        role: savedEvent.role || candidate.role,
        status: savedEvent.status || 'Scheduled',
        academicYear: savedEvent.academicYear || candidate.academicYear,
        semester: savedEvent.semester || candidate.semester,
      };

      setEvents((current) => [normalizedEvent, ...current]);
      toast.success('Calendar event added successfully.');
      if (onCreateEvent) onCreateEvent(normalizedEvent);
      setDraft({
        title: '',
        date: candidate.date,
        time: '09:00',
        type: 'Evaluation',
        college: candidate.college,
        department: candidate.department,
        role: candidate.role,
        location: '',
        description: '',
        academicYear: candidate.academicYear,
        semester: candidate.semester,
      });
      setShowCreateModal(false);
    } catch (error) {
      console.error('Calendar add failed:', error);
      toast.error(error?.response?.data?.message || 'Unable to add event.');
    }
  };

  const handleDeleteEvent = async (eventId) => {
    try {
      await axios.delete(`/api/calendar/events/${eventId}`);
      setEvents((current) => current.filter((event) => event.id !== eventId));
      toast.success('Calendar event deleted successfully.');
    } catch (error) {
      console.error('Calendar delete failed:', error);
      toast.error(error?.response?.data?.message || 'Unable to delete event.');
    }
  };

  const handleNotifyStakeholders = async (event) => {
    try {
      await axios.post('/api/broadcasts/send', {
        audience: 'all',
        message: `Reminder: ${event.title} is scheduled for ${formatExportDate(event.date)} at ${event.time}.`,
        eventId: event.id,
        eventType: event.type,
      });
      toast.success('Stakeholder notifications sent successfully.');
    } catch (error) {
      console.error('Broadcast send failed:', error);
      toast.error('Notification delivery failed. Please retry.');
    }
  };

  const handleExport = (format) => {
    if (format === 'csv') {
      const header = ['title', 'type', 'date', 'time', 'college', 'department', 'role', 'status'];
      const rows = filteredEvents.map((event) => [
        event.title,
        event.type,
        event.date,
        event.time,
        event.college,
        event.department,
        event.role,
        event.status,
      ]);
      const csv = [header, ...rows]
        .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'evaluation-calendar.csv';
      link.click();
      URL.revokeObjectURL(url);
      toast.success('CSV export downloaded.');
      return;
    }

    if (format === 'ics') {
      const calendarItems = filteredEvents
        .map((event) => {
          const start = new Date(`${event.date}T${event.time || '09:00'}:00`);
          const end = new Date(start.getTime() + 60 * 60 * 1000);
          const formatICS = (value) => value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
          return [
            'BEGIN:VEVENT',
            `UID:${event.id}@ipes`,
            `DTSTAMP:${formatICS(new Date())}`,
            `DTSTART:${formatICS(start)}`,
            `DTEND:${formatICS(end)}`,
            `SUMMARY:${event.title}`,
            `DESCRIPTION:${(event.description || '').replace(/\n/g, ' ')}`,
            'END:VEVENT',
          ].join('\n');
        })
        .join('\n');

      const icsContent = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//IPES//Evaluation Calendar//EN\n${calendarItems}\nEND:VCALENDAR`;
      const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'evaluation-calendar.ics';
      link.click();
      URL.revokeObjectURL(url);
      toast.success('ICS calendar file generated.');
      return;
    }

    const printable = filteredEvents.map((event) => `${event.title} — ${formatExportDate(event.date)} ${event.time}`).join('\n');
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`<pre>${printable}</pre>`);
    printWindow.document.close();
    printWindow.focus();
    toast.success('Printable calendar opened.');
  };

  return (
    <section className="space-y-4 p-3 md:p-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.35)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Academic hub</p>
            <h3 className="mt-1 text-xl font-bold text-slate-900">Evaluation Calendar</h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFilters((value) => !value)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              <Filter size={15} />
              Filter
            </button>

            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:opacity-95"
            >
              <Plus size={15} />
              Schedule Event
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <label className="block text-xs font-medium text-slate-600">
                <span className="mb-1.5 block uppercase tracking-[0.16em] text-slate-500">Academic year</span>
                <select value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none focus:border-blue-500">
                  {getAcademicYearOptions().map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-medium text-slate-600">
                <span className="mb-1.5 block uppercase tracking-[0.16em] text-slate-500">Semester</span>
                <select value={semester} onChange={(e) => setSemester(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none focus:border-blue-500">
                  {getSemesterOptions().map((phase) => (
                    <option key={phase} value={phase}>{phase}</option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-medium text-slate-600">
                <span className="mb-1.5 block uppercase tracking-[0.16em] text-slate-500">Scope</span>
                <select value={collegeFilter} onChange={(e) => setCollegeFilter(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none focus:border-blue-500">
                  <option value="all">All colleges</option>
                  {initialCollegeData.map((college) => (
                    <option key={college.id} value={college.id}>{college.en}</option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-medium text-slate-600">
                <span className="mb-1.5 block uppercase tracking-[0.16em] text-slate-500">Department</span>
                <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none focus:border-blue-500">
                  <option value="all">All departments</option>
                  {allDepartments.map((department) => (
                    <option key={department.id} value={department.id}>{department.label}</option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-medium text-slate-600">
                <span className="mb-1.5 block uppercase tracking-[0.16em] text-slate-500">Role</span>
                <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none focus:border-blue-500">
                  {getRoleOptions().map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_20px_35px_-30px_rgba(15,23,42,0.4)]">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: 'Total', value: stats.total, className: 'bg-slate-900 text-white' },
            { label: 'Evaluations', value: stats.evaluation, className: 'bg-blue-50 text-blue-700 ring-1 ring-blue-100' },
            { label: 'Reviews', value: stats.review, className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' },
            { label: 'Audits', value: stats.audit, className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100' },
            { label: 'Deadlines', value: stats.deadline, className: 'bg-rose-50 text-rose-700 ring-1 ring-rose-100' },
          ].map((stat) => (
            <div key={stat.label} className={`rounded-2xl px-3 py-2 ${stat.className}`}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-75">{stat.label}</p>
              <p className="mt-1 text-xl font-bold leading-none">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_16px_32px_-30px_rgba(15,23,42,0.35)]">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: 'calendar', label: 'Calendar Grid', icon: Grid3X3 },
            { key: 'list', label: 'Milestone List', icon: ListFilter },
            { key: 'agenda', label: 'Upcoming Agenda', icon: CalendarDays },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setViewMode(key)}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
                viewMode === key ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => handleExport('csv')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
              <Download size={14} /> CSV
            </button>
            <button type="button" onClick={() => handleExport('ics')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
              <CalendarDays size={14} /> ICS
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'calendar' && (
        <div className="grid gap-4 xl:grid-cols-[1.45fr_0.9fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.35)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Planner</p>
                <h3 className="mt-1 text-lg font-bold text-slate-900">{monthLabel}</h3>
              </div>

              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setSelectedDate(new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() - 1, 1))} className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">Prev</button>
                <button type="button" onClick={() => setSelectedDate(new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() + 1, 1))} className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">Next</button>
                <button type="button" onClick={() => setCalendarMode((mode) => (mode === 'G.C.' ? 'E.C.' : 'G.C.'))} className="rounded-xl border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100">
                  {calendarMode}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1.5 text-center text-[9px] font-semibold uppercase tracking-[0.17em] text-slate-400">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                <div key={day} className="py-2">{day}</div>
              ))}
            </div>

            <div className="mt-1 grid grid-cols-7 gap-1.5">
              {monthDays.map((day) => {
                const key = getDateKey(day);
                const matches = filteredEvents.filter((event) => getDateKey(event.date) === key);
                const isCurrentMonth = day.getMonth() === currentMonthStart.getMonth();
                const isSelected = getDateKey(selectedDate) === key;

                return (
                  <button
                    type="button"
                    key={key}
                    onClick={() => setSelectedDate(new Date(day))}
                    className={[
                      'relative min-h-[88px] rounded-2xl border p-1.5 text-left transition-all',
                      isCurrentMonth ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 text-slate-400',
                      isSelected ? 'border-blue-500 bg-blue-50 shadow-[0_14px_28px_-22px_rgba(59,130,246,0.8)]' : '',
                    ].join(' ')}
                  >
                    <span className={['inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold', isSelected ? 'bg-blue-600 text-white' : 'text-slate-700'].join(' ')}>
                      {day.getDate()}
                    </span>

                    <div className="mt-2 flex flex-wrap gap-1">
                      {matches.slice(0, 3).map((event) => (
                        <span key={`${key}-${event.id}`} className={`block h-2 w-2 rounded-full ${calendarTypeStyles[event.type]?.dot || 'bg-slate-400'}`} title={event.title} />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.35)]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Agenda</p>
                <h3 className="mt-1 text-lg font-bold text-slate-900">Selected day</h3>
              </div>
              <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">{selectedDayEvents.length} items</span>
            </div>

            {selectedDayEvents.length ? (
              <div className="space-y-2.5">
                {selectedDayEvents.map((event) => { 
                  const style = calendarTypeStyles[event.type] || calendarTypeStyles.Evaluation;
                  return (
                    <div key={event.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-900">{event.title}</p>
                          <p className="mt-1 text-xs text-slate-500">{event.role} • {event.location || 'TBD'}</p>
                        </div>
                        <span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-semibold ring-1 ${style.badge}`}>{event.type}</span>
                      </div>
                      <div className="mt-2 text-xs text-slate-600">
                        <p>{formatCalendarDate(event.date, calendarMode)} • {event.time}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500">No milestones on this day.</div>
            )}
          </div>
        </div>
      )}

      {viewMode === 'list' && (
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.35)]">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Timeline</p>
              <h3 className="mt-1 text-lg font-bold text-slate-900">Milestone pipeline</h3>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">{filteredEvents.length} active</span>
          </div>

          <div className="space-y-3">
            {filteredEvents.map((event) => {
              const style = calendarTypeStyles[event.type] || calendarTypeStyles.Evaluation;
              const countdown = getCountdownText(event.date, event.time);

              return (
                <div key={event.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-3">
                      <span className={`mt-1 inline-flex h-2.5 w-2.5 rounded-full ${style.dot}`} />
                      <div>
                        <p className="font-semibold text-slate-900">{event.title}</p>
                        <p className="text-xs text-slate-500">{event.role} • {event.location || 'TBD'}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-semibold ring-1 ${style.badge}`}>{event.type}</span>
                      <span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-semibold ring-1 ${statusStyles[event.status] || 'bg-slate-100 text-slate-700 ring-slate-200'}`}>{event.status}</span>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                    <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">{formatCalendarDate(event.date, calendarMode)}</span>
                    <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">{event.time}</span>
                    <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">{event.semester}</span>
                    {countdown && <span className="rounded-full bg-blue-100 px-2 py-1 font-medium text-blue-700">{countdown}</span>}
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-500">{event.description}</p>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => handleNotifyStakeholders(event)} className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-2.5 py-1.5 text-[10px] font-semibold text-white hover:bg-blue-500">
                        <BellRing size={12} /> Notify
                      </button>
                      <button type="button" onClick={() => handleDeleteEvent(event.id)} className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-100">
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {viewMode === 'agenda' && (
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.35)]">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Upcoming</p>
              <h3 className="mt-1 text-lg font-bold text-slate-900">Next milestones</h3>
            </div>
            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-indigo-700">{upcomingEvents.length} planned</span>
          </div>

          <div className="space-y-3">
            {upcomingEvents.map((event) => {
              const style = calendarTypeStyles[event.type] || calendarTypeStyles.Evaluation;
              return (
                <div key={event.id} className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{event.title}</p>
                      <p className="text-xs text-slate-500">{event.role} • {event.academicYear}</p>
                    </div>
                    <span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-semibold ring-1 ${style.badge}`}>{event.type}</span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                    <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">{formatCalendarDate(event.date, calendarMode)}</span>
                    <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">{event.time}</span>
                    <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">{event.semester}</span>
                    <span className="rounded-full bg-blue-100 px-2 py-1 font-medium text-blue-700">{getCountdownText(event.date, event.time)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_35px_80px_-35px_rgba(15,23,42,0.55)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Create</p>
                <h3 className="mt-1 text-xl font-bold text-slate-900">Add milestone</h3>
              </div>
              <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-600 hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddEvent} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  <span className="mb-1.5 block">Title</span>
                  <input value={draft.title} onChange={(e) => setDraft((current) => ({ ...current, title: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white" placeholder="Academic review cycle" required />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  <span className="mb-1.5 block">Type</span>
                  <select value={draft.type} onChange={(e) => setDraft((current) => ({ ...current, type: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white">
                    <option value="Evaluation">Evaluation</option>
                    <option value="Review">Review</option>
                    <option value="Audit">Audit</option>
                    <option value="Deadline">Deadline</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  <span className="mb-1.5 block">Date</span>
                  <input type="date" value={draft.date} onChange={(e) => setDraft((current) => ({ ...current, date: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white" required />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  <span className="mb-1.5 block">Time</span>
                  <input type="time" value={draft.time} onChange={(e) => setDraft((current) => ({ ...current, time: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white" required />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  <span className="mb-1.5 block">College</span>
                  <select value={draft.college} onChange={(e) => setDraft((current) => ({ ...current, college: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white">
                    {initialCollegeData.map((college) => (
                      <option key={college.id} value={college.id}>{college.en}</option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  <span className="mb-1.5 block">Department</span>
                  <select value={draft.department} onChange={(e) => setDraft((current) => ({ ...current, department: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white">
                    {allDepartments.map((department) => (
                      <option key={department.id} value={department.id}>{department.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  <span className="mb-1.5 block">Role</span>
                  <select value={draft.role} onChange={(e) => setDraft((current) => ({ ...current, role: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white">
                    {getRoleOptions().filter((item) => item !== 'All').map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  <span className="mb-1.5 block">Location</span>
                  <input value={draft.location} onChange={(e) => setDraft((current) => ({ ...current, location: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white" placeholder="Main campus hall" />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  <span className="mb-1.5 block">Academic year</span>
                  <select value={draft.academicYear} onChange={(e) => setDraft((current) => ({ ...current, academicYear: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white">
                    {getAcademicYearOptions().map((year) => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  <span className="mb-1.5 block">Semester</span>
                  <select value={draft.semester} onChange={(e) => setDraft((current) => ({ ...current, semester: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white">
                    {getSemesterOptions().map((phase) => (
                      <option key={phase} value={phase}>{phase}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block text-sm font-medium text-slate-700">
                <span className="mb-1.5 block">Description</span>
                <textarea rows={3} value={draft.description} onChange={(e) => setDraft((current) => ({ ...current, description: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white" placeholder="Add the review purpose or communication note" />
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">Cancel</button>
                <button type="submit" className="rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 hover:opacity-95">Save milestone</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

export default EvaluationCalendar;
