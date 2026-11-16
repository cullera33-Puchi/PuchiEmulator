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
 * - «lado» (v0.20.0): una junto a otra, sin girar (512 x 192), la táctil a la derecha.
 * - «grande»: una pantalla grande (256 x 192) y la otra en una miniatura aparte.
 *
 * Los toques llegan en coordenadas de la imagen que se ve (0 a 1) y hay que llevarlos a la imagen
 * del núcleo (`aNucleo`), donde la táctil es la mitad de abajo.
 */
export type PantallasDS = 'apiladas' | 'lado' | 'libro-derecha' | 'libro-izquierda' | 'grande'
export type PrincipalDS = 'arriba' | 'abajo'

/** Ancho y alto de una pantalla de DS. */
export const ANCHO = 256
export const ALTO = 192

export const esLibro = (d: PantallasDS) => d === 'libro-derecha' || d === 'libro-izquierda'

/** Tamaño de la imagen que se ve, según la disposición. */
export function tamanoSalida(d: PantallasDS): { ancho: number; alto: number } {
  if (esLibro(d)) return { ancho: ALTO * 2, alto: ANCHO }
  if (d === 'grande') return { ancho: ANCHO, alto: ALTO }
  if (d === 'lado') return { ancho: ANCHO * 2, alto: ALTO }
  return { ancho: ANCHO, alto: ALTO * 2 }
}

/**
 * Lleva un toque sobre la imagen que se ve (x e y de 0 a 1) a la imagen del núcleo (de 0 a 1, con la
 * táctil en la mitad de abajo). Devuelve null si el toque no cae en la pantalla táctil.
 */
export function aNucleo(d: PantallasDS, principal: PrincipalDS, x: number, y: number): [number, number] | null {
  if (d === 'apiladas') return [x, y]
  if (d === 'grande') return principal === 'abajo' ? [x, 0.5 + y / 2] : null
  if (d === 'lado') return x < 0.5 ? null : [(x - 0.5) * 2, 0.5 + y / 2]
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
type Contexto2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export function componer(ctx: Contexto2D, fuente: CanvasImageSource, d: PantallasDS, principal: PrincipalDS, mini?: Contexto2D | null): void {
  ctx.imageSmoothingEnabled = false
  const pantalla = (c: Contexto2D, cual: PrincipalDS) => c.drawImage(fuente, 0, cual === 'arriba' ? 0 : ALTO, ANCHO, ALTO, 0, 0, ANCHO, ALTO)
  if (d === 'lado') {
    pantalla(ctx, 'arriba')
    ctx.drawImage(fuente, 0, ALTO, ANCHO, ALTO, ANCHO, 0, ANCHO, ALTO)
    return
  }
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

/**
 * Un rectángulo de la imagen que se ve (en píxeles de la salida) y de dónde sale en la imagen del
 * núcleo: coordenadas de 0 a 1 de sus cuatro esquinas (arriba izquierda, arriba derecha, abajo
 * izquierda y abajo derecha). Para pintar con la tarjeta gráfica (v0.31.0).
 */
export interface Cuadro {
  x0: number
  y0: number
  x1: number
  y1: number
  uv: [[number, number], [number, number], [number, number], [number, number]]
}

/**
 * Los rectángulos que forman la imagen que se ve: el fotograma entero si no hay que recolocar nada,
 * o cada pantalla de DS en su sitio (giradas en «libro»). Es la misma colocación que `componer` y que
 * deshace `aNucleo`. En «grande», solo la pantalla grande (la miniatura va aparte).
 */
export function cuadrosDS(d: PantallasDS | null, principal: PrincipalDS, ancho: number, alto: number): Cuadro[] {
  const rect = (x0: number, y0: number, x1: number, y1: number, fuente: (x: number, y: number) => [number, number]): Cuadro => ({
    x0,
    y0,
    x1,
    y1,
    uv: [fuente(x0, y0), fuente(x1, y0), fuente(x0, y1), fuente(x1, y1)],
  })
  // Sin recolocar: el fotograma tal cual
  if (!d || d === 'apiladas' || alto !== ancho * 1.5) return [rect(0, 0, ancho, alto, (x, y) => [x / ancho, y / alto])]
  // v de cada pantalla en la imagen del núcleo (256 x 384): arriba de 0 a 0,5 y abajo de 0,5 a 1
  const v = (cual: PrincipalDS, y: number) => (cual === 'arriba' ? 0 : 0.5) + y / (ALTO * 2)
  if (d === 'grande') return [rect(0, 0, ANCHO, ALTO, (x, y) => [x / ANCHO, v(principal, y)])]
  if (d === 'lado') {
    return [rect(0, 0, ANCHO, ALTO, (x, y) => [x / ANCHO, v('arriba', y)]), rect(ANCHO, 0, ANCHO * 2, ALTO, (x, y) => [(x - ANCHO) / ANCHO, v('abajo', y)])]
  }
  if (d === 'libro-derecha') {
    // La consola girada a la izquierda: arriba a la izquierda y la táctil a la derecha
    return [
      rect(0, 0, ALTO, ANCHO, (x, y) => [(ANCHO - y) / ANCHO, v('arriba', x)]),
      rect(ALTO, 0, ALTO * 2, ANCHO, (x, y) => [(ANCHO - y) / ANCHO, v('abajo', x - ALTO)]),
    ]
  }
  // Libro con la táctil a la izquierda: la consola girada a la derecha
  return [
    rect(ALTO, 0, ALTO * 2, ANCHO, (x, y) => [y / ANCHO, v('arriba', ALTO * 2 - x)]),
    rect(0, 0, ALTO, ANCHO, (x, y) => [y / ANCHO, v('abajo', ALTO - x)]),
  ]
}
