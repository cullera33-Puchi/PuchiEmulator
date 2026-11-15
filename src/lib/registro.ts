/**
 * Registro para depurar desde el iPhone (guía de usabilidad, apartado 11). El usuario lo copia en
 * Ajustes y lo pega en el chat. 400 entradas como máximo, en localStorage.
 * Nunca se anotan nombres de juegos ni contenido de partidas: solo recuentos y lo que pasó.
 */
import { APP_VERSION } from './version'

export type Nivel = 'info' | 'aviso' | 'error'

export interface Entrada {
  t: string
  l: Nivel
  m: string
  x?: string
}

const CLAVE = 'puchiemulator-registro'
const MAXIMO = 400
let entradas: Entrada[] = leer()
const oyentes = new Set<() => void>()
const ultimas = new Map<string, number>()

function leer(): Entrada[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function escribir(): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(entradas))
  } catch {
    // Almacenamiento lleno: se recorta y se reintenta una vez
    entradas = entradas.slice(-50)
    try {
      localStorage.setItem(CLAVE, JSON.stringify(entradas))
    } catch {
      // sin registro persistente
    }
  }
  oyentes.forEach((f) => f())
}

export function registrar(nivel: Nivel, mensaje: string, detalle?: unknown): void {
  // El mismo aviso, como mucho una vez por minuto
  const clave = `${nivel}|${mensaje}`
  const ahora = Date.now()
  if (nivel !== 'info' && ahora - (ultimas.get(clave) ?? 0) < 60_000) return
  ultimas.set(clave, ahora)
  const e: Entrada = { t: new Date(ahora).toISOString(), l: nivel, m: String(mensaje) }
  if (detalle !== undefined) {
    try {
      e.x = typeof detalle === 'string' ? detalle : JSON.stringify(detalle)
    } catch {
      e.x = String(detalle)
    }
  }
  entradas.push(e)
  if (entradas.length > MAXIMO) entradas = entradas.slice(-MAXIMO)
  escribir()
}

export function leerRegistro(): Entrada[] {
  return entradas
}

export function suscribirRegistro(f: () => void): () => void {
  oyentes.add(f)
  return () => oyentes.delete(f)
}

/** Borra el registro y devuelve una función para deshacerlo. */
export function borrarRegistro(): () => void {
  const antes = entradas
  entradas = []
  escribir()
  return () => {
    entradas = antes.concat(entradas).slice(-MAXIMO)
    escribir()
  }
}

export function modoApp(): 'instalada' | 'navegador' {
  try {
    if ((navigator as Navigator & { standalone?: boolean }).standalone || matchMedia('(display-mode: standalone)').matches) return 'instalada'
  } catch {
    // sin matchMedia
  }
  return 'navegador'
}

export function textoRegistro(recuentos = ''): string {
  const cabecera = `PuchiEmulator v${APP_VERSION} | ${modoApp()} | ${navigator.userAgent} | ${new Date().toString()}${recuentos ? ` | ${recuentos}` : ''}`
  const lineas = entradas.map((e) => `${e.t.replace('T', ' ').slice(5, 19)} [${e.l}] ${e.m}${e.x ? ` | ${e.x}` : ''}`)
  return `${cabecera}\n${lineas.length ? lineas.join('\n') : '(sin entradas)'}`
}

/** Errores no controlados, promesas rechazadas y console.error van al registro. */
export function capturarErrores(): void {
  window.addEventListener('error', (e) =>
    registrar('error', e.message || 'Error', `${(e.filename || '').split('/').pop()}:${e.lineno}:${e.colno}${e.error?.stack ? `\n${e.error.stack}` : ''}`),
  )
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as Error | undefined
    registrar('error', `Promesa rechazada: ${r?.message ?? String(e.reason)}`, r?.stack)
  })
  const original = console.error.bind(console)
  console.error = (...a: unknown[]) => {
    registrar('error', a.map((x) => (x as Error)?.message ?? String(x)).join(' '))
    original(...a)
  }
}

/** Copia al portapapeles, con el respaldo que necesita iOS. */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = texto
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px;'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, texto.length)
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    ta.remove()
    return ok
  }
}
