/** Botones del mando, con los números de libretro (RETRO_DEVICE_ID_JOYPAD_*). */
export const BOTON = {
  B: 0,
  Y: 1,
  SELECT: 2,
  START: 3,
  ARRIBA: 4,
  ABAJO: 5,
  IZQUIERDA: 6,
  DERECHA: 7,
  A: 8,
  X: 9,
  L: 10,
  R: 11,
} as const

export type NombreBoton = keyof typeof BOTON

export const bit = (b: NombreBoton) => 1 << BOTON[b]

/** Teclado (para probar en el ordenador o con un teclado conectado al iPhone). */
export const TECLAS: Record<string, NombreBoton> = {
  ArrowUp: 'ARRIBA',
  ArrowDown: 'ABAJO',
  ArrowLeft: 'IZQUIERDA',
  ArrowRight: 'DERECHA',
  KeyX: 'A',
  KeyZ: 'B',
  KeyS: 'X',
  KeyA: 'Y',
  KeyQ: 'L',
  KeyW: 'R',
  Enter: 'START',
  ShiftRight: 'SELECT',
  Backspace: 'SELECT',
}

/** Las ocho direcciones con el centro de su sector en grados (0 = derecha, 90 = abajo). */
const DIRECCIONES: [number, number][] = [
  [0, bit('DERECHA')],
  [45, bit('DERECHA') | bit('ABAJO')],
  [90, bit('ABAJO')],
  [135, bit('ABAJO') | bit('IZQUIERDA')],
  [180, bit('IZQUIERDA')],
  [225, bit('IZQUIERDA') | bit('ARRIBA')],
  [270, bit('ARRIBA')],
  [315, bit('ARRIBA') | bit('DERECHA')],
]

/** Medio sector de cada dirección: las rectas, 30 grados a cada lado; las diagonales, 15 (v0.13.2). */
const MEDIO_RECTA = 30
const MEDIO_DIAGONAL = 15
/** Margen para cambiar de dirección: la que ya está pulsada se mantiene 10 grados más allá. */
const MARGEN = 10
/** Zona muerta central: hay que salir del 22 % del radio para pulsar y volver al 12 % para soltar. */
const ZONA_PULSAR = 0.22
const ZONA_SOLTAR = 0.12

const distanciaAngular = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/**
 * Dirección de la cruceta según el punto tocado respecto a su centro (dx y dy en unidades del
 * radio). Pensada para el pulgar (v0.13.2):
 * - Las rectas ocupan 60 grados y las diagonales 30: un pulgar algo torcido no se va a la diagonal.
 *   Con `cuatro`, sin diagonales (90 grados cada recta).
 * - Lo pulsado se mantiene hasta pasar 10 grados del borde de su sector: en la frontera entre dos
 *   direcciones no salta de una a otra.
 * - La zona muerta del centro también tiene margen, para que no parpadee al pasar por el medio.
 * @param anterior lo que daba la cruceta hasta ahora (0 si el dedo acaba de llegar)
 */
export function direccionCruceta(dx: number, dy: number, anterior = 0, cuatro = false): number {
  const r = Math.hypot(dx, dy)
  if (r < (anterior ? ZONA_SOLTAR : ZONA_PULSAR)) return 0
  const angulo = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360
  const medio = (centro: number) => (cuatro ? 45 : centro % 90 === 0 ? MEDIO_RECTA : MEDIO_DIAGONAL)
  const candidatas = cuatro ? DIRECCIONES.filter(([c]) => c % 90 === 0) : DIRECCIONES
  const actual = candidatas.find(([, m]) => m === anterior)
  if (actual && distanciaAngular(angulo, actual[0]) <= medio(actual[0]) + MARGEN) return anterior
  let mejor = candidatas[0]
  for (const d of candidatas) {
    if (distanciaAngular(angulo, d[0]) <= medio(d[0])) return d[1]
    if (distanciaAngular(angulo, d[0]) < distanciaAngular(angulo, mejor[0])) mejor = d
  }
  return mejor[1]
}

/** Mando físico con la distribución estándar (PlayStation, Xbox o MFi). */
export function botonesDeMando(mando: Gamepad): number {
  const p = (i: number) => mando.buttons[i]?.pressed ?? false
  let m = 0
  // Distribución de Nintendo: el botón de abajo es B y el de la derecha es A
  if (p(0)) m |= bit('B')
  if (p(1)) m |= bit('A')
  if (p(2)) m |= bit('Y')
  if (p(3)) m |= bit('X')
  if (p(4) || p(6)) m |= bit('L')
  if (p(5) || p(7)) m |= bit('R')
  if (p(8)) m |= bit('SELECT')
  if (p(9)) m |= bit('START')
  if (p(12)) m |= bit('ARRIBA')
  if (p(13)) m |= bit('ABAJO')
  if (p(14)) m |= bit('IZQUIERDA')
  if (p(15)) m |= bit('DERECHA')
  const [x = 0, y = 0] = mando.axes
  if (Math.hypot(x, y) > 0.5) m |= direccionCruceta(x, y)
  return m
}
