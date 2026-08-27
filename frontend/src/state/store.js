import { create } from 'zustand'

const HABITS = [
  'nail_biting', 'hair_pulling', 'face_touching', 'lip_biting',
  'nose_picking', 'eye_rubbing', 'skin_picking', 'chewing',
]

export const useStore = create((set, get) => ({
  profileId: 'default',

  // Which habits the person wants watched, and how sensitive each is.
  // Lower threshold = more sensitive (fires sooner).
  enabledHabits: {
    nail_biting: true, hair_pulling: true, face_touching: true, lip_biting: true,
    nose_picking: true, eye_rubbing: true, skin_picking: true, chewing: true,
  },
  // These are calibrated against the classifier's actual behavior on its
  // synthetic-only bootstrap: with 9 classes splitting probability mass,
  // a genuinely-correct top class often peaks around 0.3-0.45 rather than
  // 0.7+ the way a binary classifier would. Thresholds much above that would
  // silently never fire. Running Calibrate sharpens real confidence well
  // above these floors for a person's own actual patterns.
  thresholds: {
    nail_biting: 0.35, hair_pulling: 0.3, face_touching: 0.3, lip_biting: 0.35,
    nose_picking: 0.35, eye_rubbing: 0.3, skin_picking: 0.3, chewing: 0.3,
  },
  minDwellSeconds: {
    nail_biting: 1.2, hair_pulling: 1.5, face_touching: 1.8, lip_biting: 1.5,
    nose_picking: 1.2, eye_rubbing: 1.5, skin_picking: 1.8, chewing: 1.8,
  },
  soundEnabled: true,
  gentleMode: true, // soft toast vs. more assertive flash

  toggleHabit: (habit) =>
    set((s) => ({ enabledHabits: { ...s.enabledHabits, [habit]: !s.enabledHabits[habit] } })),
  setThreshold: (habit, value) =>
    set((s) => ({ thresholds: { ...s.thresholds, [habit]: value } })),
  setMinDwell: (habit, value) =>
    set((s) => ({ minDwellSeconds: { ...s.minDwellSeconds, [habit]: value } })),
  setSoundEnabled: (v) => set({ soundEnabled: v }),
  setGentleMode: (v) => set({ gentleMode: v }),

  // Live session state
  sessionId: null,
  isDetecting: false,
  currentLabel: 'none',
  currentConfidence: 0,
  modelInfo: null,
  backendOnline: null, // null = unknown, true/false once checked

  setSessionId: (id) => set({ sessionId: id }),
  setDetecting: (v) => set({ isDetecting: v }),
  setCurrentDetection: (label, confidence) =>
    set({ currentLabel: label, currentConfidence: confidence }),
  setModelInfo: (info) => set({ modelInfo: info }),
  setBackendOnline: (v) => set({ backendOnline: v }),

  // Rolling in-session event log (mirrors what's persisted server-side)
  sessionEvents: [],
  addSessionEvent: (ev) => set((s) => ({ sessionEvents: [ev, ...s.sessionEvents].slice(0, 200) })),
  clearSessionEvents: () => set({ sessionEvents: [] }),

  // The gentle reminder currently on screen, if any (fires the moment a
  // habit crosses its dwell threshold, independent of when it's logged)
  activeReminder: null,
  setActiveReminder: (habit) => set({ activeReminder: habit }),
  clearActiveReminder: () => set({ activeReminder: null }),
}))

export { HABITS }
