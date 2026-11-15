import { describe, expect, it } from 'vitest'
import { COLOR_NOCHE, POR_DEFECTO, vibracionActiva } from './ajustes'

describe('modo noche', () => {
  it('quita la vibración aunque esté activada', () => {
    expect(vibracionActiva({ ...POR_DEFECTO, vibracion: true, modoNoche: false })).toBe(true)
    expect(vibracionActiva({ ...POR_DEFECTO, vibracion: true, modoNoche: true })).toBe(false)
    expect(vibracionActiva({ ...POR_DEFECTO, vibracion: false, modoNoche: false })).toBe(false)
  })

  it('cada intensidad oscurece más que la anterior y siempre quita más azul que rojo (más cálido)', () => {
    const canales = (c: string) => c.match(/\d+/g)!.map(Number)
    const [suave, media, fuerte] = (['suave', 'media', 'fuerte'] as const).map((k) => canales(COLOR_NOCHE[k]))
    const brillo = (c: number[]) => c[0] + c[1] + c[2]
    expect(brillo(suave)).toBeGreaterThan(brillo(media))
    expect(brillo(media)).toBeGreaterThan(brillo(fuerte))
    for (const c of [suave, media, fuerte]) expect(c[2]).toBeLessThan(c[0] * 0.75)
  })
})
