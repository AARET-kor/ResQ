import { LiquidGlass } from './LiquidGlass'

export function LoginScreen({
  onSignIn,
  onAppleSignIn,
  appleSignInAvailable = false,
  pending = false,
  error,
  onClearError,
}: {
  onSignIn: () => Promise<void> | void
  onAppleSignIn?: () => Promise<void> | void
  appleSignInAvailable?: boolean
  pending?: boolean
  error?: string | null
  onClearError?: () => void
}) {
  const runSignIn = (action: () => Promise<void> | void) => {
    onClearError?.()
    void Promise.resolve().then(action).catch(() => {
      // AuthProvider exposes the actionable error in the login screen.
    })
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 text-center">
      <div>
        <h1 className="font-grotesk text-5xl uppercase sm:text-7xl">ResQ</h1>
        <p className="mt-3 font-condiment text-3xl text-neon">resident life</p>
      </div>
      <p className="max-w-xs font-sans text-sm uppercase text-cream/80">
        인턴·레지던트를 위한 올인원 비서. 구글 계정으로 시작하세요.
      </p>
      <LiquidGlass className="rounded-[1rem]">
        <div className="flex flex-col divide-y divide-cream/10">
          <button
            type="button"
            onClick={() => runSignIn(onSignIn)}
            disabled={pending}
            aria-busy={pending}
            className="px-8 py-4 font-grotesk text-sm uppercase transition hover:text-neon"
          >
            {pending ? 'Google 로그인 연결 중…' : 'Continue with Google'}
          </button>
          {appleSignInAvailable && onAppleSignIn && (
            <button
              type="button"
              onClick={() => runSignIn(onAppleSignIn)}
              disabled={pending}
              className="px-8 py-4 font-grotesk text-sm uppercase transition hover:text-neon"
            >
              Continue with Apple
            </button>
          )}
        </div>
      </LiquidGlass>
      {error && (
        <div
          role="alert"
          className="max-w-md rounded-2xl border border-red-500/35 bg-red-500/10 px-5 py-4 text-left font-sans text-sm text-red-700 dark:text-red-200"
        >
          <p className="font-semibold">로그인을 완료하지 못했습니다.</p>
          <p className="mt-1 break-words">{error}</p>
          <button
            type="button"
            onClick={onClearError}
            className="mt-3 font-grotesk text-xs uppercase underline underline-offset-4"
          >
            닫기
          </button>
        </div>
      )}
    </main>
  )
}
