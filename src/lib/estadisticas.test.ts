import { describe, expect, it } from 'vitest'
import { columnas, delPeriodo, duracion, duracionCorta, franjaFavorita, porConsola, porDia, porHora, porJuego, racha, records, total, type SesionJuego } from './estadisticas'

const t = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime()
const MIN = 60_000

function sesion(juegoId: string, inicio: number, minutos: number, extra: Partial<SesionJuego> = {}): SesionJuego {
  return { juegoId, nombre: juegoId.toUpperCase(), sistema: 'gba', inicio, fin: inicio + minutos * MIN, ms: minutos * MIN, ...extra }
}

const AHORA = t(15, 21)

describe('duración', () => {
  it('formatos', () => {
    expect(duracion(45_000)).toBe('45 s')
    expect(duracion(12 * MIN)).toBe('12 min')
    expect(duracion(185 * MIN)).toBe('3 h 05 min')
    expect(duracion(120 * MIN)).toBe('2 h')
    expect(duracion(130 * 60 * MIN)).toBe('130 h')
    expect(duracionCorta(90 * MIN)).toBe('1,5 h')
  })
})

describe('reparto por días y horas', () => {
  it('una sesión que cruza la medianoche se reparte entre los dos días', () => {
    const d = porDia([sesion('a', t(14, 23, 30), 60)])
    expect(d.get('2026-11-14')).toBeCloseTo(30 * MIN)
    expect(d.get('2026-11-15')).toBeCloseTo(30 * MIN)
  })

  it('el tiempo pausado se reparte en proporción, sin inflar el total', () => {
    const s = sesion('a', t(15, 10), 60, { ms: 30 * MIN }) // una hora abierta, media jugada
    const h = porHora([s])
    expect(h[10]).toBeCloseTo(30 * MIN)
    expect(total([s])).toBe(30 * MIN)
  })

  it('por hora', () => {
    const h = porHora([sesion('a', t(15, 21, 30), 60)])
    expect(h[21]).toBeCloseTo(30 * MIN)
    expect(h[22]).toBeCloseTo(30 * MIN)
    expect(franjaFavorita(h)).toBe('por la noche')
  })
})

describe('periodos y columnas', () => {
  const sesiones = [sesion('a', t(15, 10), 30), sesion('b', t(9, 10), 60), sesion('a', t(1, 10), 90)]

  it('la semana son los 7 últimos días con hoy incluido', () => {
    const cols = columnas(sesiones, 'semana', AHORA)
    expect(cols).toHaveLength(7)
    expect(cols.at(-1)).toMatchObject({ clave: '2026-11-15', etiqueta: 'D', ms: 30 * MIN })
    expect(cols[0].clave).toBe('2026-11-09')
    expect(cols[0].ms).toBe(60 * MIN)
    expect(total(delPeriodo(sesiones, 'semana', AHORA))).toBe(90 * MIN)
  })

  it('el año va por meses y siempre empieza en el primer mes con partidas', () => {
    expect(columnas(sesiones, 'ano', AHORA)).toHaveLength(12)
    const siempre = columnas([...sesiones, sesion('c', new Date(2026, 7, 20, 10).getTime(), 10)], 'siempre', AHORA)
    expect(siempre.map((c) => c.clave)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11'])
    expect(siempre.at(-1)!.ms).toBe(180 * MIN)
  })

  it('una sesión que empezó antes del periodo cuenta solo en parte', () => {
    const s = sesion('a', t(8, 23), 120) // de 23:00 del 8 a 01:00 del 9
    expect(total(delPeriodo([s], 'semana', AHORA))).toBeCloseTo(60 * MIN)
  })
})

describe('juegos, consolas, racha y récords', () => {
  it('ranking por tiempo con sesiones y última vez', () => {
    const r = porJuego([sesion('a', t(15, 10), 30), sesion('b', t(14, 10), 60), sesion('a', t(13, 10), 40)])
    expect(r.map((f) => [f.juegoId, f.ms / MIN, f.sesiones])).toEqual([
      ['a', 70, 2],
      ['b', 60, 1],
    ])
  })

  it('por consola', () => {
    const c = porConsola([sesion('a', t(15, 10), 30), sesion('b', t(15, 12), 20, { sistema: 'gb' })])
    expect(c.get('gba')).toBe(30 * MIN)
    expect(c.get('gb')).toBe(20 * MIN)
  })

  it('racha: días seguidos hasta hoy o ayer, y la mejor', () => {
    const dias = [15, 14, 13, 10, 9, 8, 7]
    const s = dias.map((d) => sesion('a', t(d, 10), 5))
    expect(racha(s, AHORA)).toEqual({ actual: 3, mejor: 4 })
    // Si hoy aún no se ha jugado, cuenta hasta ayer
    expect(racha(s.slice(1), AHORA).actual).toBe(2)
    // Menos de un minuto no cuenta
    expect(racha([sesion('a', t(15, 10), 0.5)], AHORA).actual).toBe(0)
  })

  it('récords', () => {
    const r = records([sesion('a', t(15, 10), 30), sesion('b', t(14, 10), 90), sesion('a', t(14, 20), 20)])
    expect(r.sesionMasLarga?.juegoId).toBe('b')
    expect(r.mejorDia).toEqual({ clave: '2026-11-14', ms: 110 * MIN })
  })
})
