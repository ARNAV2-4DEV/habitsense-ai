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
import { motion } from 'framer-motion'
import { Flame, ShieldCheck, Activity, CalendarDays, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { api } from '../lib/api'
import { useStore } from '../state/store'
import TiltCard from '../components/ui/TiltCard'
import CountUp from '../components/ui/CountUp'

const panelIn = {
  initial: { opacity: 0, y: 14 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-40px' },
  transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
}

const HABIT_COLORS = {
  nail_biting: '#f5647c',
  hair_pulling: '#e05a8f',
  face_touching: '#f5a35e',
  lip_biting: '#f5c85e',
  nose_picking: '#e0745a',
  eye_rubbing: '#c85ef5',
  skin_picking: '#f55e9e',
  chewing: '#5ea3f5',
  chin_resting: '#7c9cf5',
  posture_slouching: '#8a93a6',
  teeth_grinding: '#a68a5e',
  knuckle_cracking: '#5ea691',
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
  chin_resting: 'Chin/cheek resting',
  posture_slouching: 'Posture drift',
  teeth_grinding: 'Teeth grinding',
  knuckle_cracking: 'Knuckle cracking',
}

// Phase 6: weekly summary, aggregated entirely from the daily_series the
// /analytics/summary endpoint already returns -- no new data source.
function computeWeeklySummary(summary) {
  if (!summary?.daily_series?.length) return null
  const habitKeys = Object.keys(summary.by_habit)
  const totalForDay = (d) => habitKeys.reduce((sum, h) => sum + (d[h] || 0), 0)

  const last7 = summary.daily_series.slice(-7)
  const prev7 = summary.daily_series.slice(-14, -7)
  const thisWeekTotal = last7.reduce((s, d) => s + totalForDay(d), 0)
  const prevWeekTotal = prev7.reduce((s, d) => s + totalForDay(d), 0)
  const pctChange = prevWeekTotal > 0 ? Math.round(((thisWeekTotal - prevWeekTotal) / prevWeekTotal) * 100) : null

  const byHabitThisWeek = {}
  for (const d of last7) {
    for (const h of habitKeys) byHabitThisWeek[h] = (byHabitThisWeek[h] || 0) + (d[h] || 0)
  }
  const topHabitEntry = Object.entries(byHabitThisWeek).sort((a, b) => b[1] - a[1])[0]
  const quietestDay = [...last7].sort((a, b) => totalForDay(a) - totalForDay(b))[0]

  return {
    thisWeekTotal,
    pctChange,
    topHabit: topHabitEntry && topHabitEntry[1] > 0 ? topHabitEntry[0] : null,
    quietestDay: quietestDay?.date,
    daysCounted: last7.length,
  }
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

  const weekly = computeWeeklySummary(summary)

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
        <StatCard icon={Activity} label="Total detections" value={summary.total_events} i={0} />
        <StatCard icon={CalendarDays} label="Sessions logged" value={summary.n_sessions} i={1} />
        <StatCard icon={Flame} label="Detection streak" value={`${summary.current_detection_streak_days}d`} i={2} />
        <StatCard icon={ShieldCheck} label="Clean streak" value={`${summary.current_clean_streak_days}d`} i={3} />
      </div>

      {weekly && (
        <motion.div {...panelIn} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 mb-6">
          <div className="text-xs uppercase tracking-wide text-white/40 mb-3">
            This week (last {weekly.daysCounted} logged day{weekly.daysCounted === 1 ? '' : 's'})
          </div>
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
            <div>
              <span className="font-display text-2xl">{weekly.thisWeekTotal}</span>
              <span className="text-white/40 text-sm ml-2">detections</span>
            </div>
            {weekly.pctChange !== null && (
              <div className="flex items-center gap-1.5 text-sm">
                {weekly.pctChange > 0 ? (
                  <TrendingUp size={15} className="text-aura-flag" />
                ) : weekly.pctChange < 0 ? (
                  <TrendingDown size={15} className="text-aura-calm" />
                ) : (
                  <Minus size={15} className="text-white/40" />
                )}
                <span className={weekly.pctChange > 0 ? 'text-aura-flag' : weekly.pctChange < 0 ? 'text-aura-calm' : 'text-white/40'}>
                  {weekly.pctChange > 0 ? '+' : ''}
                  {weekly.pctChange}% vs. previous week
                </span>
              </div>
            )}
            {weekly.topHabit && (
              <div className="text-sm text-white/50">
                Most frequent: <span className="text-white/80">{HABIT_LABELS[weekly.topHabit] || weekly.topHabit}</span>
              </div>
            )}
            {weekly.quietestDay && (
              <div className="text-sm text-white/50">
                Quietest day: <span className="text-white/80">{weekly.quietestDay}</span>
              </div>
            )}
          </div>
        </motion.div>
      )}

      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-6 mb-6">
        <motion.div {...panelIn} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
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
        </motion.div>

        <motion.div {...panelIn} transition={{ ...panelIn.transition, delay: 0.08 }} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
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
        </motion.div>
      </div>

      <div className="grid lg:grid-cols-[1fr_1fr] gap-6">
        <motion.div {...panelIn} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <div className="text-xs uppercase tracking-wide text-white/40 mb-4">Time of day</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={hourData}>
              <XAxis dataKey="hour" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 9 }} interval={2} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#0e111a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }} />
              <Bar dataKey="count" fill="#7c9cf5" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div {...panelIn} transition={{ ...panelIn.transition, delay: 0.08 }} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <div className="text-xs uppercase tracking-wide text-white/40 mb-4">Recent sessions</div>
          <div className="max-h-[220px] overflow-y-auto scrollbar-thin space-y-2 pr-1">
            {sessions.slice(0, 12).map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm border-b border-white/[0.05] pb-2">
                <span className="text-white/60">{new Date(s.started_at * 1000).toLocaleString()}</span>
                <span className="text-white/40 text-xs font-mono">{s.n_events} events</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, i = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
    >
      <TiltCard className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 overflow-hidden hover:border-white/[0.14] transition-colors">
        <Icon size={17} className="text-aura-calm mb-3" strokeWidth={1.75} />
        <div className="text-2xl font-display"><CountUp value={value} /></div>
        <div className="text-xs text-white/40 mt-1">{label}</div>
      </TiltCard>
    </motion.div>
  )
}
