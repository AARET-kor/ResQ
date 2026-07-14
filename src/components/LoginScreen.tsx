import { LiquidGlass } from './LiquidGlass'

export function LoginScreen({ onSignIn }: { onSignIn: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 text-center">
      <div>
        <h1 className="font-grotesk text-5xl uppercase sm:text-7xl">ResQ</h1>
        <p className="mt-3 font-condiment text-3xl text-neon">resident life</p>
      </div>
      <p className="max-w-xs font-mono text-sm uppercase text-cream/80">
        인턴·레지던트를 위한 올인원 비서. 구글 계정으로 시작하세요.
      </p>
      <LiquidGlass className="rounded-[1rem]">
        <button
          onClick={onSignIn}
          className="px-8 py-4 font-grotesk text-sm uppercase transition hover:text-neon"
        >
          Continue with Google
        </button>
      </LiquidGlass>
    </main>
  )
}
