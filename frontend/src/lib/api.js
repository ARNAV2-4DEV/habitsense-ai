const BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${path} failed: ${res.status} ${text}`)
  }
  return res.json()
}

export const api = {
  health: () => request('/health'),

  startSession: (profileId, habitsEnabled) =>
    request('/sessions', {
      method: 'POST',
      body: JSON.stringify({ profile_id: profileId, habits_enabled: habitsEnabled }),
    }),

  endSession: (sessionId) =>
    request('/sessions/end', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
    }),

  listSessions: (profileId) => request(`/sessions/${profileId}`),

  infer: (payload) =>
    request('/detect/infer', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  inferFromFeatures: (profileId, featureVector) =>
    request('/detect/infer-from-features', {
      method: 'POST',
      body: JSON.stringify({ profile_id: profileId, feature_vector: featureVector }),
    }),

  resetSessionState: (sessionId) =>
    request(`/detect/reset-session-state/${sessionId}`, { method: 'POST' }),

  createEvent: (payload) =>
    request('/events', { method: 'POST', body: JSON.stringify(payload) }),

  dismissEvent: (eventId) =>
    request('/events/dismiss', {
      method: 'POST',
      body: JSON.stringify({ event_id: eventId }),
    }),

  setEventNote: (eventId, notes) =>
    request('/events/note', {
      method: 'POST',
      body: JSON.stringify({ event_id: eventId, notes }),
    }),

  // One request per calibration rep. samples: [{ habit, feature_vector, variant }]
  addCalibrationSamples: (profileId, samples) =>
    request('/calibration/samples/batch', {
      method: 'POST',
      body: JSON.stringify({ profile_id: profileId, samples }),
    }),

  calibrationSummary: (profileId) => request(`/calibration/samples/${profileId}`),

  clearCalibration: (profileId) =>
    request(`/calibration/samples/${profileId}`, { method: 'DELETE' }),

  retrain: (profileId) =>
    request('/calibration/retrain', {
      method: 'POST',
      body: JSON.stringify({ profile_id: profileId }),
    }),

  modelStatus: (profileId) => request(`/calibration/status/${profileId}`),

  analyticsSummary: (profileId) => request(`/analytics/summary/${profileId}`),

  // Not a JSON request -- the browser downloads this directly as a file.
  exportUrl: (profileId, format) => `${BASE_URL}/export/${profileId}?format=${format}`,
}

export { BASE_URL }
