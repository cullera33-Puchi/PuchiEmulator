/**
 * Envoltorio de un núcleo compilado a WebAssembly (public/nucleos/<nombre>.js y .wasm), con las
 * funciones del puente de nucleos/puente.c.
 */
import type { NombreNucleo } from '../lib/sistemas'

interface Modulo {
  HEAPU8: Uint8Array
  _malloc(n: number): number
  _free(p: number): void
  stringToNewUTF8(s: string): number
  _pf_iniciar(): void
  _pf_cargar(datos: number, tam: number, extension: number): number
  _pf_descargar(): void
  _pf_reiniciar(): void
  _pf_botones(mascara: number): void
  _pf_fotograma(): number
  _pf_video(): number
  _pf_video_ancho(): number
  _pf_video_alto(): number
  _pf_audio(): number
  _pf_audio_muestras(): number
  _pf_fps(): number
  _pf_frecuencia(): number
  _pf_base_ancho(): number
  _pf_base_alto(): number
  _pf_proporcion(): number
  _pf_av_cambiado(): number
  _pf_memoria(id: number): number
  _pf_memoria_tam(id: number): number
  _pf_estado_tam(): number
  _pf_guardar_estado(destino: number, tam: number): number
  _pf_cargar_estado(origen: number, tam: number): number
  _pf_opcion(clave: number, valor: number): void
  _pf_puntero(x: number, y: number, pulsado: number): void
  // Desde la v0.32.0 (núcleos anteriores sin ellas)
  _pf_analogico?(lado: number, x: number, y: number): void
  _pf_imagen_gl?(): number
  _pf_resultado?(): number
  specialHTMLTargets?: Record<string, unknown>
  /** Nintendo 64 (v0.32.1): el error original de un fallo dentro del núcleo, con su pila */
  errorOriginal?: unknown
  FS?: {
    mkdirTree(ruta: string): void
    writeFile(ruta: string, datos: Uint8Array): void
    readFile(ruta: string): Uint8Array
    analyzePath(ruta: string): { exists: boolean }
  }
}

type Fabrica = (opciones: {
  locateFile: (ruta: string) => string
  print?: (t: string) => void
  printErr?: (t: string) => void
  instantiateWasm?: (imports: WebAssembly.Imports, exito: (instancia: WebAssembly.Instance, modulo: WebAssembly.Module) => void) => object
}) => Promise<Modulo>

const raizNucleos = () => `${import.meta.env.BASE_URL}nucleos/`

/**
 * Núcleos ya descargados y compilados (v0.28.0). Compilar el WebAssembly es lo que más tarda al abrir
 * un juego: se hace una vez por núcleo y se reutiliza en las siguientes aperturas. `prepararNucleo`
 * lo adelanta al abrir la app con el de la consola que más se juega.
 */
const listos = new Set<NombreNucleo>()
const preparados = new Map<NombreNucleo, Promise<{ crear: Fabrica; modulo: WebAssembly.Module }>>()

/** Núcleos compilados que se guardan a la vez (v0.30.0): cada uno ocupa varios megas en memoria */
const MAX_PREPARADOS = 2

export function prepararNucleo(nombre: NombreNucleo): Promise<{ crear: Fabrica; modulo: WebAssembly.Module }> {
  let p = preparados.get(nombre)
  if (p) {
    // El último usado pasa al final: se descarta antes el que lleva más tiempo sin usarse
    preparados.delete(nombre)
    preparados.set(nombre, p)
  } else {
    const raiz = raizNucleos()
    p = (async () => {
      const [{ default: crear }, modulo] = await Promise.all([
        import(/* @vite-ignore */ `${raiz}${nombre}.js`) as Promise<{ default: Fabrica }>,
        (async () => {
          const respuesta = fetch(`${raiz}${nombre}.wasm`)
          try {
            return await WebAssembly.compileStreaming(respuesta)
          } catch {
            // Sin compilación en streaming (o sin el tipo application/wasm): se compila entero
            return WebAssembly.compile(await (await fetch(`${raiz}${nombre}.wasm`)).arrayBuffer())
          }
        })(),
      ])
      return { crear, modulo }
    })()
    // Si falla (por ejemplo, sin conexión y sin caché), se vuelve a intentar la próxima vez
    p.then(
      () => listos.add(nombre),
      () => preparados.delete(nombre),
    )
    preparados.set(nombre, p)
    for (const viejo of preparados.keys()) {
      if (preparados.size <= MAX_PREPARADOS) break
      preparados.delete(viejo)
      listos.delete(viejo)
    }
  }
  return p
}

/** Si el núcleo ya está compilado: para saber en el registro si la apertura se lo ha ahorrado. */
export const nucleoPreparado = (nombre: NombreNucleo) => listos.has(nombre)

const MEMORIA_PARTIDA = 0
const MEMORIA_RELOJ = 1

/**
 * Núcleos que guardan la partida en un fichero en lugar de en memoria (melonDS): la app lo deja ahí
 * antes de arrancar y lo lee después. El nombre sale de la ruta que el puente da al juego.
 */
const PARTIDA_EN_FICHERO: Partial<Record<NombreNucleo, string>> = { melonds: '/sistema/juego.sav' }

/** Opciones fijas de cada núcleo. */
export const OPCIONES: Record<NombreNucleo, Record<string, string>> = {
  mgba: {
    mgba_sgb_borders: 'OFF',
    mgba_skip_bios: 'ON',
    mgba_use_bios: 'OFF',
    mgba_gb_model: 'Autodetect',
    mgba_idle_optimization: 'Remove Known',
    mgba_frameskip: 'disabled',
    // Filtro de agudos, como el altavoz de la consola: sin él, el sonido de GBA es chillón
    mgba_audio_low_pass_filter: 'enabled',
    mgba_audio_low_pass_range: '60',
  },
  snes9x: {
    snes9x_region: 'auto',
    snes9x_overscan: 'enabled',
  },
  melonds: {
    melonds_console_mode: 'DS',
    melonds_boot_directly: 'enabled',
    melonds_threaded_renderer: 'disabled',
    melonds_touch_mode: 'Touch',
    melonds_screen_layout: 'Top/Bottom',
    melonds_screen_gap: '0',
    // Sonido: interpolación cúbica y 16 bits (por defecto, sin interpolar y a 10 bits: suena áspero)
    melonds_audio_interpolation: 'Cubic',
    melonds_audio_bitrate: '16-bit',
    // Sin firmware, melonDS crea uno con este idioma: los juegos multilingües salen en español
    melonds_language: 'Spanish',
  },
  // NES (v0.23.0): sonido de más calidad; el resto, como viene (paleta y bordes de la tele)
  fceumm: {
    fceumm_sndquality: 'High',
  },
  // Mega Drive, Master System y Game Gear (v0.24.0): la consola y la región, según el juego
  genesis: {
    genesis_plus_gx_system_hw: 'auto',
    genesis_plus_gx_region_detect: 'auto',
  },
  // Nintendo 64 (v0.32.0): GLideN64 con WebGL 2, el RSP de alto nivel y el intérprete con caché (en
  // WebAssembly no hay recompilador); todo en un hilo y sin guardar los sombreadores en ficheros
  n64: {
    'mupen64plus-rdp-plugin': 'gliden64',
    'mupen64plus-rsp-plugin': 'hle',
    'mupen64plus-cpucore': 'cached_interpreter',
    'mupen64plus-ThreadedRenderer': 'False',
    'mupen64plus-43screensize': '640x480',
    'mupen64plus-aspect': '4:3',
    'mupen64plus-EnableShadersStorage': 'False',
    'mupen64plus-pak1': 'memory',
    // v0.32.1: sin copiar la imagen ni la profundidad a la memoria de la consola. La copia de la imagen
    // lee de la tarjeta gráfica con glMapBufferRange, que WebGL no tiene (copiaba memoria cualquiera), y
    // la de profundidad dibuja cada triángulo otra vez en el procesador. Algunos efectos se pierden
    // (fotos hechas dentro del juego, destellos que deberían taparse detrás de las paredes)
    'mupen64plus-EnableCopyColorToRDRAM': 'Off',
    'mupen64plus-EnableCopyDepthToRDRAM': 'Off',
    // v0.33.0: sin la zona muerta del núcleo (un 15 %): la palanca táctil ya lleva la suya, más pequeña
    'mupen64plus-astick-deadzone': '0',
  },
}

/** Núcleos que dibujan ellos mismos con WebGL 2 (v0.32.0): la imagen está en su lienzo */
const CON_WEBGL: Partial<Record<NombreNucleo, { ancho: number; alto: number }>> = { n64: { ancho: 640, alto: 480 } }

/** Bits de los botones C de Nintendo 64 (ver `BOTON` en botones.ts): van a la palanca derecha */
const C_ARRIBA = 1 << 16
const C_ABAJO = 1 << 17
const C_IZQUIERDA = 1 << 18
const C_DERECHA = 1 << 19
const PALANCA_MAX = 0x7fff

/**
 * Botones de la app a los del núcleo de Nintendo 64: su A es la B de libretro y su B, la Y. Los botones
 * C ya han ido a la palanca derecha y no pasan.
 */
export function aN64(mascara: number): number {
  const A = 1 << 8
  const B = 1 << 0
  const Y = 1 << 1
  const resto = mascara & 0xffff & ~(A | B | Y)
  return resto | (mascara & A ? B : 0) | (mascara & B ? Y : 0)
}

/**
 * Funciones del núcleo donde ha fallado, de la más interna a la de fuera, a partir de la pila del error
 * original (v0.32.1). Solo nombres de funciones del núcleo: nada del juego. Admite el formato de Safari
 * («nombre@…wasm…» o «wasm-function[nombre]») y el de Chrome («at n64.wasm.nombre (…)»).
 */
export function funcionesDelFallo(pila: string, maximo = 10): string[] {
  const nombres: string[] = []
  for (const linea of pila.split('\n')) {
    if (!/wasm/.test(linea)) continue
    // Por orden: Chrome, nombre delante de la @ (Safari) y, si no hay nombre, el número de la función
    const m = /\.wasm\.([^\s(]+)/.exec(linea) ?? /^\s*([^@\s]+)@/.exec(linea) ?? /wasm-function\[([^\]]+)\]/.exec(linea)
    if (!m) continue
    const nombre = m[1].replace(/\(.*$/, '').slice(0, 60)
    if (nombres[nombres.length - 1] !== nombre) nombres.push(nombre)
    if (nombres.length >= maximo) break
  }
  return nombres
}

export class Nucleo {
  private readonly m: Modulo
  readonly nombre: NombreNucleo
  /** Lienzo donde dibuja el núcleo con WebGL (Nintendo 64); null en los demás */
  readonly lienzoGL: OffscreenCanvas | null

  private constructor(m: Modulo, nombre: NombreNucleo, lienzoGL: OffscreenCanvas | null) {
    this.m = m
    this.nombre = nombre
    this.lienzoGL = lienzoGL
  }

  /**
   * Resultado de la última llamada al puente. En Nintendo 64, el núcleo va en corrutinas (fibras de
   * Asyncify) y lo que devuelve una función que cambia de corrutina por el camino no es fiable.
   */
  private resultado(devuelto: number): number {
    return this.m._pf_resultado ? this.m._pf_resultado() : devuelto
  }

  /** Llama al núcleo; si falla, el error lleva las funciones donde ha ocurrido (v0.32.1). */
  private llamar<T>(f: () => T): T {
    try {
      return f()
    } catch (e) {
      const original = this.m.errorOriginal as { stack?: string } | undefined
      const funciones = original?.stack ? funcionesDelFallo(original.stack) : []
      if (!funciones.length) throw e
      throw new Error(`${(e as Error)?.message ?? String(e)} | en: ${funciones.join(' < ')}`)
    }
  }

  static async cargar(nombre: NombreNucleo, extra: Record<string, string> = {}): Promise<Nucleo> {
    const raiz = raizNucleos()
    const { crear, modulo } = await prepararNucleo(nombre)
    let fallo: (e: unknown) => void = () => undefined
    const fallado = new Promise<never>((_, rechazar) => (fallo = rechazar))
    const creado = crear({
      locateFile: (ruta) => `${raiz}${ruta}`,
      print: () => undefined,
      printErr: (t) => console.warn(t),
      // Con el módulo ya compilado, solo queda crear la instancia (memoria propia para cada juego)
      instantiateWasm: (imports, exito) => {
        WebAssembly.instantiate(modulo, imports).then((instancia) => exito(instancia, modulo), fallo)
        return {}
      },
    })
    // Si la instancia falla, Emscripten no se entera: sin esto, la carga se quedaría esperando
    const m = await Promise.race([creado, fallado])
    // El núcleo de Nintendo 64 dibuja con WebGL 2 en este lienzo (el puente lo busca como «!lienzo»)
    const gl = CON_WEBGL[nombre]
    let lienzoGL: OffscreenCanvas | null = null
    if (gl) {
      if (typeof OffscreenCanvas === 'undefined' || !m.specialHTMLTargets) throw new Error('Este aparato no puede dibujar la Nintendo 64 (sin OffscreenCanvas).')
      lienzoGL = new OffscreenCanvas(gl.ancho, gl.alto)
      m.specialHTMLTargets['!lienzo'] = lienzoGL
    }
    m._pf_iniciar()
    const n = new Nucleo(m, nombre, lienzoGL)
    for (const [k, v] of Object.entries({ ...OPCIONES[nombre], ...extra })) n.opcion(k, v)
    return n
  }

  private texto(s: string): number {
    return this.m.stringToNewUTF8(s)
  }

  opcion(clave: string, valor: string): void {
    const k = this.texto(clave)
    const v = this.texto(valor)
    this.m._pf_opcion(k, v)
    this.m._free(k)
    this.m._free(v)
  }

  /** Carga el juego. La partida se pasa aquí porque algunos núcleos la leen de un fichero al cargar. */
  cargarJuego(rom: Uint8Array, extension: string, partida?: { datos: Uint8Array; rtc?: Uint8Array }): boolean {
    const fichero = PARTIDA_EN_FICHERO[this.nombre]
    if (fichero && this.m.FS) {
      this.m.FS.mkdirTree(fichero.slice(0, fichero.lastIndexOf('/')))
      if (partida) this.m.FS.writeFile(fichero, partida.datos)
    }
    const p = this.m._malloc(rom.byteLength)
    this.m.HEAPU8.set(rom, p)
    const ext = this.texto(extension)
    // El puente libera la copia de la ROM cuando el núcleo ya tiene la suya
    const ok = this.llamar(() => this.resultado(this.m._pf_cargar(p, rom.byteLength, ext))) === 1
    this.m._free(ext)
    return ok
  }

  descargar(): void {
    this.m._pf_descargar()
  }

  reiniciar(): void {
    this.llamar(() => this.m._pf_reiniciar())
  }

  botones(mascara: number): void {
    const c = mascara & (C_ARRIBA | C_ABAJO | C_IZQUIERDA | C_DERECHA)
    // Solo cuando cambian: al soltarlos, la palanca vuelve al centro
    if (this.m._pf_analogico && c !== this.cAntes) {
      // Botones C de Nintendo 64: la palanca derecha, a tope hacia cada lado
      const x = mascara & C_IZQUIERDA ? -PALANCA_MAX : mascara & C_DERECHA ? PALANCA_MAX : 0
      const y = mascara & C_ARRIBA ? -PALANCA_MAX : mascara & C_ABAJO ? PALANCA_MAX : 0
      this.m._pf_analogico(1, x, y)
      this.cAntes = c
    }
    this.m._pf_botones(this.nombre === 'n64' ? aN64(mascara) : mascara)
  }

  private cAntes = 0

  /** Palanca izquierda (Nintendo 64), de -1 a 1 en cada eje; y hacia abajo es positivo. */
  palanca(x: number, y: number): void {
    const a = (v: number) => Math.max(-PALANCA_MAX, Math.min(PALANCA_MAX, Math.round(v * PALANCA_MAX)))
    this.m._pf_analogico?.(0, a(x), a(y))
  }

  /** La imagen del último fotograma está en `lienzoGL` y no en la memoria del núcleo. */
  get imagenGL(): boolean {
    return !!this.lienzoGL && this.m._pf_imagen_gl?.() === 1
  }

  /** Toque en la imagen (Nintendo DS): x e y de 0 a 1 sobre todo el fotograma, o null al soltar. */
  puntero(x: number | null, y = 0): void {
    if (x === null) {
      this.m._pf_puntero(0, 0, 0)
      return
    }
    const a = (v: number) => Math.max(-0x8000, Math.min(0x7fff, Math.round(v * 0x10000 - 0x8000)))
    this.m._pf_puntero(a(x), a(y), 1)
  }

  /** Ejecuta un fotograma; true si hay imagen nueva. */
  fotograma(): boolean {
    return this.llamar(() => this.resultado(this.m._pf_fotograma())) === 1
  }

  get fps(): number {
    return this.m._pf_fps()
  }

  get frecuenciaAudio(): number {
    return this.m._pf_frecuencia()
  }

  get proporcion(): number {
    const p = this.m._pf_proporcion()
    return p > 0 ? p : this.m._pf_base_ancho() / this.m._pf_base_alto()
  }

  avCambiado(): boolean {
    return this.m._pf_av_cambiado() === 1
  }

  /** Fotograma en RGBA. Es una vista sobre la memoria del núcleo: se copia antes del siguiente. */
  video(): { datos: Uint8Array; ancho: number; alto: number } | null {
    if (this.lienzoGL) return null
    const ancho = this.m._pf_video_ancho()
    const alto = this.m._pf_video_alto()
    const p = this.m._pf_video()
    if (!p || !ancho || !alto) return null
    return { datos: this.m.HEAPU8.subarray(p, p + ancho * alto * 4), ancho, alto }
  }

  /** Muestras del último fotograma, estéreo intercaladas. Vista sobre la memoria del núcleo. */
  audio(): Int16Array {
    const n = this.m._pf_audio_muestras()
    const p = this.m._pf_audio()
    return new Int16Array(this.m.HEAPU8.buffer, p, n * 2)
  }

  private memoria(id: number): Uint8Array | null {
    const tam = this.m._pf_memoria_tam(id)
    const p = this.m._pf_memoria(id)
    if (!p || !tam) return null
    return this.m.HEAPU8.subarray(p, p + tam)
  }

  /** Copia de la partida guardada (y del reloj del cartucho, si lo tiene). */
  leerPartida(): { datos: Uint8Array; rtc?: Uint8Array } | null {
    const fichero = PARTIDA_EN_FICHERO[this.nombre]
    if (fichero) {
      try {
        if (!this.m.FS?.analyzePath(fichero).exists) return null
        return { datos: this.m.FS.readFile(fichero).slice() }
      } catch {
        return null
      }
    }
    const datos = this.memoria(MEMORIA_PARTIDA)
    if (!datos) return null
    const rtc = this.memoria(MEMORIA_RELOJ)
    return { datos: datos.slice(), rtc: rtc?.slice() }
  }

  /** Escribe la partida guardada. Hay que llamarlo después de cargar el juego y antes del primer fotograma. */
  escribirPartida(datos: Uint8Array, rtc?: Uint8Array): void {
    if (PARTIDA_EN_FICHERO[this.nombre]) return // ya se dejó en el fichero al cargar
    const destino = this.memoria(MEMORIA_PARTIDA)
    if (destino) destino.set(datos.subarray(0, destino.length))
    const reloj = this.memoria(MEMORIA_RELOJ)
    if (reloj && rtc) reloj.set(rtc.subarray(0, reloj.length))
  }

  guardarEstado(): Uint8Array | null {
    const tam = this.m._pf_estado_tam()
    if (!tam) return null
    const p = this.m._malloc(tam)
    try {
      if (this.llamar(() => this.resultado(this.m._pf_guardar_estado(p, tam))) !== 1) return null
      return this.m.HEAPU8.slice(p, p + tam)
    } finally {
      this.m._free(p)
    }
  }

  cargarEstado(datos: Uint8Array): boolean {
    const p = this.m._malloc(datos.byteLength)
    try {
      this.m.HEAPU8.set(datos, p)
      return this.llamar(() => this.resultado(this.m._pf_cargar_estado(p, datos.byteLength))) === 1
    } finally {
      this.m._free(p)
    }
  }
}
