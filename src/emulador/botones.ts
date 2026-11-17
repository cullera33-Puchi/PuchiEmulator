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
  /** DS: el micrófono oye un soplido mientras se mantiene (L2 en melonDS), v0.20.0 */
  SOPLAR: 12,
  /** Nintendo 64 (v0.32.0): el gatillo Z, que es L2 en el núcleo */
  Z: 12,
  /** PlayStation (v0.37.0): L2 y R2 */
  L2: 12,
  R2: 13,
  /** DS: la tapa cerrada (L3 en melonDS), v0.20.0 */
  TAPA: 14,
  /** PlayStation con palancas (v0.38.0): pulsar la palanca izquierda o la derecha */
  L3: 14,
  R3: 15,
  /**
   * Nintendo 64: botones C. No son de libretro: el núcleo los lee de la palanca derecha, y `Nucleo`
   * convierte estos bits en esa palanca antes de cada fotograma.
   */
  C_ARRIBA: 16,
  C_ABAJO: 17,
  C_IZQUIERDA: 18,
  C_DERECHA: 19,
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

/** Inclinación de una palanca a partir de la que cuenta (de 0 a 1) */
const ZONA_PALANCA = 0.15

/** Palanca izquierda de un mando físico (Nintendo 64), con zona muerta; [0, 0] si está suelta. */
export function palancaDeMando(mando: Gamepad, lado: 0 | 1 = 0): [number, number] {
  const x = mando.axes[lado * 2] ?? 0
  const y = mando.axes[lado * 2 + 1] ?? 0
  return Math.hypot(x, y) < ZONA_PALANCA ? [0, 0] : [x, y]
}

/**
 * Mando físico con la distribución estándar (PlayStation, Xbox o MFi). En Nintendo 64 (v0.32.0), la
 * palanca izquierda va aparte (`palancaDeMando`), la derecha da los botones C y el gatillo izquierdo es Z.
 */
export function botonesDeMando(mando: Gamepad, n64 = false, psx = false, palancas = false): number {
  const p = (i: number) => mando.buttons[i]?.pressed ?? false
  let m = 0
  // Distribución de Nintendo: el botón de abajo es B y el de la derecha es A
  if (p(0)) m |= bit('B')
  if (p(1)) m |= bit('A')
  if (p(2)) m |= bit('Y')
  if (p(3)) m |= bit('X')
  if (n64) {
    if (p(4)) m |= bit('L')
    if (p(6)) m |= bit('Z')
  } else if (psx) {
    // PlayStation (v0.37.0): L1, L2, R1 y R2, cada uno en el suyo
    if (p(4)) m |= bit('L')
    if (p(6)) m |= bit('L2')
  } else if (p(4) || p(6)) m |= bit('L')
  if (psx) {
    if (p(5)) m |= bit('R')
    if (p(7)) m |= bit('R2')
  } else if (p(5) || p(7)) m |= bit('R')
  if (p(8)) m |= bit('SELECT')
  if (p(9)) m |= bit('START')
  if (p(12)) m |= bit('ARRIBA')
  if (p(13)) m |= bit('ABAJO')
  if (p(14)) m |= bit('IZQUIERDA')
  if (p(15)) m |= bit('DERECHA')
  if (n64) {
    const [, , cx = 0, cy = 0] = mando.axes
    if (cx < -0.5) m |= bit('C_IZQUIERDA')
    if (cx > 0.5) m |= bit('C_DERECHA')
    if (cy < -0.5) m |= bit('C_ARRIBA')
    if (cy > 0.5) m |= bit('C_ABAJO')
    return m
  }
  // PlayStation con palancas (v0.38.0): las palancas van aparte (`palancaDeMando`), y se pulsan (L3 y R3)
  if (palancas) {
    if (p(10)) m |= bit('L3')
    if (p(11)) m |= bit('R3')
    return m
  }
  const [x = 0, y = 0] = mando.axes
  if (Math.hypot(x, y) > 0.5) m |= direccionCruceta(x, y)
  return m
}

/** Palanca táctil de Nintendo 64 (v0.33.0): zona muerta, en fracción del recorrido */
export const PALANCA_MUERTA = 0.08
/** Grados alrededor de las rectas y las diagonales en los que la palanca se queda justo en ellas */
export const PALANCA_IMAN = 8

/**
 * Inclinación de la palanca a partir del desplazamiento del dedo (dx y dy en las mismas unidades que
 * `recorrido`, que es lo que hay que mover para llegar a tope). Devuelve x e y de -1 a 1 (y hacia
 * abajo es positivo). Sin saltos (v0.34.0; en la v0.33.0 los había y la palanca se sentía brusca):
 * - Zona muerta: por debajo, nada; a partir de ella, la inclinación empieza en 0 y llega a 1 en el tope.
 * - Imán: a menos de 8 grados de una recta o de una diagonal se queda exactamente en ella, para poder
 *   ir recto; entre medias, el ángulo se reparte para pasar de una a otra de forma continua.
 */
export function vectorPalanca(dx: number, dy: number, recorrido: number): [number, number] {
  if (recorrido <= 0) return [0, 0]
  const bruto = Math.min(1, Math.hypot(dx, dy) / recorrido)
  if (bruto < PALANCA_MUERTA) return [0, 0]
  const largo = (bruto - PALANCA_MUERTA) / (1 - PALANCA_MUERTA)
  const octavo = Math.PI / 4
  const medio = octavo / 2
  const iman = (PALANCA_IMAN * Math.PI) / 180
  const angulo = Math.atan2(dy, dx)
  const cercano = Math.round(angulo / octavo) * octavo
  const d = angulo - cercano
  // De 0 a «iman», exacto; de «iman» a medio octavo, se estira hasta el medio octavo
  const ajustado = Math.abs(d) <= iman ? 0 : (Math.sign(d) * (Math.abs(d) - iman) * medio) / (medio - iman)
  const final = cercano + ajustado
  const limpio = (v: number) => (Math.abs(v) < 1e-9 ? 0 : v)
  return [limpio(Math.cos(final) * largo), limpio(Math.sin(final) * largo)]
}
