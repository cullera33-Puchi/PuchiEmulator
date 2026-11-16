/**
 * Pinta los fotogramas del núcleo (v0.31.0). Trabaja sobre un OffscreenCanvas, así que vale igual en el
 * hilo del motor que en el principal, y deja cada imagen lista para enseñarla sin copiarla
 * (`transferToImageBitmap`).
 *
 * - Con la tarjeta gráfica (WebGL 2): el fotograma se sube como textura y cada pantalla se dibuja como
 *   un rectángulo en su sitio (las disposiciones de DS, giradas en «libro», sin pasos intermedios).
 * - Si no hay WebGL 2 (o se pierde), como hasta ahora: `putImageData` y, en DS, `componer`.
 *
 * La miniatura de DS («grande y pequeña») va siempre en 2D: es una copia directa de 256 x 192.
 */
import { ALTO, ANCHO, componer, cuadrosDS, tamanoSalida, type PantallasDS, type PrincipalDS } from './pantallasDS'

export type TipoPintor = 'webgl' | '2d'
/** «auto»: se miden los dos al abrir el juego y se usa el más rápido en ese aparato (v0.31.0) */
export type PreferenciaPintor = TipoPintor | 'auto'

export interface Disposicion {
  pantallas: PantallasDS
  principal: PrincipalDS
  /** Pintar también la miniatura (DS en «grande y pequeña») */
  conMini: boolean
}

export interface Imagenes {
  imagen: ImageBitmap
  mini?: ImageBitmap
  ancho: number
  alto: number
}

/** Si el fotograma es de DS (dos pantallas apiladas) y hay que recolocarlo. */
const recolocar = (ancho: number, alto: number, d: Disposicion) => d.pantallas !== 'apiladas' && alto === ancho * 1.5

export abstract class Pintor {
  abstract readonly tipo: TipoPintor
  protected salida: OffscreenCanvas
  private mini: OffscreenCanvas | null = null
  private miniContexto: OffscreenCanvasRenderingContext2D | null = null
  private miniImagen: ImageData | null = null

  constructor(salida: OffscreenCanvas) {
    this.salida = salida
  }

  /** Pinta el fotograma (RGBA, ancho x alto) y devuelve las imágenes para enseñar. */
  pintar(datos: Uint8Array, ancho: number, alto: number, d: Disposicion): Imagenes {
    const { ancho: w, alto: h } = recolocar(ancho, alto, d) ? tamanoSalida(d.pantallas) : { ancho, alto }
    if (this.salida.width !== w || this.salida.height !== h) {
      this.salida.width = w
      this.salida.height = h
    }
    this.dibujar(datos, ancho, alto, d, w, h)
    const imagen = this.salida.transferToImageBitmap()
    const mini = d.conMini && d.pantallas === 'grande' && alto === ancho * 1.5 ? this.pintarMini(datos, ancho, d.principal === 'arriba' ? 'abajo' : 'arriba') : undefined
    return { imagen, mini, ancho: w, alto: h }
  }

  /** Captura en PNG del fotograma, para los estados guardados. */
  async captura(datos: Uint8Array, ancho: number, alto: number, d: Disposicion): Promise<ArrayBuffer | undefined> {
    try {
      const { ancho: w, alto: h } = recolocar(ancho, alto, d) ? tamanoSalida(d.pantallas) : { ancho, alto }
      if (this.salida.width !== w || this.salida.height !== h) {
        this.salida.width = w
        this.salida.height = h
      }
      this.dibujar(datos, ancho, alto, d, w, h)
      const blob = await this.salida.convertToBlob({ type: 'image/png' })
      return await blob.arrayBuffer()
    } catch {
      return undefined
    }
  }

  protected abstract dibujar(datos: Uint8Array, ancho: number, alto: number, d: Disposicion, w: number, h: number): void

  private pintarMini(datos: Uint8Array, ancho: number, cual: PrincipalDS): ImageBitmap | undefined {
    if (!this.mini) {
      this.mini = new OffscreenCanvas(ANCHO, ALTO)
      this.miniContexto = this.mini.getContext('2d', { alpha: false })
      this.miniImagen = new ImageData(ANCHO, ALTO)
    }
    if (!this.miniContexto || !this.miniImagen) return undefined
    // La otra pantalla: la mitad de arriba o la de abajo del fotograma, fila a fila tal cual
    const inicio = cual === 'arriba' ? 0 : ALTO * ancho * 4
    this.miniImagen.data.set(datos.subarray(inicio, inicio + ANCHO * ALTO * 4))
    this.miniContexto.putImageData(this.miniImagen, 0, 0)
    return this.mini.transferToImageBitmap()
  }
}

/** Como hasta la v0.30.0: imagen por el procesador y, en DS, recolocada con `componer`. */
export class Pintor2D extends Pintor {
  readonly tipo = '2d'
  private readonly contexto: OffscreenCanvasRenderingContext2D
  private imagen: ImageData | null = null
  private fuente: OffscreenCanvas | null = null

  constructor(salida = new OffscreenCanvas(240, 160)) {
    super(salida)
    const c = salida.getContext('2d', { alpha: false })
    if (!c) throw new Error('Sin lienzo 2D')
    this.contexto = c
  }

  protected dibujar(datos: Uint8Array, ancho: number, alto: number, d: Disposicion): void {
    if (!this.imagen || this.imagen.width !== ancho || this.imagen.height !== alto) this.imagen = new ImageData(ancho, alto)
    this.imagen.data.set(datos)
    if (!recolocar(ancho, alto, d)) {
      this.contexto.putImageData(this.imagen, 0, 0)
      return
    }
    if (!this.fuente || this.fuente.width !== ancho || this.fuente.height !== alto) this.fuente = new OffscreenCanvas(ancho, alto)
    this.fuente.getContext('2d')!.putImageData(this.imagen, 0, 0)
    componer(this.contexto, this.fuente, d.pantallas, d.principal, null)
  }
}

const VERTICES = `#version 300 es
in vec2 posicion;
in vec2 coordenada;
out vec2 vCoordenada;
void main() {
  vCoordenada = coordenada;
  gl_Position = vec4(posicion, 0.0, 1.0);
}`

const FRAGMENTOS = `#version 300 es
precision mediump float;
uniform sampler2D fotograma;
in vec2 vCoordenada;
out vec4 color;
void main() {
  color = vec4(texture(fotograma, vCoordenada).rgb, 1.0);
}`

/** Con la tarjeta gráfica (WebGL 2): textura del fotograma y un rectángulo por pantalla. */
export class PintorGL extends Pintor {
  readonly tipo = 'webgl'
  private readonly gl: WebGL2RenderingContext
  private readonly textura: WebGLTexture
  private readonly bufer: WebGLBuffer
  private texturaAncho = 0
  private texturaAlto = 0
  private readonly vertices = new Float32Array(2 * 6 * 4)

  constructor(salida = new OffscreenCanvas(240, 160)) {
    super(salida)
    const gl = salida.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false })
    if (!gl) throw new Error('Sin WebGL 2')
    this.gl = gl
    const sombreador = (tipo: number, codigo: string) => {
      const s = gl.createShader(tipo)!
      gl.shaderSource(s, codigo)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'Sombreador')
      return s
    }
    const programa = gl.createProgram()!
    gl.attachShader(programa, sombreador(gl.VERTEX_SHADER, VERTICES))
    gl.attachShader(programa, sombreador(gl.FRAGMENT_SHADER, FRAGMENTOS))
    gl.linkProgram(programa)
    if (!gl.getProgramParameter(programa, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(programa) ?? 'Programa')
    gl.useProgram(programa)
    this.bufer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufer)
    const posicion = gl.getAttribLocation(programa, 'posicion')
    const coordenada = gl.getAttribLocation(programa, 'coordenada')
    gl.enableVertexAttribArray(posicion)
    gl.vertexAttribPointer(posicion, 2, gl.FLOAT, false, 16, 0)
    gl.enableVertexAttribArray(coordenada)
    gl.vertexAttribPointer(coordenada, 2, gl.FLOAT, false, 16, 8)
    this.textura = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.textura)
    // Píxeles nítidos: la salida va a la resolución del juego y el escalado lo hace la página
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
  }

  protected dibujar(datos: Uint8Array, ancho: number, alto: number, d: Disposicion, w: number, h: number): void {
    const gl = this.gl
    if (gl.isContextLost()) throw new Error('Se ha perdido el contexto de WebGL')
    if (this.texturaAncho !== ancho || this.texturaAlto !== alto) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, ancho, alto, 0, gl.RGBA, gl.UNSIGNED_BYTE, datos)
      this.texturaAncho = ancho
      this.texturaAlto = alto
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, ancho, alto, gl.RGBA, gl.UNSIGNED_BYTE, datos)
    }
    const cuadros = cuadrosDS(recolocar(ancho, alto, d) ? d.pantallas : null, d.principal, ancho, alto)
    const v = this.vertices
    let i = 0
    // Dos triángulos por rectángulo, con la posición en coordenadas de la tarjeta (de -1 a 1)
    for (const c of cuadros) {
      const x0 = (c.x0 / w) * 2 - 1
      const x1 = (c.x1 / w) * 2 - 1
      const y0 = 1 - (c.y0 / h) * 2
      const y1 = 1 - (c.y1 / h) * 2
      const [tl, tr, bl, br] = c.uv
      for (const [x, y, [u, t]] of [
        [x0, y0, tl],
        [x1, y0, tr],
        [x0, y1, bl],
        [x0, y1, bl],
        [x1, y0, tr],
        [x1, y1, br],
      ] as const) {
        v[i++] = x
        v[i++] = y
        v[i++] = u
        v[i++] = t
      }
    }
    gl.viewport(0, 0, w, h)
    gl.bufferData(gl.ARRAY_BUFFER, v.subarray(0, i), gl.DYNAMIC_DRAW)
    gl.drawArrays(gl.TRIANGLES, 0, i / 4)
  }
}

/**
 * Elige el pintor (v0.31.0). Con «auto», pinta el primer fotograma unas veces con cada uno y se queda
 * con el que tarda menos en este aparato: en un iPhone, la tarjeta gráfica; en un navegador sin ella
 * (que la imita por software), el 2D. Devuelve también lo medido, en ms por imagen, para el registro.
 */
export function elegirPintor(
  preferencia: PreferenciaPintor,
  v: { datos: Uint8Array; ancho: number; alto: number } | null,
): { pintor: Pintor; ms?: Record<TipoPintor, number> } {
  if (preferencia !== 'auto' || !v) return { pintor: crearPintor(preferencia === 'auto' ? 'webgl' : preferencia) }
  let gl: Pintor
  try {
    gl = new PintorGL()
  } catch {
    return { pintor: new Pintor2D() }
  }
  const p2 = new Pintor2D()
  const d: Disposicion = { pantallas: 'apiladas', principal: 'abajo', conMini: false }
  const medir = (p: Pintor) => {
    for (let i = 0; i < 3; i++) p.pintar(v.datos, v.ancho, v.alto, d).imagen.close()
    const t0 = performance.now()
    for (let i = 0; i < 12; i++) p.pintar(v.datos, v.ancho, v.alto, d).imagen.close()
    return (performance.now() - t0) / 12
  }
  try {
    const ms = { webgl: medir(gl), '2d': medir(p2) }
    return { pintor: ms.webgl <= ms['2d'] ? gl : p2, ms }
  } catch {
    return { pintor: p2 }
  }
}

/** El pintor de la tarjeta gráfica si se puede; si no, el 2D. */
export function crearPintor(preferido: TipoPintor = 'webgl'): Pintor {
  if (preferido === 'webgl') {
    try {
      return new PintorGL()
    } catch {
      // sin WebGL 2 en OffscreenCanvas: 2D
    }
  }
  return new Pintor2D()
}
