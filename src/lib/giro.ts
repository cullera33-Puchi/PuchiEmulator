/**
 * Pantalla girada (v0.22.0): con «Girar la pantalla» y el iPhone en vertical, el juego se gira un
 * cuarto de vuelta. Los toques llegan en coordenadas de la pantalla del iPhone y hay que pasarlos
 * a las del juego girado.
 */
export type Giro = 0 | 90 | -90

/** Giro del recuadro del juego que contiene a `el` (0 si no está girado). */
export function giroDe(el: Element | null | undefined): Giro {
  const g = Number(el?.closest<HTMLElement>('.giro')?.dataset.giro ?? 0)
  return g === 90 || g === -90 ? g : 0
}

/**
 * Un desplazamiento en la pantalla del iPhone, visto desde el juego girado. Con 90 grados (a la
 * derecha), lo que en el juego va hacia la derecha se ve hacia abajo, y al revés.
 */
export function vectorJuego(dx: number, dy: number, giro: Giro): [number, number] {
  if (giro === 90) return [dy, -dx]
  if (giro === -90) return [-dy, dx]
  return [dx, dy]
}

/**
 * Dónde cae un punto de la pantalla dentro de un elemento del juego, de 0 a 1 en su ancho y su
 * alto, aunque esté girado (el centro de un elemento no cambia al girarlo).
 */
export function fraccionEn(el: HTMLElement, x: number, y: number, giro: Giro = giroDe(el)): [number, number] {
  const r = el.getBoundingClientRect()
  const [vx, vy] = vectorJuego(x - (r.left + r.width / 2), y - (r.top + r.height / 2), giro)
  const ancho = el.offsetWidth || r.width
  const alto = el.offsetHeight || r.height
  return [0.5 + vx / ancho, 0.5 + vy / alto]
}
