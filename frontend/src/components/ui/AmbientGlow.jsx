// Extends Home's existing ambient backdrop (see pages/Home.jsx) to the rest
// of the app: same two aura-token blobs, same size/blur/opacity. The only
// addition is a slow CSS-only drift (see .ambient-glow-a/b in index.css) so
// pages that don't scroll -- and so never see Home's scroll-linked parallax
// -- still don't read as static.
export default function AmbientGlow() {
  return (
    <>
      <div className="ambient-glow-a pointer-events-none absolute -top-40 left-1/3 w-[600px] h-[600px] rounded-full bg-aura-calm/10 blur-[140px]" />
      <div className="ambient-glow-b pointer-events-none absolute top-96 -right-20 w-[400px] h-[400px] rounded-full bg-aura-watch/10 blur-[120px]" />
    </>
  )
}
