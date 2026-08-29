import { Routes, Route } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import Sidebar from './components/layout/Sidebar'
import MobileNav from './components/layout/MobileNav'
import ConsentModal from './components/ConsentModal'
import { useLenis } from './hooks/useLenis'
import Home from './pages/Home'
import Live from './pages/Live'
import Calibrate from './pages/Calibrate'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import About from './pages/About'

function PageTransition({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

export default function App() {
  const location = useLocation()
  useLenis()

  return (
    <div className="min-h-screen flex bg-ink-950 text-white">
      <div className="grain-overlay" />
      <Sidebar />
      <main className="flex-1 min-w-0 pb-20 md:pb-0 relative">
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<PageTransition><Home /></PageTransition>} />
            <Route path="/live" element={<PageTransition><Live /></PageTransition>} />
            <Route path="/calibrate" element={<PageTransition><Calibrate /></PageTransition>} />
            <Route path="/dashboard" element={<PageTransition><Dashboard /></PageTransition>} />
            <Route path="/settings" element={<PageTransition><Settings /></PageTransition>} />
            <Route path="/about" element={<PageTransition><About /></PageTransition>} />
          </Routes>
        </AnimatePresence>
      </main>
      <MobileNav />
      <ConsentModal />
    </div>
  )
}
