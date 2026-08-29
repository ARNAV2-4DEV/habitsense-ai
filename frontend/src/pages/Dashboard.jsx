import { useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts'
import { motion } from 'framer-motion'
import { Activity, CalendarDays, Clock3, Info, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { api } from '../lib/api'
import { useStore } from '../state/store'
import Panel from '../components/ui/Panel'
import SectionLabel from '../components/ui/SectionLabel'
import StatusBadge from '../components/ui/StatusBadge'
import PaperAmbientField from '../components/ui/PaperAmbientField'
import { STATUS_COLOR, LABELS } from '../lib/paperTheme'

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-[#233b35]/15 bg-[#f9f8f3] px-3 py-2 shadow-lg">
      <p className="font-mono text-[9px] uppercase tracking-[.12em] text-[#7d8981]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#284c42]">{payload[0].value} observations</p>
    </div>
  )
}

function EmptyState({ children = 'Not enough observations yet.' }) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-[#233b35]/15 bg-white/25 px-5 text-center text-xs leading-relaxed text-[#758078]">
      <Info size={15} className="mr-2 text-[#739c91] shrink-0" />
      {children}
    </div>
  )
}

function Metric({ label, value, detail, icon: Icon }) {
  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] uppercase tracking-[.14em] text-[#849089]">{label}</span>
        <Icon size={15} className="text-[#76a398]" />
      </div>
      <strong className="mt-3 block font-display text-3xl tracking-[-.03em] text-[#244b40]">{value}</strong>
      <p className="mt-1 text-[11px] text-[#7b877f]">{detail}</p>
    </Panel>
  )
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
  const [hoveredSession, setHoveredSession] = useState(null)

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
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#f4f1e9] text-[#182522]">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-14 text-[#8a948d] text-sm">Loading analytics…</div>
      </div>
    )
  }

  if (!summary || summary.total_events === 0) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#f4f1e9] text-[#182522]">
        <PaperAmbientField />
        <div className="relative max-w-6xl mx-auto px-6 md:px-10 py-10 md:py-14">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[.2em] text-[#6c958b]">Reflection · this week</p>
          <h1 className="font-display text-4xl tracking-[-.03em] text-[#1c3731] sm:text-5xl mb-6">
            Patterns, gently held.
          </h1>
          <EmptyState>
            No detections logged yet. Run a live session (with the backend online) and this
            fills in with real charts from your actual data — nothing here is a placeholder demo
            dataset.
          </EmptyState>
        </div>
      </div>
    )
  }

  const weekly = computeWeeklySummary(summary)

  const byHabit = Object.entries(summary.by_habit)
    .map(([habit, count]) => ({ name: LABELS[habit] || habit, value: count, color: STATUS_COLOR[habit] || STATUS_COLOR.none }))
    .sort((a, b) => b.value - a.value)

  const hourData = Object.entries(summary.by_hour).map(([hour, count]) => ({
    hour: `${hour}:00`,
    count,
  }))

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f4f1e9] text-[#182522]">
      <PaperAmbientField />
      <div className="relative max-w-6xl mx-auto px-6 md:px-10 py-10 md:py-14">
        <div className="mb-7">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[.2em] text-[#6c958b]">Reflection · this week</p>
          <h1 className="font-display text-4xl tracking-[-.03em] text-[#1c3731] sm:text-5xl">
            Patterns, gently held.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#68756d]">
            These are aggregated from your real logged sessions, not a scorecard — look for
            context that feels useful.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-7">
          <Metric label="Observations" value={summary.total_events} detail={`across ${summary.n_sessions} sessions`} icon={Activity} />
          <Metric
            label="Most noticed"
            value={byHabit[0]?.value ?? 0}
            detail={byHabit[0]?.name?.toLowerCase() || 'none yet'}
            icon={CalendarDays}
          />
          <Metric label="Detection streak" value={`${summary.current_detection_streak_days}d`} detail="consecutive days logged" icon={Clock3} />
          <Metric label="Clean streak" value={`${summary.current_clean_streak_days}d`} detail="consecutive clean days" icon={Info} />
        </div>

        {weekly && (
          <Panel className="p-5 mb-6">
            <SectionLabel detail={`last ${weekly.daysCounted} logged day${weekly.daysCounted === 1 ? '' : 's'}`}>This week</SectionLabel>
            <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
              <div>
                <span className="font-display text-2xl text-[#1c3731]">{weekly.thisWeekTotal}</span>
                <span className="text-[#7b877f] text-sm ml-2">detections</span>
              </div>
              {weekly.pctChange !== null && (
                <div className="flex items-center gap-1.5 text-sm">
                  {weekly.pctChange > 0 ? (
                    <TrendingUp size={15} className="text-[#c2685f]" />
                  ) : weekly.pctChange < 0 ? (
                    <TrendingDown size={15} className="text-[#4e8a7c]" />
                  ) : (
                    <Minus size={15} className="text-[#8a948d]" />
                  )}
                  <span className={weekly.pctChange > 0 ? 'text-[#c2685f]' : weekly.pctChange < 0 ? 'text-[#4e8a7c]' : 'text-[#8a948d]'}>
                    {weekly.pctChange > 0 ? '+' : ''}
                    {weekly.pctChange}% vs. previous week
                  </span>
                </div>
              )}
              {weekly.topHabit && (
                <div className="text-sm text-[#68756d]">
                  Most frequent: <span className="text-[#1c3731]">{LABELS[weekly.topHabit] || weekly.topHabit}</span>
                </div>
              )}
              {weekly.quietestDay && (
                <div className="text-sm text-[#68756d]">
                  Quietest day: <span className="text-[#1c3731]">{weekly.quietestDay}</span>
                </div>
              )}
            </div>
          </Panel>
        )}

        <div className="grid gap-7 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,.85fr)]">
          <div className="space-y-7">
            <Panel className="p-5">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start mb-1">
                <SectionLabel detail="observations / day">Detections per day</SectionLabel>
                <StatusBadge tone="neutral">No ranking</StatusBadge>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={summary.daily_series} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#233b3514" strokeDasharray="2 5" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#7d8981', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#9aa39c', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#233b3510' }} />
                  {Object.keys(LABELS).map((habit) => (
                    <Bar key={habit} dataKey={habit} stackId="a" fill={STATUS_COLOR[habit] || STATUS_COLOR.none} radius={[3, 3, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel className="p-5">
              <SectionLabel detail="share of observations">By habit</SectionLabel>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={byHabit} layout="vertical" margin={{ top: 0, right: 14, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="#233b3514" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#65746c', fontSize: 10 }} axisLine={false} tickLine={false} width={92} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#eff3eb' }} />
                  <Bar dataKey="value" radius={[0, 5, 5, 0]} barSize={16}>
                    {byHabit.map((item) => (
                      <Cell key={item.name} fill={item.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          <div className="space-y-7">
            <Panel className="p-5">
              <SectionLabel detail="local estimate">Time of day</SectionLabel>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={hourData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#233b3514" strokeDasharray="2 5" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fill: '#9aa39c', fontSize: 9 }} axisLine={false} tickLine={false} interval={2} />
                  <YAxis tick={{ fill: '#9aa39c', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#233b3510' }} />
                  <Bar dataKey="count" fill="#6f9db7" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel className="p-5">
              <SectionLabel detail="recent">Sessions</SectionLabel>
              <div className="divide-y divide-[#233b35]/8 max-h-[220px] overflow-y-auto scrollbar-thin pr-1">
                {sessions.slice(0, 12).map((s, index) => (
                  <div
                    key={s.id}
                    onMouseEnter={() => setHoveredSession(index)}
                    onMouseLeave={() => setHoveredSession(null)}
                    className={`py-3 transition first:pt-1 last:pb-1 ${hoveredSession === index ? 'rounded-lg bg-[#eef3eb] px-2' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#4b6056]">
                        {new Date(s.started_at * 1000).toLocaleString()}
                      </span>
                      <span className="font-mono text-[10px] text-[#679389]">{s.n_events} events</span>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  )
}
