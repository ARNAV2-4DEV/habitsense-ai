import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Radar, Gauge, Fingerprint, SlidersHorizontal, Sparkles } from 'lucide-react'

const links = [
  { to: '/', label: 'Home', icon: Sparkles, end: true },
  { to: '/live', label: 'Live', icon: Radar },
  { to: '/calibrate', label: 'Calibrate', icon: Fingerprint },
  { to: '/dashboard', label: 'Analytics', icon: Gauge },
  { to: '/settings', label: 'Settings', icon: SlidersHorizontal },
]

export default function MobileNav() {
  const { pathname } = useLocation()
  const activeTo = links.find((l) => (l.end ? pathname === l.to : pathname.startsWith(l.to)))?.to

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-white/[0.06] bg-ink-900/90 backdrop-blur-xl px-2 py-2 flex justify-between">
      {links.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `relative flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] active:scale-90 transition-transform ${
              isActive ? 'text-aura-calm' : 'text-white/45'
            }`
          }
        >
          <Icon size={18} strokeWidth={1.75} />
          {label}
          {to === activeTo && (
            <motion.div
              layoutId="mobilenav-active-dot"
              className="absolute -top-0.5 w-1 h-1 rounded-full bg-aura-calm"
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            />
          )}
        </NavLink>
      ))}
    </nav>
  )
}
