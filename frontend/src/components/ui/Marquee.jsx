/**
 * Infinite horizontal scroll strip. Content is duplicated once so the
 * translateX(-50%) loop point is seamless -- pass exactly one "row" of
 * children, not a pre-doubled list. Pauses on hover; a static (non-scrolling)
 * fallback under prefers-reduced-motion comes from the global animation-kill
 * media query in index.css, which just freezes the strip mid-loop.
 */
export default function Marquee({ children, speed = 32, reverse = false, className = '' }) {
  return (
    <div
      className={`group relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)] ${className}`}
    >
      <div
        className="flex w-max gap-3 animate-marquee group-hover:[animation-play-state:paused]"
        style={{ animationDuration: `${speed}s`, animationDirection: reverse ? 'reverse' : 'normal' }}
      >
        <div className="flex shrink-0 gap-3">{children}</div>
        <div aria-hidden className="flex shrink-0 gap-3">{children}</div>
      </div>
    </div>
  )
}
