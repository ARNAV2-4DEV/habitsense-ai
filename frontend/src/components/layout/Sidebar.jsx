import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Radar, Gauge, Fingerprint, SlidersHorizontal, Info, Sparkles } from 'lucide-react'
import { useStore } from '../../state/store'

const links = [
  { to: '/', label: 'Overview', icon: Sparkles, end: true },
  { to: '/live', label: 'Live detection', icon: Radar },
  { to: '/calibrate', label: 'Calibrate', icon: Fingerprint },
  { to: '/dashboard', label: 'Analytics', icon: Gauge },
  { to: '/settings', label: 'Settings', icon: SlidersHorizontal },
  { to: '/about', label: 'How it works', icon: Info },
]

export default function Sidebar() {
  const isDetecting = useStore((s) => s.isDetecting)
  const backendOnline = useStore((s) => s.backendOnline)
  const { pathname } = useLocation()
  const activeTo = links.find((l) => (l.end ? pathname === l.to : pathname.startsWith(l.to)))?.to

  return (
    <aside className="hidden md:flex md:flex-col w-60 shrink-0 border-r border-white/[0.06] bg-ink-900/60 backdrop-blur-xl px-4 py-6">
      <div className="flex items-center gap-2 px-2 mb-8">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-aura-calm to-aura-watch shadow-glow" />
        <div>
          <div className="font-display text-[15px] leading-none tracking-tight">HabitSense</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/40 mt-1">AI · local-first</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `relative group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                isActive ? 'text-white' : 'text-white/55 hover:text-white hover:bg-white/[0.04]'
              }`
            }
          >
            {to === activeTo && (
              <motion.div
                layoutId="sidebar-active-pill"
                className="absolute inset-0 rounded-xl bg-white/[0.07]"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            <Icon size={17} strokeWidth={1.75} className="relative" />
            <span className="relative">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto pt-6 space-y-2">
        <div className="flex items-center gap-2 px-3 text-xs text-white/40">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              backendOnline === false ? 'bg-aura-flag' : backendOnline ? 'bg-aura-calm' : 'bg-white/20'
            }`}
          />
          {backendOnline === false ? 'Backend offline' : backendOnline ? 'Backend connected' : 'Backend unknown'}
        </div>
        {isDetecting && (
          <div className="flex items-center gap-2 px-3 text-xs text-aura-calm">
            <span className="w-1.5 h-1.5 rounded-full bg-aura-calm animate-pulse" />
            Session live
          </div>
        )}
      </div>
    </aside>
  )
}
