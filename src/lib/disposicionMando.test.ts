import { describe, expect, it } from 'vitest'
import { desdeRect, escalar, estiloPieza, mover } from './disposicionMando'

describe('botones movibles', () => {
  it('mover no deja salir la pieza de la pantalla', () => {
    expect(mover({ x: 0.5, y: 0.5, escala: 1 }, 0.2, -0.1)).toEqual({ x: 0.7, y: 0.4, escala: 1 })
    expect(mover({ x: 0.9, y: 0.1, escala: 1 }, 0.5, -0.5)).toEqual({ x: 0.98, y: 0.02, escala: 1 })
  })

  it('el tamaño va en pasos del 10 % entre el 60 % y el 180 %', () => {
    expect(escalar({ x: 0, y: 0, escala: 1 }, 1).escala).toBe(1.1)
    expect(escalar({ x: 0, y: 0, escala: 1 }, -10).escala).toBe(0.6)
    expect(escalar({ x: 0, y: 0, escala: 1.7 }, 3).escala).toBe(1.8)
  })

  it('parte de donde está la pieza y la coloca por su centro', () => {
    const c = desdeRect({ left: 100, top: 600, width: 168, height: 168 }, 400, 800)
    expect(c.x).toBeCloseTo(184 / 400)
    expect(c.y).toBeCloseTo(684 / 800)
    expect(estiloPieza({ x: 0.25, y: 0.5, escala: 1.2 })).toMatchObject({ left: '25cqw', top: '50cqh', translate: '-50% -50%', scale: '1.2' })
  })

  it('las piezas de abajo guardan su distancia al borde de abajo, aunque cambie el alto (v0.42.4)', () => {
    // Colocada con 874 de alto, a 100 puntos del borde de abajo
    const c = { x: 0.3, y: (874 - 100) / 874, escala: 1, alto: 874 }
    expect(estiloPieza(c)).toMatchObject({ top: 'auto', bottom: '100px', translate: '-50% 50%' })
    // Sin alto guardado (antes de la v0.42.4), con el alto que se le diga
    expect(estiloPieza({ x: 0.3, y: 0.9, escala: 1 }, 800)).toMatchObject({ bottom: '80px' })
    // Mover y partir de la pantalla apuntan el alto del recuadro
    expect(mover({ x: 0.5, y: 0.5, escala: 1 }, 0, 0.1, 812).alto).toBe(812)
    expect(desdeRect({ left: 0, top: 700, width: 100, height: 100 }, 400, 812).alto).toBe(812)
  })
})
