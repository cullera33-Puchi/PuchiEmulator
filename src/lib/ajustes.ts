/**
 * Preferencias del usuario. Son comodidades de este iPhone, así que van en localStorage; si no
 * está disponible, la app funciona con los valores por defecto.
 */
import { useSyncExternalStore } from 'react'
import type { Sistema } from './sistemas'
import type { IdTema, PaletaGb } from './temas'

export interface Ajustes {
  sonido: boolean
  /** Suena aunque el interruptor de silencio del iPhone esté activado */
  sonarEnSilencio: boolean
  /** Píxeles nítidos (true) o imagen suavizada */
  nitido: boolean
  /** Opacidad de los botones en horizontal, de 0,2 a 1 */
  opacidadMando: number
  tema: 'auto' | 'claro' | 'oscuro'
  /** Vibración breve al pulsar los botones del mando */
  vibracion: boolean
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
}

export const POR_DEFECTO: Ajustes = {
  sonido: true,
  sonarEnSilencio: false,
  nitido: true,
  opacidadMando: 0.6,
  tema: 'auto',
  vibracion: true,
  bienvenidaVista: false,
  temas: {},
  paletaGb: 'auto',
  escalaMando: 1,
  modoMando: 'dos-manos',
  mano: 'derecha',
  caratulasAuto: true,
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
