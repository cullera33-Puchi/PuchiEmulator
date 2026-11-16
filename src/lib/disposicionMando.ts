/**
 * Botones movibles (v0.20.0, bloque 3): cada pieza del mando táctil se puede mover y cambiar de
 * tamaño, por juego y por orientación. Se guarda el centro de cada pieza como fracción de la
 * pantalla (así sirve en cualquier iPhone) y su escala.
 */
export const PIEZAS = ['cruceta', 'botones', 'l', 'r', 'select', 'start'] as const
export type Pieza = (typeof PIEZAS)[number]

export interface Colocacion {
  /** Centro de la pieza, de 0 a 1 sobre el ancho y el alto de la pantalla */
  x: number
  y: number
  escala: number
}

export type DisposicionPiezas = Partial<Record<Pieza, Colocacion>>
export type Orientacion = 'vertical' | 'horizontal'

export const ESCALA_MIN = 0.6
export const ESCALA_MAX = 1.8

const entre = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Mueve el centro de una pieza, sin que se salga de la pantalla. */
export function mover(c: Colocacion, dx: number, dy: number): Colocacion {
  return { ...c, x: entre(c.x + dx, 0.02, 0.98), y: entre(c.y + dy, 0.02, 0.98) }
}

/** Cambia el tamaño en pasos del 10 %, entre el 60 % y el 180 %. */
export function escalar(c: Colocacion, pasos: number): Colocacion {
  return { ...c, escala: Math.round(entre(c.escala + pasos * 0.1, ESCALA_MIN, ESCALA_MAX) * 10) / 10 }
}

/** Colocación inicial de una pieza a partir de dónde está en pantalla ahora mismo. */
export function desdeRect(r: { left: number; top: number; width: number; height: number }, ancho: number, alto: number, escala = 1): Colocacion {
  return { x: (r.left + r.width / 2) / ancho, y: (r.top + r.height / 2) / alto, escala }
}

/** Estilo en línea de una pieza colocada: centrada en su punto y escalada. */
export function estiloPieza(c: Colocacion): Record<string, string> {
  return {
    left: `${c.x * 100}cqw`,
    top: `${c.y * 100}cqh`,
    right: 'auto',
    bottom: 'auto',
    translate: '-50% -50%',
    scale: String(c.escala),
  }
}
