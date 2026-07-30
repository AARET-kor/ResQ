export {}

declare global {
  interface Window {
    resqDesktop?: {
      isDesktop: true
      openExternal: (url: string) => Promise<void>
      onDeepLink: (callback: (url: string) => void) => () => void
    }
  }
}
