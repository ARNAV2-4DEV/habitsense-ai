let ctx = null

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  return ctx
}

/** A soft two-note chime — deliberately gentle, not an alarm. */
export function playGentleChime() {
  try {
    const audioCtx = getCtx()
    const now = audioCtx.currentTime
    const notes = [523.25, 659.25] // C5, E5

    notes.forEach((freq, i) => {
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = now + i * 0.14
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.09, start + 0.05)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5)
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.start(start)
      osc.stop(start + 0.55)
    })
  } catch {
    /* audio unavailable — fail silently, the visual toast still shows */
  }
}
