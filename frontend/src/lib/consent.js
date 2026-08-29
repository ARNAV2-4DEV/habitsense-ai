/**
 * Explicit on-screen consent, tracked per device, for each sensor this app
 * can turn on. Deliberately not just a paragraph buried in the About page --
 * requestConsent() blocks the actual getUserMedia() call until the person
 * has seen and accepted a plain-language explanation of what that sensor
 * does and what leaves the device.
 */
import { useStore } from '../state/store'

const KEY = 'habitsense_consent_v1'

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {}
  } catch {
    return {}
  }
}

function save(next) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* localStorage unavailable -- consent just re-prompts next time, not fatal */
  }
}

export function hasConsented(kind) {
  return !!load()[kind]
}

export function grantConsent(kind) {
  save({ ...load(), [kind]: true })
}

export function revokeConsent(kind) {
  const next = { ...load() }
  delete next[kind]
  save(next)
}

/**
 * Resolves immediately if this device already granted `kind`; otherwise
 * shows the ConsentModal (rendered once at the app root) and resolves with
 * whatever the person chose.
 */
export function requestConsent(kind) {
  if (hasConsented(kind)) return Promise.resolve(true)
  return new Promise((resolve) => {
    useStore.getState().setPendingConsent({ kind, resolve })
  })
}

export const CONSENT_COPY = {
  camera: {
    title: 'Before your camera turns on',
    body:
      "HabitSense runs Google's MediaPipe face and hand tracking directly in this browser tab. Video frames are processed locally and never uploaded anywhere -- only small numeric landmark coordinates are sent to the backend running on your own machine, never an image or a frame.",
    confirmLabel: 'Turn on camera',
  },
  mic: {
    title: 'Before your microphone turns on',
    body:
      "Audio-based detection (teeth grinding, knuckle cracking) analyzes sound entirely in this browser tab using the Web Audio API -- a rule-based signal check, not a trained model, since no labeled audio dataset exists for these sounds. Raw audio is never recorded, stored, or uploaded; only the detection result (which habit, when) is logged, the same as the camera-based habits.",
    confirmLabel: 'Turn on microphone',
  },
}
