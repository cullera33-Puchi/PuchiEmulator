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

/**
 * Dirección de la cruceta según el punto tocado respecto a su centro (dx y dy en unidades del
 * radio). Ocho direcciones: cada diagonal ocupa un sector de 45 grados. Dentro de la zona muerta
 * central no se pulsa nada.
 */
export function direccionCruceta(dx: number, dy: number, zonaMuerta = 0.18): number {
  if (Math.hypot(dx, dy) < zonaMuerta) return 0
  const angulo = (Math.atan2(dy, dx) * 180) / Math.PI // 0 = derecha, 90 = abajo
  const sector = Math.round(((angulo + 360) % 360) / 45) % 8
  const porSector = [
    bit('DERECHA'),
    bit('DERECHA') | bit('ABAJO'),
    bit('ABAJO'),
    bit('ABAJO') | bit('IZQUIERDA'),
    bit('IZQUIERDA'),
    bit('IZQUIERDA') | bit('ARRIBA'),
    bit('ARRIBA'),
    bit('ARRIBA') | bit('DERECHA'),
  ]
  return porSector[sector]
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
  if (Math.hypot(x, y) > 0.5) m |= direccionCruceta(x, y, 0)
  return m
}
