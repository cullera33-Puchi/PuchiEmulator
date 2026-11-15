/**
 * Dibujos propios de las consolas para la pantalla de inicio: formas genéricas inspiradas en cada
 * una, sin logotipos ni textos. El usuario puede sustituirlos por una foto suya.
 */
import type { Sistema } from '../lib/sistemas'

function Cruz({ x, y, t, color }: { x: number; y: number; t: number; color: string }) {
  return (
    <g fill={color}>
      <rect x={x - t / 2} y={y - t * 1.5} width={t} height={t * 3} rx={t * 0.18} />
      <rect x={x - t * 1.5} y={y - t / 2} width={t * 3} height={t} rx={t * 0.18} />
    </g>
  )
}

function GameBoy() {
  return (
    <svg viewBox="0 0 120 190" className="h-full w-auto drop-shadow-md" aria-hidden>
      <path d="M8 4h104a6 6 0 0 1 6 6v150a26 26 0 0 1-26 26H10a6 6 0 0 1-6-6V10a6 6 0 0 1 4-6z" fill="#d4d2cd" />
      <path d="M8 4h104a6 6 0 0 1 6 6v6H4v-6a6 6 0 0 1 4-6z" fill="#c6c3bd" />
      <path d="M16 22h88a4 4 0 0 1 4 4v52a16 16 0 0 1-16 16H16a4 4 0 0 1-4-4V26a4 4 0 0 1 4-4z" fill="#5d6070" />
      <rect x="28" y="30" width="64" height="54" rx="2" fill="#8bac0f" />
      <rect x="28" y="30" width="64" height="54" rx="2" fill="url(#brillo-gb)" />
      <Cruz x={32} y={122} t={11} color="#2a2a2e" />
      <circle cx="98" cy="114" r="8.5" fill="#9c2453" />
      <circle cx="80" cy="124" r="8.5" fill="#9c2453" />
      <rect x="40" y="148" width="16" height="5" rx="2.5" fill="#8c8d94" transform="rotate(-24 48 150)" />
      <rect x="60" y="148" width="16" height="5" rx="2.5" fill="#8c8d94" transform="rotate(-24 68 150)" />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={86 + i * 5} y="152" width="2.5" height="20" rx="1.2" fill="#b8b5ae" transform={`rotate(-30 ${87 + i * 5} 162)`} />
      ))}
      <defs>
        <linearGradient id="brillo-gb" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.18" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function GameBoyColor() {
  return (
    <svg viewBox="0 0 110 170" className="h-full w-auto drop-shadow-md" aria-hidden>
      <path d="M12 4h86a8 8 0 0 1 8 8v128c0 14-12 26-26 26H30C16 166 4 154 4 140V12a8 8 0 0 1 8-8z" fill="#6d51a3" />
      <path d="M12 4h86a8 8 0 0 1 8 8v128c0 14-12 26-26 26H30C16 166 4 154 4 140V12a8 8 0 0 1 8-8z" fill="url(#cristal)" />
      <rect x="14" y="16" width="82" height="66" rx="8" fill="#2e2e38" />
      <rect x="26" y="24" width="58" height="50" rx="2" fill="url(#pantalla-gbc)" />
      <Cruz x={30} y={110} t={10} color="#26262c" />
      <circle cx="88" cy="104" r="7.5" fill="#26262c" />
      <circle cx="72" cy="113" r="7.5" fill="#26262c" />
      <rect x="40" y="136" width="13" height="4.5" rx="2.2" fill="#26262c" />
      <rect x="58" y="136" width="13" height="4.5" rx="2.2" fill="#26262c" />
      <defs>
        <linearGradient id="cristal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="pantalla-gbc" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7fd1ff" />
          <stop offset="0.5" stopColor="#ffe07a" />
          <stop offset="1" stopColor="#ff8fb1" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function GameBoyAdvance() {
  return (
    <svg viewBox="0 0 220 120" className="h-full w-auto drop-shadow-md" aria-hidden>
      <path d="M40 10h140c22 0 36 18 36 50s-14 50-36 50H40C18 110 4 92 4 60S18 10 40 10z" fill="#5247aa" />
      <path d="M40 10h140c22 0 36 18 36 50H4C4 28 18 10 40 10z" fill="#5d52b8" />
      <rect x="58" y="18" width="104" height="80" rx="9" fill="#16161c" />
      <rect x="68" y="26" width="84" height="58" rx="2" fill="url(#pantalla-gba)" />
      <Cruz x={30} y={58} t={10} color="#24242c" />
      <circle cx="194" cy="50" r="8.5" fill="#dcdce8" />
      <circle cx="178" cy="66" r="8.5" fill="#dcdce8" />
      <circle cx="30" cy="92" r="2.5" fill="#24242c" />
      <circle cx="30" cy="100" r="2.5" fill="#24242c" />
      <defs>
        <linearGradient id="pantalla-gba" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4ea8ff" />
          <stop offset="1" stopColor="#9b7bff" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function DibujoConsola({ sistema }: { sistema: Sistema }) {
  if (sistema === 'gb') return <GameBoy />
  if (sistema === 'gbc') return <GameBoyColor />
  return <GameBoyAdvance />
}
