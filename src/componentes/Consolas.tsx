/**
 * Dibujos propios de las consolas para la pantalla de inicio: formas genéricas inspiradas en cada
 * una, sin logotipos ni textos. El usuario puede sustituirlos por una foto suya.
 */
import type { Consola } from '../lib/sistemas'

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

function SuperNintendo() {
  return (
    <svg viewBox="0 0 230 150" className="h-full w-auto drop-shadow-md" aria-hidden>
      {/* Consola de sobremesa: cuerpo gris claro con la ranura del cartucho y dos interruptores */}
      <path d="M22 14h186c10 0 16 6 16 16v38c0 10-6 16-16 16H22C12 84 6 78 6 68V30c0-10 6-16 16-16z" fill="#d4d4da" />
      <path d="M6 52h218v16c0 10-6 16-16 16H22C12 84 6 78 6 68z" fill="#bebec8" />
      <rect x="62" y="22" width="106" height="20" rx="6" fill="#9f9fac" />
      <rect x="72" y="28" width="86" height="8" rx="4" fill="#6e6e7c" />
      <rect x="28" y="58" width="22" height="9" rx="4" fill="#7d6fb4" />
      <rect x="180" y="58" width="22" height="9" rx="4" fill="#7d6fb4" />
      {/* Mando con forma de hueso, cruceta y cuatro botones de colores */}
      <path d="M70 100h90c14 0 24 10 24 22s-10 22-24 22c-10 0-16-5-22-10h-46c-6 5-12 10-22 10-14 0-24-10-24-22s10-22 24-22z" fill="#cfcfd6" />
      <Cruz x={70} y={122} t={8} color="#2c2c34" />
      <circle cx="162" cy="112" r="5.5" fill="#2f62b6" />
      <circle cx="173" cy="122" r="5.5" fill="#c8282f" />
      <circle cx="162" cy="132" r="5.5" fill="#e3ac12" />
      <circle cx="151" cy="122" r="5.5" fill="#2f8c56" />
      <rect x="103" y="124" width="10" height="4" rx="2" fill="#8d8d9a" transform="rotate(-30 108 126)" />
      <rect x="118" y="124" width="10" height="4" rx="2" fill="#8d8d9a" transform="rotate(-30 123 126)" />
    </svg>
  )
}

/** Game Boy y Game Boy Color juntas: la Color, más pequeña, delante a la derecha */
function GameBoys() {
  return (
    <span className="flex h-full items-end">
      <span className="h-full">
        <GameBoy />
      </span>
      <span className="-ml-7 h-[80%]">
        <GameBoyColor />
      </span>
    </span>
  )
}

export function DibujoConsola({ consola }: { consola: Consola }) {
  if (consola === 'snes') return <SuperNintendo />
  if (consola === 'gb') return <GameBoys />
  return <GameBoyAdvance />
}
