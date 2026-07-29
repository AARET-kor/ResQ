/**
 * Full-screen fixed texture blend overlay. Sits above content, ignores pointer
 * events. Expects /texture.png in public/ — if absent it degrades to nothing
 * visible (no error). Swap in the real asset before release.
 */
export function TextureOverlay() {
  return (
    <div
      aria-hidden
      className="resq-texture-overlay pointer-events-none fixed inset-0 z-50"
    />
  )
}
