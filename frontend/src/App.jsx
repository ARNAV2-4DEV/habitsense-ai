import { Suspense, lazy } from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import Sidebar from './components/layout/Sidebar'
import MobileNav from './components/layout/MobileNav'
import ConsentModal from './components/ConsentModal'
import ErrorBoundary from './components/ErrorBoundary'
import { useLenis } from './hooks/useLenis'

// Route-level code splitting: each page pulls in a different set of heavy,
// page-specific libraries (three.js/r3f + gsap on Home, MediaPipe + three on
// Live, recharts on Dashboard, gsap on About) that were previously all
// bundled into one ~1.9MB chunk loaded up front regardless of which page you
// landed on. Lazy-loading per route means e.g. visiting Settings never pays
// for MediaPipe or recharts at all.
const Home = lazy(() => import('./pages/Home'))
const Live = lazy(() => import('./pages/Live'))
const Calibrate = lazy(() => import('./pages/Calibrate'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Settings = lazy(() => import('./pages/Settings'))
const About = lazy(() => import('./pages/About'))

function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-6 h-6 rounded-full border-2 border-white/15 border-t-aura-calm animate-spin" />
    </div>
  )
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-6">
      <div className="font-display text-6xl mb-3 text-white/20">404</div>
      <p className="text-white/50 mb-6">There's nothing tracked at this address.</p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm border border-white/15 rounded-full px-4 py-2 text-white/70 hover:text-white hover:border-white/30 transition-colors"
      >
        Back to overview
      </Link>
    </div>
  )
}

function PageTransition({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Suspense lives per-route (not wrapping <Routes> itself) so
          AnimatePresence's direct child stays the keyed <Routes>, which is
          what lets it detect and animate route transitions at all. */}
      <Suspense fallback={<RouteFallback />}>{children}</Suspense>
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
        {/* Keyed by pathname so navigating away from a page that crashed
            always recovers cleanly, not just the in-place "Try again" button. */}
        <ErrorBoundary key={location.pathname}>
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              <Route path="/" element={<PageTransition><Home /></PageTransition>} />
              <Route path="/live" element={<PageTransition><Live /></PageTransition>} />
              <Route path="/calibrate" element={<PageTransition><Calibrate /></PageTransition>} />
              <Route path="/dashboard" element={<PageTransition><Dashboard /></PageTransition>} />
              <Route path="/settings" element={<PageTransition><Settings /></PageTransition>} />
              <Route path="/about" element={<PageTransition><About /></PageTransition>} />
              <Route path="*" element={<PageTransition><NotFound /></PageTransition>} />
            </Routes>
          </AnimatePresence>
        </ErrorBoundary>
      </main>
      <MobileNav />
      <ConsentModal />
    </div>
  )
}
