import { create } from 'zustand'

const HABITS = [
  'nail_biting', 'hair_pulling', 'face_touching', 'lip_biting',
  'nose_picking', 'eye_rubbing', 'skin_picking', 'chewing', 'chin_resting',
]

// UI grouping only -- chin_resting still runs through the same classifier
// pipeline as every other habit above, but the plan explicitly flags
// posture-adjacent behaviors as "not BFRBs in the clinical sense," so the UI
// keeps them visually separate rather than implying equal clinical weight.
const HABIT_CATEGORY = {
  nail_biting: 'bfrb', hair_pulling: 'bfrb', face_touching: 'bfrb', lip_biting: 'bfrb',
  nose_picking: 'bfrb', eye_rubbing: 'bfrb', skin_picking: 'bfrb', chewing: 'bfrb',
  chin_resting: 'posture',
}

function loadJSON(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key))
    return v && typeof v === 'object' ? { ...fallback, ...v } : fallback
  } catch {
    return fallback
  }
}
function persistJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* localStorage unavailable -- setting just resets on reload, not fatal */
  }
}

const DEFAULT_POSTURE = { enabled: false, sensitivity: 0.5, minDwellSeconds: 4 }
const DEFAULT_AUDIO = {
  enabled: false,
  thresholds: { teeth_grinding: 0.5, knuckle_cracking: 0.55 },
  minDwellSeconds: { teeth_grinding: 2.5, knuckle_cracking: 0.12 },
}

export const useStore = create((set, get) => ({
  profileId: 'default',

  // Which habits the person wants watched, and how sensitive each is.
  // Lower threshold = more sensitive (fires sooner).
  enabledHabits: {
    nail_biting: true, hair_pulling: true, face_touching: true, lip_biting: true,
    nose_picking: true, eye_rubbing: true, skin_picking: true, chewing: true,
    chin_resting: true,
  },
  // These are calibrated against the classifier's actual behavior on its
  // synthetic-only bootstrap: with many classes splitting probability mass,
  // a genuinely-correct top class often peaks around 0.3-0.45 rather than
  // 0.7+ the way a binary classifier would. Thresholds much above that would
  // silently never fire. Running Calibrate sharpens real confidence well
  // above these floors for a person's own actual patterns.
  thresholds: {
    nail_biting: 0.35, hair_pulling: 0.3, face_touching: 0.3, lip_biting: 0.35,
    nose_picking: 0.35, eye_rubbing: 0.3, skin_picking: 0.3, chewing: 0.3,
    chin_resting: 0.3,
  },
  minDwellSeconds: {
    nail_biting: 1.2, hair_pulling: 1.5, face_touching: 1.8, lip_biting: 1.5,
    nose_picking: 1.2, eye_rubbing: 1.5, skin_picking: 1.8, chewing: 1.8,
    chin_resting: 2.5, // resting is inherently sustained -- require more than a passing lean
  },
  soundEnabled: true,
  gentleMode: true, // soft toast vs. more assertive flash

  // Phase 4: posture (rule-based, client-side only -- not part of the
  // classifier's HABITS list, see lib/postureFeatures.js for why). Off by
  // default: not a compulsive/self-injurious habit like the ones above, so
  // it shouldn't feel bundled in without a conscious opt-in.
  posture: loadJSON('habitsense_posture_v1', DEFAULT_POSTURE),
  setPostureEnabled: (v) =>
    set((s) => {
      const next = { ...s.posture, enabled: v }
      persistJSON('habitsense_posture_v1', next)
      return { posture: next }
    }),
  setPostureSensitivity: (v) =>
    set((s) => {
      const next = { ...s.posture, sensitivity: v }
      persistJSON('habitsense_posture_v1', next)
      return { posture: next }
    }),

  // Phase 5: audio habits (also rule-based/client-side, also off by default
  // -- expands the consent/privacy surface to the microphone, a bigger ask
  // than camera-only).
  audio: loadJSON('habitsense_audio_v1', DEFAULT_AUDIO),
  setAudioEnabled: (v) =>
    set((s) => {
      const next = { ...s.audio, enabled: v }
      persistJSON('habitsense_audio_v1', next)
      return { audio: next }
    }),
  setAudioThreshold: (habit, value) =>
    set((s) => {
      const next = { ...s.audio, thresholds: { ...s.audio.thresholds, [habit]: value } }
      persistJSON('habitsense_audio_v1', next)
      return { audio: next }
    }),

  // Explicit consent gate (Phase 6 privacy). pendingConsent holds
  // { kind, resolve } while the modal is on screen; see lib/consent.js for
  // the persisted per-device grant and components/ConsentModal.jsx for the UI.
  pendingConsent: null,
  setPendingConsent: (v) => set({ pendingConsent: v }),

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
  setSessionEventNote: (id, notes) =>
    set((s) => ({
      sessionEvents: s.sessionEvents.map((ev) => (ev.id === id ? { ...ev, notes } : ev)),
    })),

  // The gentle reminder currently on screen, if any (fires the moment a
  // habit crosses its dwell threshold, independent of when it's logged)
  activeReminder: null,
  setActiveReminder: (habit) => set({ activeReminder: habit }),
  clearActiveReminder: () => set({ activeReminder: null }),
}))

export { HABITS, HABIT_CATEGORY }
