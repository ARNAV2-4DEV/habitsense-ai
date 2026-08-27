import { useEffect, useRef } from 'react'
import { FACE_REGIONS, hairlineRegionPoints, findNearestContact } from '../../lib/featureExtraction'

// Every mesh landmark index the classifier actually reads across all named
// regions (mouth, cheeks, jaw, eyebrows/forehead, nose) -- deduped so each
// point is drawn once even where regions share a landmark.
const REGION_POINT_INDICES = [...new Set(Object.values(FACE_REGIONS).flat())]

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]

const FACE_OUTLINE = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379,
  378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127,
  162, 21, 54, 103, 67, 109, 10,
]
const LIPS_OUTLINE = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 61]

function drawPath(ctx, points, idxList, w, h, close = true) {
  ctx.beginPath()
  idxList.forEach((idx, i) => {
    const p = points[idx]
    if (!p) return
    const x = p.x * w
    const y = p.y * h
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  if (close) ctx.closePath()
  ctx.stroke()
}

export default function CameraStage({ videoRef, face, hands, statusColor = '#5ee7c8' }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    let raf
    const draw = () => {
      const canvas = canvasRef.current
      const video = videoRef.current
      if (canvas && video && video.videoWidth) {
        if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth
        if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        const w = canvas.width
        const h = canvas.height
        ctx.clearRect(0, 0, w, h)

        if (face) {
          ctx.strokeStyle = 'rgba(255,255,255,0.28)'
          ctx.lineWidth = 1
          drawPath(ctx, face, FACE_OUTLINE, w, h)
          ctx.strokeStyle = statusColor
          ctx.lineWidth = 1.4
          drawPath(ctx, face, LIPS_OUTLINE, w, h)

          // The actual region landmark points the classifier reads --
          // low-opacity so they read as instrumentation, not decoration.
          ctx.fillStyle = 'rgba(255,255,255,0.22)'
          REGION_POINT_INDICES.forEach((idx) => {
            const p = face[idx]
            if (!p) return
            ctx.beginPath()
            ctx.arc(p.x * w, p.y * h, 1.6, 0, Math.PI * 2)
            ctx.fill()
          })

          // Extrapolated scalp points (crown, left/right scalp) -- a
          // heuristic proxy since the face mesh has no hair/scalp landmarks.
          // Dashed + distinct color so it never reads as a real tracked point.
          const scalpPts = hairlineRegionPoints(face)
          ctx.strokeStyle = 'rgba(245,163,94,0.6)'
          ctx.lineWidth = 1.2
          ctx.setLineDash([2, 2])
          scalpPts.forEach((p) => {
            ctx.beginPath()
            ctx.arc(p.x * w, p.y * h, 4, 0, Math.PI * 2)
            ctx.stroke()
          })
          ctx.setLineDash([])
        }

        if (hands) {
          hands.forEach((hand) => {
            ctx.strokeStyle = statusColor
            ctx.lineWidth = 1.6
            HAND_CONNECTIONS.forEach(([a, b]) => {
              const pa = hand[a]
              const pb = hand[b]
              if (!pa || !pb) return
              ctx.beginPath()
              ctx.moveTo(pa.x * w, pa.y * h)
              ctx.lineTo(pb.x * w, pb.y * h)
              ctx.stroke()
            })
            hand.forEach((p, idx) => {
              ctx.beginPath()
              ctx.arc(p.x * w, p.y * h, idx === 0 ? 4 : 2.4, 0, Math.PI * 2)
              ctx.fillStyle = statusColor
              ctx.fill()
            })
          })
        }

        // The model's actual primary signal in real time: a line from the
        // single closest fingertip to whichever named region it's nearest to.
        if (face && hands && hands.length > 0) {
          const nearest = findNearestContact(face, hands)
          if (nearest) {
            ctx.strokeStyle = statusColor
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.moveTo(nearest.tipPoint.x * w, nearest.tipPoint.y * h)
            ctx.lineTo(nearest.regionPoint.x * w, nearest.regionPoint.y * h)
            ctx.stroke()
            ctx.beginPath()
            ctx.arc(nearest.regionPoint.x * w, nearest.regionPoint.y * h, 3.5, 0, Math.PI * 2)
            ctx.fillStyle = statusColor
            ctx.fill()
          }
        }
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [videoRef, face, hands, statusColor])

  return (
    <div className="relative w-full aspect-[4/3] max-w-xl mx-auto rounded-3xl overflow-hidden border border-white/10 bg-black">
      <video
        ref={videoRef}
        className="w-full h-full object-cover -scale-x-100"
        playsInline
        muted
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full -scale-x-100"
      />
      <div
        className="pointer-events-none absolute inset-0 rounded-3xl transition-shadow duration-500"
        style={{ boxShadow: `inset 0 0 60px -10px ${statusColor}55` }}
      />
    </div>
  )
}
