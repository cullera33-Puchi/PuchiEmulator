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
  FS?: {
    mkdirTree(ruta: string): void
    writeFile(ruta: string, datos: Uint8Array): void
    readFile(ruta: string): Uint8Array
    analyzePath(ruta: string): { exists: boolean }
  }
}

type Fabrica = (opciones: { locateFile: (ruta: string) => string; print?: (t: string) => void; printErr?: (t: string) => void }) => Promise<Modulo>

const MEMORIA_PARTIDA = 0
const MEMORIA_RELOJ = 1

/**
 * Núcleos que guardan la partida en un fichero en lugar de en memoria (melonDS): la app lo deja ahí
 * antes de arrancar y lo lee después. El nombre sale de la ruta que el puente da al juego.
 */
const PARTIDA_EN_FICHERO: Partial<Record<NombreNucleo, string>> = { melonds: '/sistema/juego.sav' }

/** Opciones fijas de cada núcleo. */
const OPCIONES: Record<NombreNucleo, Record<string, string>> = {
  mgba: {
    mgba_sgb_borders: 'OFF',
    mgba_skip_bios: 'ON',
    mgba_use_bios: 'OFF',
    mgba_gb_model: 'Autodetect',
    mgba_idle_optimization: 'Remove Known',
    mgba_frameskip: 'disabled',
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
  },
}

export class Nucleo {
  private readonly m: Modulo
  readonly nombre: NombreNucleo

  private constructor(m: Modulo, nombre: NombreNucleo) {
    this.m = m
    this.nombre = nombre
  }

  static async cargar(nombre: NombreNucleo, extra: Record<string, string> = {}): Promise<Nucleo> {
    const raiz = `${import.meta.env.BASE_URL}nucleos/`
    const { default: crear } = (await import(/* @vite-ignore */ `${raiz}${nombre}.js`)) as { default: Fabrica }
    const m = await crear({
      locateFile: (ruta) => `${raiz}${ruta}`,
      print: () => undefined,
      printErr: (t) => console.warn(t),
    })
    m._pf_iniciar()
    const n = new Nucleo(m, nombre)
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
    const ok = this.m._pf_cargar(p, rom.byteLength, ext) === 1
    this.m._free(ext)
    return ok
  }

  descargar(): void {
    this.m._pf_descargar()
  }

  reiniciar(): void {
    this.m._pf_reiniciar()
  }

  botones(mascara: number): void {
    this.m._pf_botones(mascara)
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
    return this.m._pf_fotograma() === 1
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
      if (this.m._pf_guardar_estado(p, tam) !== 1) return null
      return this.m.HEAPU8.slice(p, p + tam)
    } finally {
      this.m._free(p)
    }
  }

  cargarEstado(datos: Uint8Array): boolean {
    const p = this.m._malloc(datos.byteLength)
    try {
      this.m.HEAPU8.set(datos, p)
      return this.m._pf_cargar_estado(p, datos.byteLength) === 1
    } finally {
      this.m._free(p)
    }
  }
}
