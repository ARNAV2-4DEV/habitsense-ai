/**
 * Phase 5: audio-based habit detection (teeth grinding, knuckle cracking),
 * entirely client-side via the Web Audio API.
 *
 * HONEST SCOPE NOTE (see the expansion plan, Phase 5): exactly like the
 * synthetic geometric prior in ml/seed_data.py, there is no labeled audio
 * dataset of people grinding their teeth or cracking their knuckles this
 * project has access to. Rather than pretend otherwise with a fake "trained
 * model," this is plain rule-based signal processing over the microphone's
 * real-time frequency/amplitude data -- two distinguishable acoustic
 * signatures, not a classifier:
 *   - grinding: a sustained, low-variance ("steady drone," not bursty like
 *     speech) elevation of energy in the 500Hz-4kHz friction-noise band.
 *   - cracking: an isolated, sharp transient spike far above the recent
 *     noise floor, gone again within one frame -- a "pop," not a sustained
 *     sound.
 * Raw audio is analyzed in-memory via AnalyserNode and never recorded,
 * stored, or sent anywhere -- only the detection result (which habit, when)
 * is logged, the same as every camera-based habit.
 */

const RMS_HISTORY_SEC = 3
const GRIND_BAND_HZ = [500, 4000]

function rms(timeData) {
  let sum = 0
  for (let i = 0; i < timeData.length; i++) sum += timeData[i] * timeData[i]
  return Math.sqrt(sum / timeData.length)
}

export function createAudioMonitor() {
  let audioCtx = null
  let analyser = null
  let source = null
  let stream = null
  let freqData = null
  let timeData = null
  let rmsBaseline = 0.02 // slow-moving noise floor, adapts to the room
  let rmsHistory = [] // [{t, rms}] over the trailing RMS_HISTORY_SEC
  let running = false

  async function start() {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    source = audioCtx.createMediaStreamSource(stream)
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.4
    source.connect(analyser)
    freqData = new Uint8Array(analyser.frequencyBinCount)
    timeData = new Float32Array(analyser.fftSize)
    rmsBaseline = 0.02
    rmsHistory = []
    running = true
  }

  function stop() {
    running = false
    if (stream) stream.getTracks().forEach((t) => t.stop())
    if (audioCtx) audioCtx.close().catch(() => {})
    audioCtx = null
    analyser = null
    source = null
    stream = null
    rmsHistory = []
  }

  function bandEnergy(loHz, hiHz) {
    const nyquist = audioCtx.sampleRate / 2
    const n = freqData.length
    const loBin = Math.max(0, Math.floor((loHz / nyquist) * n))
    const hiBin = Math.min(n - 1, Math.ceil((hiHz / nyquist) * n))
    let sum = 0
    let count = 0
    for (let i = loBin; i <= hiBin; i++) {
      sum += freqData[i]
      count++
    }
    return count ? sum / count / 255 : 0
  }

  /** Call every frame while running. Returns two independent 0..1 scores. */
  function update(nowSec) {
    if (!running || !analyser) return { grindingScore: 0, crackingScore: 0 }
    analyser.getByteFrequencyData(freqData)
    analyser.getFloatTimeDomainData(timeData)

    const currentRms = rms(timeData)
    const grindBandEnergy = bandEnergy(GRIND_BAND_HZ[0], GRIND_BAND_HZ[1])

    const prevRms = rmsHistory.length ? rmsHistory[rmsHistory.length - 1].rms : 0
    rmsHistory.push({ t: nowSec, rms: currentRms })
    const cutoff = nowSec - RMS_HISTORY_SEC
    while (rmsHistory.length && rmsHistory[0].t < cutoff) rmsHistory.shift()

    rmsBaseline = rmsBaseline * 0.995 + currentRms * 0.005

    let grindingScore = 0
    if (rmsHistory.length > 10) {
      const values = rmsHistory.map((r) => r.rms)
      const mean = values.reduce((a, b) => a + b, 0) / values.length
      const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
      const coefficientOfVariation = Math.sqrt(variance) / Math.max(mean, 1e-6)
      const elevated = mean > rmsBaseline * 1.8
      const steady = coefficientOfVariation < 0.35 // low variance = continuous drone, not bursty speech
      if (elevated && steady && grindBandEnergy > 0.12) {
        grindingScore = Math.min(1, (grindBandEnergy - 0.1) * 3)
      }
    }

    let crackingScore = 0
    if (currentRms > rmsBaseline * 4 && currentRms > 0.05 && prevRms < rmsBaseline * 1.5) {
      crackingScore = Math.min(1, currentRms / Math.max(rmsBaseline, 1e-6) / 8)
    }

    return { grindingScore, crackingScore }
  }

  /** Downsample the current frequency spectrum into n bars, 0..1 each --
   * for the live waveform visualizer, not the detection logic above. */
  function getBars(n = 5) {
    if (!running || !freqData) return new Array(n).fill(0)
    const bucketSize = Math.floor(freqData.length / n)
    const bars = new Array(n)
    for (let i = 0; i < n; i++) {
      let sum = 0
      const start = i * bucketSize
      const end = start + bucketSize
      for (let j = start; j < end; j++) sum += freqData[j]
      bars[i] = bucketSize ? sum / bucketSize / 255 : 0
    }
    return bars
  }

  return {
    start,
    stop,
    update,
    getBars,
    get isRunning() {
      return running
    },
  }
}
