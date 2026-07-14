/**
 * Full-screen fixed texture blend overlay. Sits above content, ignores pointer
 * events. Expects /texture.png in public/ — if absent it degrades to nothing
 * visible (no error). Swap in the real asset before release.
 */
export function TextureOverlay() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50"
      style={{
        backgroundImage: 'url(/texture.png)',
        backgroundSize: 'cover',
        mixBlendMode: 'lighten',
        opacity: 0.6,
      }}
    />
  )
}
