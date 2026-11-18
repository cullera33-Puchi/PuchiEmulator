import { describe, expect, it, vi } from 'vitest'

const almacen = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => almacen.get(k) ?? null,
  setItem: (k: string, v: string) => void almacen.set(k, v),
})

const { COMPROBACION, TOTAL_PUNTOS, guardarComprobacion, leerComprobacion, marcar, recuento, textoComprobacion } = await import('./comprobacion')

describe('comprobación en el iPhone (v0.44.0)', () => {
  it('unos 15 minutos y puntos sin repetir', () => {
    expect(COMPROBACION.reduce((n, g) => n + g.minutos, 0)).toBe(15)
    const ids = COMPROBACION.flatMap((g) => g.puntos.map((p) => p.id))
    expect(new Set(ids).size).toBe(ids.length)
    expect(TOTAL_PUNTOS).toBe(ids.length)
  })

  it('el primer punto marcado pone el inicio; se guarda y se recupera', () => {
    let e = leerComprobacion()
    expect(e).toEqual({ resultados: {}, notas: '', inicio: undefined })
    e = marcar(e, 'snes-seguir', 'bien', 1000)
    e = marcar(e, 'snes-cargar', 'falla', 2000)
    expect(e.inicio).toBe(1000)
    guardarComprobacion({ ...e, notas: 'Se para en el castillo' })
    const leida = leerComprobacion()
    expect(recuento(leida)).toEqual({ bien: 1, falla: 1, hechos: 2 })
    const texto = textoComprobacion(leida)
    expect(texto).toContain(`1 bien, 1 fallan, ${TOTAL_PUNTOS - 2} sin probar`)
    expect(texto).toContain('[FALLA] Guarda rápido')
    expect(texto).toContain('Notas: Se para en el castillo')
  })
})
