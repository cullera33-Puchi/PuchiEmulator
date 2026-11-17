/**
 * Botones movibles (v0.20.0, bloque 3): cada pieza del mando táctil se puede mover y cambiar de
 * tamaño, por juego y por orientación. Se guarda el centro de cada pieza como fracción de la
 * pantalla (así sirve en cualquier iPhone) y su escala. Desde la v0.35.0 también las herramientas:
 * guardar y cargar, las de la derecha (rebobinar, soplar y avance rápido) y el menú.
 */
export const PIEZAS = ['cruceta', 'botones', 'l', 'r', 'select', 'start', 'guardar', 'herramientas', 'menu', 'palanca'] as const
export type Pieza = (typeof PIEZAS)[number]

export interface Colocacion {
  /** Centro de la pieza, de 0 a 1 sobre el ancho y el alto de la pantalla */
  x: number
  y: number
  escala: number
  /**
   * Alto del recuadro del juego al colocarla, en puntos (v0.42.4). Las piezas de la mitad de abajo
   * guardan así su distancia al borde de abajo: iOS 26 abre la app unas veces con 874 de alto y otras
   * con 812, y con solo la fracción la cruceta bajaba o subía y pisaba la fila de herramientas
   */
  alto?: number
}

export type DisposicionPiezas = Partial<Record<Pieza, Colocacion>>
export type Orientacion = 'vertical' | 'horizontal'

export const ESCALA_MIN = 0.6
export const ESCALA_MAX = 1.8

const entre = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Mueve el centro de una pieza, sin que se salga de la pantalla. */
export function mover(c: Colocacion, dx: number, dy: number, alto?: number): Colocacion {
  return { ...c, x: entre(c.x + dx, 0.02, 0.98), y: entre(c.y + dy, 0.02, 0.98), ...(alto ? { alto } : {}) }
}

/** Cambia el tamaño en pasos del 10 %, entre el 60 % y el 180 %. */
export function escalar(c: Colocacion, pasos: number): Colocacion {
  return { ...c, escala: Math.round(entre(c.escala + pasos * 0.1, ESCALA_MIN, ESCALA_MAX) * 10) / 10 }
}

/** Colocación inicial de una pieza a partir de dónde está en pantalla ahora mismo. */
export function desdeRect(r: { left: number; top: number; width: number; height: number }, ancho: number, alto: number, escala = 1): Colocacion {
  return { x: (r.left + r.width / 2) / ancho, y: (r.top + r.height / 2) / alto, escala, alto }
}

/**
 * Alto del recuadro con el que se colocaron las piezas guardadas antes de la v0.42.4, que no lo
 * llevan: el de la pantalla (desde la v0.35.0 el recuadro la ocupaba entera)
 */
function altoAnterior(): number | undefined {
  if (typeof window === 'undefined' || !window.screen) return undefined
  const { width, height } = window.screen
  return window.innerHeight >= window.innerWidth ? Math.max(width, height) : Math.min(width, height)
}

/**
 * Estilo en línea de una pieza colocada: centrada en su punto y escalada. Las de la mitad de arriba,
 * a su fracción del alto; las de la mitad de abajo, a la misma distancia del borde de abajo que
 * cuando se colocaron (v0.42.4)
 */
export function estiloPieza(c: Colocacion, altoSinDato = altoAnterior()): Record<string, string> {
  const alto = c.alto ?? altoSinDato
  if (c.y > 0.5 && alto) {
    return {
      left: `${c.x * 100}cqw`,
      top: 'auto',
      right: 'auto',
      bottom: `${Math.round((1 - c.y) * alto)}px`,
      translate: '-50% 50%',
      scale: String(c.escala),
    }
  }
  return {
    left: `${c.x * 100}cqw`,
    top: `${c.y * 100}cqh`,
    right: 'auto',
    bottom: 'auto',
    translate: '-50% -50%',
    scale: String(c.escala),
  }
}
