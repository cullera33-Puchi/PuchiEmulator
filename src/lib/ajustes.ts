/**
 * Preferencias del usuario. Son comodidades de este iPhone, así que van en localStorage; si no
 * está disponible, la app funciona con los valores por defecto.
 */
import { useSyncExternalStore } from 'react'
import type { Sistema } from './sistemas'
import type { IdTema, PaletaGb } from './temas'
import type { MandoGuardado } from './mandoJuego'
import type { OrdenBiblioteca } from './biblioteca'
import type { PantallasDS } from '../emulador/pantallasDS'

export interface Ajustes {
  sonido: boolean
  /** Suena aunque el interruptor de silencio del iPhone esté activado */
  sonarEnSilencio: boolean
  /** Píxeles nítidos (true) o imagen suavizada */
  nitido: boolean
  /** Colores como en la pantalla de la consola (corrección de color de mGBA en GBA y Color) */
  coloresConsola: boolean
  /** Opacidad de los botones en horizontal, de 0,2 a 1 */
  opacidadMando: number
  tema: 'auto' | 'claro' | 'oscuro'
  /** Vibración breve al pulsar los botones del mando */
  vibracion: boolean
  /** Modo noche en el juego (v0.16.0): imagen y botones más oscuros y cálidos, sin vibración */
  modoNoche: boolean
  intensidadNoche: IntensidadNoche
  /** Pausar y guardar tras estos minutos sin tocar nada (0: nunca), v0.19.0 */
  pausaSinTocar: 0 | 3 | 5 | 10
  /** Hoja de bienvenida ya vista */
  bienvenidaVista: boolean
  /** Tema de la pantalla de juego por consola («auto»: el de esa consola) */
  temas: Partial<Record<Sistema, IdTema | 'auto'>>
  /** Colores de la pantalla en los juegos de Game Boy sin color */
  paletaGb: PaletaGb
  /** Tamaño de los botones del mando: 0,8, 1, 1,15 o 1,3 */
  escalaMando: number
  /** Distribución del mando en vertical */
  modoMando: 'dos-manos' | 'una-mano'
  /** Mano del modo una mano */
  mano: 'derecha' | 'izquierda'
  /** Buscar y poner la carátula al añadir un juego, si el nombre coincide con seguridad */
  caratulasAuto: boolean
  /** Pantalla del juego lo más grande posible: sin margen ni marco */
  pantallaGrande: boolean
  /** Imagen de Super Nintendo: como en la televisión (4:3) o píxel exacto (8:7) */
  snesAspecto: 'tv' | 'pixel'
  /** Filtro de imagen (v0.15.0): ninguno, el de la consola (rejilla en las portátiles, líneas en la tele), rejilla LCD o líneas de TV */
  filtro: 'ninguno' | 'consola' | 'lcd' | 'tv'
  /** Pantallas de Nintendo DS (v0.17.0): apiladas, libro (táctil a la derecha o a la izquierda) o grande y pequeña */
  pantallasDS: PantallasDS
  /** Tamaño de la miniatura en «grande y pequeña» (v0.20.0) */
  tamanoMiniDS: 'pequena' | 'mediana' | 'grande'
  /** Mando de cada juego (modo JRPG y ajustes propios de pantalla y botones), por identificador del juego */
  mandos: Record<string, MandoGuardado>
  /** Orden de la biblioteca: último jugado, nombre o tiempo jugado */
  ordenBiblioteca: OrdenBiblioteca
  /** Última copia de partidas guardada fuera del iPhone (compartida o descargada) */
  ultimaCopia?: number
  /** «Más tarde» en el aviso de la copia: no se vuelve a avisar hasta esta fecha */
  copiaAplazada?: number
}

export type IntensidadNoche = 'suave' | 'media' | 'fuerte'

/**
 * Color con el que se multiplica la pantalla del juego en el modo noche: oscurece (como un brillo
 * por debajo del mínimo del iPhone) y quita azul (más cálido) a la vez, con una sola capa.
 */
export const COLOR_NOCHE: Record<IntensidadNoche, string> = {
  suave: 'rgb(191 161 128)',
  media: 'rgb(140 107 77)',
  fuerte: 'rgb(97 68 46)',
}

/** Vibrar al pulsar: si está activado y no es de noche (para no molestar a quien duerme al lado). */
export function vibracionActiva(a: Ajustes = actuales): boolean {
  return a.vibracion && !a.modoNoche
}

export const POR_DEFECTO: Ajustes = {
  sonido: true,
  sonarEnSilencio: false,
  nitido: true,
  coloresConsola: true,
  opacidadMando: 0.6,
  tema: 'auto',
  vibracion: true,
  modoNoche: false,
  intensidadNoche: 'media',
  pausaSinTocar: 10,
  bienvenidaVista: false,
  temas: {},
  paletaGb: 'auto',
  escalaMando: 1,
  modoMando: 'dos-manos',
  mano: 'derecha',
  caratulasAuto: true,
  pantallaGrande: true,
  snesAspecto: 'tv',
  filtro: 'ninguno',
  pantallasDS: 'apiladas',
  tamanoMiniDS: 'mediana',
  mandos: {},
  ordenBiblioteca: 'reciente',
}

const CLAVE = 'puchiemulator-ajustes'
let actuales: Ajustes = cargar()
const oyentes = new Set<() => void>()

function cargar(): Ajustes {
  try {
    const t = localStorage.getItem(CLAVE)
    if (t) return { ...POR_DEFECTO, ...(JSON.parse(t) as Partial<Ajustes>) }
  } catch {
    // sin almacenamiento
  }
  return { ...POR_DEFECTO }
}

export function leerAjustes(): Ajustes {
  return actuales
}

export function cambiarAjustes(cambio: Partial<Ajustes>): void {
  actuales = { ...actuales, ...cambio }
  try {
    localStorage.setItem(CLAVE, JSON.stringify(actuales))
  } catch {
    // sin almacenamiento: vale para esta sesión
  }
  oyentes.forEach((f) => f())
}

export function useAjustes(): Ajustes {
  return useSyncExternalStore(
    (f) => {
      oyentes.add(f)
      return () => oyentes.delete(f)
    },
    () => actuales,
  )
}

export function aplicarTema(tema = actuales.tema): void {
  let oscuro = tema === 'oscuro'
  if (tema === 'auto') {
    try {
      oscuro = matchMedia('(prefers-color-scheme: dark)').matches
    } catch {
      oscuro = false
    }
  }
  document.documentElement.dataset.theme = oscuro ? 'dark' : 'light'
  // La barra de estado y el fondo de Safari siguen al tema elegido (guía 2.1)
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', oscuro ? '#000000' : '#F2F2F7'))
}
