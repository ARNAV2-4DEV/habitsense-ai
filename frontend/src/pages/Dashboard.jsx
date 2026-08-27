import { useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { Flame, ShieldCheck, Activity, CalendarDays } from 'lucide-react'
import { api } from '../lib/api'
import { useStore } from '../state/store'

const HABIT_COLORS = {
  nail_biting: '#f5647c',
  hair_pulling: '#e05a8f',
  face_touching: '#f5a35e',
  lip_biting: '#f5c85e',
  nose_picking: '#e0745a',
  eye_rubbing: '#c85ef5',
  skin_picking: '#f55e9e',
  chewing: '#5ea3f5',
}
const HABIT_LABELS = {
  nail_biting: 'Nail biting',
  hair_pulling: 'Hair pulling',
  face_touching: 'Face touching',
  lip_biting: 'Lip biting',
  nose_picking: 'Nose picking',
  eye_rubbing: 'Eye rubbing',
  skin_picking: 'Skin picking',
  chewing: 'Chewing on objects',
}

export default function Dashboard() {
  const profileId = useStore((s) => s.profileId)
  const [summary, setSummary] = useState(null)
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.analyticsSummary(profileId), api.listSessions(profileId)])
      .then(([s, sess]) => {
        setSummary(s)
        setSessions(sess)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [profileId])

  if (loading) {
    return <div className="max-w-6xl mx-auto px-6 md:px-10 py-14 text-white/40 text-sm">Loading analytics…</div>
  }

  if (!summary || summary.total_events === 0) {
    return (
      <div className="max-w-6xl mx-auto px-6 md:px-10 py-14">
        <h1 className="font-display text-3xl tracking-tight mb-3">Analytics</h1>
        <p className="text-white/45 text-sm max-w-md">
          No detections logged yet. Run a live session (with the backend online) and this
          fills in with real charts from your actual data — nothing here is a placeholder
          demo dataset.
        </p>
      </div>
    )
  }

  const pieData = Object.entries(summary.by_habit).map(([habit, count]) => ({
    name: HABIT_LABELS[habit] || habit,
    value: count,
    color: HABIT_COLORS[habit] || '#7c9cf5',
  }))

  const hourData = Object.entries(summary.by_hour).map(([hour, count]) => ({
    hour: `${hour}:00`,
    count,
  }))

  return (
    <div className="max-w-6xl mx-auto px-6 md:px-10 py-10 md:py-14">
      <h1 className="font-display text-3xl tracking-tight mb-1">Analytics</h1>
      <p className="text-white/45 text-sm mb-8">Aggregated from real logged sessions in your local database.</p>

      <div className="grid sm:grid-cols-4 gap-4 mb-10">
        <StatCard icon={Activity} label="Total detections" value={summary.total_events} />
        <StatCard icon={CalendarDays} label="Sessions logged" value={summary.n_sessions} />
        <StatCard icon={Flame} label="Detection streak" value={`${summary.current_detection_streak_days}d`} />
        <StatCard icon={ShieldCheck} label="Clean streak" value={`${summary.current_clean_streak_days}d`} />
      </div>

      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-6 mb-6">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <div className="text-xs uppercase tracking-wide text-white/40 mb-4">Detections per day</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={summary.daily_series}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#0e111a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }}
                labelStyle={{ color: 'white' }}
              />
              {Object.keys(HABIT_LABELS).map((habit) => (
                <Bar key={habit} dataKey={habit} stackId="a" fill={HABIT_COLORS[habit]} radius={[3, 3, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <div className="text-xs uppercase tracking-wide text-white/40 mb-4">Breakdown by habit</div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} stroke="none" />
                ))}
              </Pie>
              <Legend
                verticalAlign="bottom"
                height={36}
                formatter={(value) => <span className="text-white/60 text-xs">{value}</span>}
              />
              <Tooltip contentStyle={{ background: '#0e111a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_1fr] gap-6">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <div className="text-xs uppercase tracking-wide text-white/40 mb-4">Time of day</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={hourData}>
              <XAxis dataKey="hour" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 9 }} interval={2} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#0e111a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }} />
              <Bar dataKey="count" fill="#7c9cf5" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <div className="text-xs uppercase tracking-wide text-white/40 mb-4">Recent sessions</div>
          <div className="max-h-[220px] overflow-y-auto scrollbar-thin space-y-2 pr-1">
            {sessions.slice(0, 12).map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm border-b border-white/[0.05] pb-2">
                <span className="text-white/60">{new Date(s.started_at * 1000).toLocaleString()}</span>
                <span className="text-white/40 text-xs font-mono">{s.n_events} events</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
      <Icon size={17} className="text-aura-calm mb-3" strokeWidth={1.75} />
      <div className="text-2xl font-display">{value}</div>
      <div className="text-xs text-white/40 mt-1">{label}</div>
    </div>
  )
}
