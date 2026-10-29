import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Clock3, MapPin, Sparkles, Users } from 'lucide-react';

const BUILDINGS = [
  { name: 'Academic Block A', shortName: 'ACA', x: 130, y: 88, color: '#2563eb' },
  { name: 'Library', shortName: 'LIB', x: 390, y: 72, color: '#059669' },
  { name: 'Cafeteria', shortName: 'CAF', x: 270, y: 190, color: '#d97706' },
  { name: 'Dormitories', shortName: 'DOR', x: 105, y: 285, color: '#7c3aed' },
  { name: 'Dept Offices', shortName: 'DEP', x: 445, y: 278, color: '#db2777' },
];

const PATHS = [
  [0, 1], [0, 2], [0, 3], [1, 2], [1, 4], [2, 3], [2, 4], [3, 4],
];

const getActivityProfile = (hour) => {
  if (hour < 9) return { density: 36, mobility: 48, focus: 'Dormitories to Academic Block A', pulse: 18 };
  if (hour < 12) return { density: 82, mobility: 78, focus: 'High activity in Academic Block A', pulse: 42 };
  if (hour < 14) return { density: 64, mobility: 86, focus: 'Lunch movement around Cafeteria', pulse: 35 };
  if (hour < 17) return { density: 74, mobility: 68, focus: 'Steady activity across departments', pulse: 29 };
  return { density: 43, mobility: 52, focus: 'Campus winding down at Dormitories', pulse: 14 };
};

const formatHour = (hour) => {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:00 ${suffix}`;
};

const CampusActivitySimulation = () => {
  const [timeOfDay, setTimeOfDay] = useState(10);
  const canvasRef = useRef(null);
  const profile = useMemo(() => getActivityProfile(timeOfDay), [timeOfDay]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const context = canvas.getContext('2d');
    const particles = Array.from({ length: 58 }, (_, index) => {
      const source = BUILDINGS[index % BUILDINGS.length];
      const destination = BUILDINGS[(index + 1 + Math.floor(index / BUILDINGS.length)) % BUILDINGS.length];
      return {
        x: source.x + (Math.random() - 0.5) * 18,
        y: source.y + (Math.random() - 0.5) * 18,
        sourceIndex: index % BUILDINGS.length,
        targetIndex: (index + 1 + Math.floor(index / BUILDINGS.length)) % BUILDINGS.length,
        speed: 0.35 + Math.random() * 0.65,
        phase: Math.random() * Math.PI * 2,
        targetX: destination.x,
        targetY: destination.y,
      };
    });

    let animationFrameId;
    let lastFrame = 0;
    const visibleCount = Math.round(14 + (profile.density / 100) * 44);

    const draw = (timestamp) => {
      const delta = Math.min((timestamp - lastFrame) / 16.67 || 1, 2);
      lastFrame = timestamp;
      context.clearRect(0, 0, canvas.width, canvas.height);

      context.fillStyle = '#f8fafc';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = '#dbe4f0';
      context.lineWidth = 2;
      PATHS.forEach(([from, to]) => {
        context.beginPath();
        context.moveTo(BUILDINGS[from].x, BUILDINGS[from].y);
        context.lineTo(BUILDINGS[to].x, BUILDINGS[to].y);
        context.stroke();
      });

      particles.forEach((particle, index) => {
        const isVisible = index < visibleCount;
        if (!isVisible) return;
        const target = BUILDINGS[particle.targetIndex];
        const dx = target.x - particle.x;
        const dy = target.y - particle.y;
        const distance = Math.hypot(dx, dy);

        if (distance < 7) {
          particle.sourceIndex = particle.targetIndex;
          particle.targetIndex = (particle.targetIndex + 1 + (index % 2)) % BUILDINGS.length;
          particle.targetX = BUILDINGS[particle.targetIndex].x;
          particle.targetY = BUILDINGS[particle.targetIndex].y;
        } else {
          particle.x += (dx / distance) * particle.speed * delta;
          particle.y += (dy / distance) * particle.speed * delta;
        }

        const offset = Math.sin(timestamp / 450 + particle.phase) * 1.5;
        context.fillStyle = '#1e293b';
        context.beginPath();
        context.arc(particle.x, particle.y + offset, 4, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = 'rgba(37, 99, 235, 0.18)';
        context.beginPath();
        context.arc(particle.x, particle.y + offset, 7, 0, Math.PI * 2);
        context.fill();
      });

      BUILDINGS.forEach((building) => {
        context.fillStyle = building.color;
        context.beginPath();
        context.roundRect(building.x - 34, building.y - 20, 68, 40, 10);
        context.fill();
        context.fillStyle = '#ffffff';
        context.font = '700 11px sans-serif';
        context.textAlign = 'center';
        context.fillText(building.shortName, building.x, building.y + 4);
      });

      animationFrameId = requestAnimationFrame(draw);
    };

    animationFrameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationFrameId);
  }, [profile.density]);

  return (
    <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-gradient-to-r from-ieps-blue-700 to-ieps-blue-600 px-6 py-6 text-white md:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-blue-100">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
              <span className="text-xs font-bold uppercase tracking-[0.18em]">Campus intelligence</span>
            </div>
            <h2 className="text-2xl font-bold">AI Campus Life & Activity Pulse</h2>
            <p className="mt-2 max-w-2xl text-sm text-blue-100">
              A live simulation of student movement and evaluation activity across Mekdela Amba University.
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white/15 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/25">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" aria-hidden="true" />
            Live simulation
          </span>
        </div>
      </div>

      <div className="grid gap-6 p-5 md:p-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(250px,0.75fr)]">
        <div>
          <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-2 sm:p-4">
            <canvas
              ref={canvasRef}
              width="560"
              height="360"
              aria-label="Animated campus map showing simulated student movement"
              className="h-auto w-full"
            />
            <div className="pointer-events-none absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm">
              <MapPin className="h-3.5 w-3.5 text-ieps-blue-600" aria-hidden="true" />
              5 active campus zones
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <label htmlFor="campus-time" className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Clock3 className="h-4 w-4 text-ieps-blue-600" aria-hidden="true" />
                Campus time
              </label>
              <span className="rounded-full bg-ieps-blue-50 px-3 py-1 text-sm font-bold text-ieps-blue-700">{formatHour(timeOfDay)}</span>
            </div>
            <input
              id="campus-time"
              type="range"
              min="8"
              max="20"
              step="1"
              value={timeOfDay}
              onChange={(event) => setTimeOfDay(Number(event.target.value))}
              className="h-2 w-full cursor-pointer accent-ieps-blue-600"
              aria-label="Change simulated campus time"
            />
            <div className="mt-2 flex justify-between text-[11px] font-medium text-slate-500">
              <span>8:00 AM</span>
              <span>2:00 PM</span>
              <span>8:00 PM</span>
            </div>
          </div>
        </div>

        <aside className="space-y-3" aria-label="AI campus insights">
          <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
            <Activity className="h-4 w-4 text-ieps-blue-600" aria-hidden="true" />
            AI campus insights
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Active campus density</p>
            <p className="mt-2 text-lg font-bold text-slate-800">{profile.focus}</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100">
              <div className="h-full rounded-full bg-ieps-blue-600 transition-all duration-500" style={{ width: `${profile.density}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-500">{profile.density}% estimated activity</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Live student mobility index</p>
            <div className="mt-2 flex items-end gap-2">
              <p className="text-3xl font-bold text-slate-800">{profile.mobility}%</p>
              <Users className="mb-1 h-5 w-5 text-emerald-600" aria-hidden="true" />
            </div>
            <p className="mt-1 text-xs text-slate-500">Students moving between learning zones</p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Real-time evaluation pulse</p>
            <p className="mt-2 text-lg font-bold text-slate-800">{profile.pulse} students</p>
            <p className="mt-1 text-xs text-slate-500">Currently evaluating instructors</p>
          </div>
        </aside>
      </div>
    </section>
  );
};

export default CampusActivitySimulation;
