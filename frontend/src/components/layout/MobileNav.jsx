import { NavLink } from 'react-router-dom'
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
  return (
    <nav className="md:hidden fixed bottom-5 inset-x-0 z-40 flex justify-center px-4">
      <div className="flex items-center gap-1 bg-ink-900/80 backdrop-blur-xl border border-white/10 rounded-full px-2 py-2 shadow-lg shadow-black/40">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className="relative flex items-center justify-center w-11 h-11 rounded-full active:scale-90 transition-transform"
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.div
                    layoutId="mobilenav-active-bg"
                    className="absolute inset-0 rounded-full bg-aura-calm"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <motion.span
                  animate={{ scale: isActive ? 1 : 0.82 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                  className="relative z-10 flex items-center justify-center"
                >
                  <Icon
                    size={isActive ? 20 : 18}
                    strokeWidth={1.75}
                    className={isActive ? 'text-ink-950' : 'text-white/45'}
                  />
                </motion.span>
                <motion.span
                  animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 4 }}
                  transition={{ duration: 0.18 }}
                  className="absolute -top-6 text-[10px] font-medium text-white/70 whitespace-nowrap pointer-events-none"
                >
                  {label}
                </motion.span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
