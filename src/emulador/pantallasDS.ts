/**
 * Disposición de las dos pantallas de Nintendo DS (v0.17.0, paso 3 del plan de DS).
 *
 * El núcleo da siempre las dos pantallas apiladas (256 x 384: la de arriba y debajo la táctil). La
 * app las recoloca:
 * - «apiladas»: tal cual.
 * - «libro-derecha» y «libro-izquierda»: la consola de lado, como un libro (Hotel Dusk, Last Window,
 *   Brain Training). Cada pantalla se gira un cuarto de vuelta y quedan lado a lado (384 x 256). Con
 *   la táctil a la derecha, la consola se gira a la izquierda (la de arriba queda a la izquierda);
 *   con la táctil a la izquierda, al revés.
 * - «grande»: una pantalla grande (256 x 192) y la otra en una miniatura aparte.
 *
 * Los toques llegan en coordenadas de la imagen que se ve (0 a 1) y hay que llevarlos a la imagen
 * del núcleo (`aNucleo`), donde la táctil es la mitad de abajo.
 */
export type PantallasDS = 'apiladas' | 'libro-derecha' | 'libro-izquierda' | 'grande'
export type PrincipalDS = 'arriba' | 'abajo'

/** Ancho y alto de una pantalla de DS. */
export const ANCHO = 256
export const ALTO = 192

export const esLibro = (d: PantallasDS) => d === 'libro-derecha' || d === 'libro-izquierda'

/** Tamaño de la imagen que se ve, según la disposición. */
export function tamanoSalida(d: PantallasDS): { ancho: number; alto: number } {
  if (esLibro(d)) return { ancho: ALTO * 2, alto: ANCHO }
  if (d === 'grande') return { ancho: ANCHO, alto: ALTO }
  return { ancho: ANCHO, alto: ALTO * 2 }
}

/**
 * Lleva un toque sobre la imagen que se ve (x e y de 0 a 1) a la imagen del núcleo (de 0 a 1, con la
 * táctil en la mitad de abajo). Devuelve null si el toque no cae en la pantalla táctil.
 */
export function aNucleo(d: PantallasDS, principal: PrincipalDS, x: number, y: number): [number, number] | null {
  if (d === 'apiladas') return [x, y]
  if (d === 'grande') return principal === 'abajo' ? [x, 0.5 + y / 2] : null
  // Libro: la imagen mide 384 x 256 y cada mitad es una pantalla girada
  const px = x * ALTO * 2
  const py = y * ANCHO
  if (d === 'libro-derecha') {
    // Táctil en la mitad derecha, girada a la izquierda: u = 256 - y', v = x' - 192
    if (px < ALTO) return null
    return [(ANCHO - py) / ANCHO, (ALTO + (px - ALTO)) / (ALTO * 2)]
  }
  // Táctil en la mitad izquierda, girada a la derecha: u = y', v = 192 - x'
  if (px > ALTO) return null
  return [py / ANCHO, (ALTO + (ALTO - px)) / (ALTO * 2)]
}

/**
 * Pinta las pantallas del núcleo (en `fuente`, 256 x 384) en el lienzo con la disposición elegida.
 * En «grande», la otra pantalla va a `mini` si lo hay.
 */
export function componer(
  ctx: CanvasRenderingContext2D,
  fuente: CanvasImageSource,
  d: PantallasDS,
  principal: PrincipalDS,
  mini?: CanvasRenderingContext2D | null,
): void {
  ctx.imageSmoothingEnabled = false
  const pantalla = (c: CanvasRenderingContext2D, cual: PrincipalDS) => c.drawImage(fuente, 0, cual === 'arriba' ? 0 : ALTO, ANCHO, ALTO, 0, 0, ANCHO, ALTO)
  if (d === 'grande') {
    pantalla(ctx, principal)
    if (mini) {
      mini.imageSmoothingEnabled = false
      pantalla(mini, principal === 'arriba' ? 'abajo' : 'arriba')
    }
    return
  }
  // Libro: cada pantalla girada un cuarto de vuelta
  const girada = (cual: PrincipalDS, dx: number, angulo: number, dy: number) => {
    ctx.save()
    ctx.translate(dx, dy)
    ctx.rotate(angulo)
    pantalla(ctx, cual)
    ctx.restore()
  }
  if (d === 'libro-derecha') {
    girada('arriba', 0, -Math.PI / 2, ANCHO)
    girada('abajo', ALTO, -Math.PI / 2, ANCHO)
  } else {
    girada('arriba', ALTO * 2, Math.PI / 2, 0)
    girada('abajo', ALTO, Math.PI / 2, 0)
  }
}
