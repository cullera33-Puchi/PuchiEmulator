/**
 * Estadísticas de juego a partir de las sesiones guardadas (almacén «sesiones»). Funciones puras:
 * el tiempo de una sesión se reparte entre los días y las horas que abarca, en proporción.
 */
import type { Sistema } from './sistemas'

export interface SesionJuego {
  id?: number
  juegoId: string
  /** Nombre y consola en el momento de jugar: sirven aunque el juego se quite de la biblioteca */
  nombre: string
  sistema: Sistema
  inicio: number
  fin: number
  /** Tiempo jugado de verdad (sin pausas ni inactividad), en ms */
  ms: number
}

export type Periodo = 'semana' | 'mes' | 'ano' | 'siempre'

const MIN = 60_000
const HORA = 60 * MIN

/** «45 s», «12 min», «3 h 05 min», «128 h». */
export function duracion(ms: number): string {
  if (ms < MIN) return `${Math.max(0, Math.round(ms / 1000))} s`
  const minutos = Math.floor(ms / MIN)
  if (minutos < 60) return `${minutos} min`
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  if (h >= 100) return `${h} h`
  return m ? `${h} h ${String(m).padStart(2, '0')} min` : `${h} h`
}

/** Versión corta para ejes y fichas: «45 s», «12 min», «3,5 h». */
export function duracionCorta(ms: number): string {
  if (ms < MIN) return `${Math.round(ms / 1000)} s`
  if (ms < HORA) return `${Math.round(ms / MIN)} min`
  const h = ms / HORA
  return `${h.toLocaleString('es-ES', { maximumFractionDigits: h < 10 ? 1 : 0 })} h`
}

export function claveDia(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function inicioDia(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function sumarDias(t: number, n: number): number {
  const d = new Date(t)
  d.setDate(d.getDate() + n)
  return d.getTime()
}

/**
 * Reparte el tiempo jugado de una sesión entre los tramos que cruza (días u horas), en proporción
 * a lo que dura en cada uno.
 */
export function repartir(s: SesionJuego, siguiente: (t: number) => number, clave: (t: number) => string): Map<string, number> {
  const r = new Map<string, number>()
  const total = Math.max(1, s.fin - s.inicio)
  let t = s.inicio
  if (s.fin <= s.inicio) {
    r.set(clave(s.inicio), s.ms)
    return r
  }
  while (t < s.fin) {
    const corte = Math.min(siguiente(t), s.fin)
    const parte = (s.ms * (corte - t)) / total
    r.set(clave(t), (r.get(clave(t)) ?? 0) + parte)
    t = corte
  }
  return r
}

const siguienteDia = (t: number) => sumarDias(inicioDia(t), 1)
const siguienteHora = (t: number) => {
  const d = new Date(t)
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return d.getTime()
}

/** Tiempo por día (clave AAAA-MM-DD). */
export function porDia(sesiones: SesionJuego[]): Map<string, number> {
  const r = new Map<string, number>()
  for (const s of sesiones) for (const [k, v] of repartir(s, siguienteDia, claveDia)) r.set(k, (r.get(k) ?? 0) + v)
  return r
}

/** Tiempo por hora del día (0 a 23). */
export function porHora(sesiones: SesionJuego[]): number[] {
  const r = new Array<number>(24).fill(0)
  for (const s of sesiones) for (const [k, v] of repartir(s, siguienteHora, (t) => String(new Date(t).getHours()))) r[Number(k)] += v
  return r
}

/** Desde cuándo cuenta un periodo (inclusive), con «ahora» como referencia. */
export function desde(periodo: Periodo, ahora: number): number {
  const hoy = inicioDia(ahora)
  if (periodo === 'semana') return sumarDias(hoy, -6)
  if (periodo === 'mes') return sumarDias(hoy, -29)
  if (periodo === 'ano') {
    const d = new Date(hoy)
    d.setDate(1)
    d.setMonth(d.getMonth() - 11)
    return d.getTime()
  }
  return 0
}

/** Las sesiones del periodo, recortadas a su inicio (una sesión que empezó antes cuenta en parte). */
export function delPeriodo(sesiones: SesionJuego[], periodo: Periodo, ahora: number): SesionJuego[] {
  const d = desde(periodo, ahora)
  if (!d) return sesiones
  const r: SesionJuego[] = []
  for (const s of sesiones) {
    if (s.fin < d) continue
    if (s.inicio >= d) r.push(s)
    else r.push({ ...s, inicio: d, ms: (s.ms * (s.fin - d)) / Math.max(1, s.fin - s.inicio) })
  }
  return r
}

export interface Columna {
  clave: string
  etiqueta: string
  /** Texto largo para el detalle al tocarla: «miércoles 12 nov.» */
  titulo: string
  ms: number
}

const DIAS_CORTOS = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

/** Columnas del gráfico: días (semana y mes) o meses (año y siempre). */
export function columnas(sesiones: SesionJuego[], periodo: Periodo, ahora: number): Columna[] {
  const dias = porDia(sesiones)
  if (periodo === 'semana' || periodo === 'mes') {
    const n = periodo === 'semana' ? 7 : 30
    const hoy = inicioDia(ahora)
    const r: Columna[] = []
    for (let i = n - 1; i >= 0; i--) {
      const t = sumarDias(hoy, -i)
      const d = new Date(t)
      r.push({
        clave: claveDia(t),
        etiqueta: periodo === 'semana' ? DIAS_CORTOS[d.getDay()] : String(d.getDate()),
        titulo: d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' }),
        ms: dias.get(claveDia(t)) ?? 0,
      })
    }
    return r
  }
  // Meses: los 12 últimos o, en «siempre», desde el primero con partidas (como mucho 24)
  const meses = new Map<string, number>()
  for (const [k, v] of dias) meses.set(k.slice(0, 7), (meses.get(k.slice(0, 7)) ?? 0) + v)
  const fin = new Date(ahora)
  fin.setDate(1)
  let n = 12
  if (periodo === 'siempre' && sesiones.length) {
    const primero = new Date(Math.min(...sesiones.map((s) => s.inicio)))
    n = Math.min(24, Math.max(1, (fin.getFullYear() - primero.getFullYear()) * 12 + fin.getMonth() - primero.getMonth() + 1))
  }
  const r: Columna[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(fin.getFullYear(), fin.getMonth() - i, 1)
    const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const mes = d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')
    r.push({ clave, etiqueta: mes.charAt(0).toUpperCase(), titulo: d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }), ms: meses.get(clave) ?? 0 })
  }
  return r
}

export interface FilaJuego {
  juegoId: string
  nombre: string
  sistema: Sistema
  ms: number
  sesiones: number
  ultima: number
}

/** Juegos ordenados por tiempo jugado. */
export function porJuego(sesiones: SesionJuego[]): FilaJuego[] {
  const m = new Map<string, FilaJuego>()
  for (const s of sesiones) {
    const f = m.get(s.juegoId) ?? { juegoId: s.juegoId, nombre: s.nombre, sistema: s.sistema, ms: 0, sesiones: 0, ultima: 0 }
    f.ms += s.ms
    f.sesiones++
    if (s.fin > f.ultima) {
      f.ultima = s.fin
      f.nombre = s.nombre
    }
    m.set(s.juegoId, f)
  }
  return [...m.values()].sort((a, b) => b.ms - a.ms)
}

export function porConsola(sesiones: SesionJuego[]): Map<Sistema, number> {
  const r = new Map<Sistema, number>()
  for (const s of sesiones) r.set(s.sistema, (r.get(s.sistema) ?? 0) + s.ms)
  return r
}

/** Días seguidos jugando (al menos un minuto), hasta hoy o hasta ayer si hoy aún no se ha jugado. */
export function racha(sesiones: SesionJuego[], ahora: number): { actual: number; mejor: number } {
  const dias = porDia(sesiones)
  const jugados = new Set([...dias].filter(([, v]) => v >= MIN).map(([k]) => k))
  let actual = 0
  let t = inicioDia(ahora)
  if (!jugados.has(claveDia(t))) t = sumarDias(t, -1)
  while (jugados.has(claveDia(t))) {
    actual++
    t = sumarDias(t, -1)
  }
  let mejor = 0
  for (const k of jugados) {
    const [a, mes, d] = k.split('-').map(Number)
    const anterior = claveDia(sumarDias(new Date(a, mes - 1, d).getTime(), -1))
    if (jugados.has(anterior)) continue
    let n = 0
    let c = new Date(a, mes - 1, d).getTime()
    while (jugados.has(claveDia(c))) {
      n++
      c = sumarDias(c, 1)
    }
    mejor = Math.max(mejor, n)
  }
  return { actual, mejor: Math.max(mejor, actual) }
}

export interface Records {
  sesionMasLarga: SesionJuego | null
  mejorDia: { clave: string; ms: number } | null
}

export function records(sesiones: SesionJuego[]): Records {
  let larga: SesionJuego | null = null
  for (const s of sesiones) if (!larga || s.ms > larga.ms) larga = s
  let mejor: { clave: string; ms: number } | null = null
  for (const [clave, ms] of porDia(sesiones)) if (!mejor || ms > mejor.ms) mejor = { clave, ms }
  return { sesionMasLarga: larga, mejorDia: mejor }
}

export function total(sesiones: SesionJuego[]): number {
  return sesiones.reduce((a, s) => a + s.ms, 0)
}

/** Franja del día en la que más se juega. */
export function franjaFavorita(horas: number[]): string | null {
  const franjas: [string, number[]][] = [
    ['por la mañana', [6, 7, 8, 9, 10, 11]],
    ['a mediodía', [12, 13, 14, 15]],
    ['por la tarde', [16, 17, 18, 19, 20]],
    ['por la noche', [21, 22, 23, 0, 1, 2, 3, 4, 5]],
  ]
  let mejor: [string, number] | null = null
  for (const [nombre, hs] of franjas) {
    const v = hs.reduce((a, h) => a + horas[h], 0)
    if (v > 0 && (!mejor || v > mejor[1])) mejor = [nombre, v]
  }
  return mejor?.[0] ?? null
}
