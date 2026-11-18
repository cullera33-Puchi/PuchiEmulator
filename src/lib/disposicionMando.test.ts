import { describe, expect, it } from 'vitest'
import { aAltoActual, desdeRect, escalar, estiloPieza, mover } from './disposicionMando'

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
    // Sin alto conocido (fuera del navegador no hay pantalla), a su fracción del alto
    expect(estiloPieza({ x: 0.25, y: 0.5, escala: 1.2 }, 'vertical')).toMatchObject({ left: '25cqw', top: '50cqh', translate: '-50% -50%', scale: '1.2' })
  })

  it('las piezas de abajo guardan su distancia al borde de abajo, aunque cambie el alto (v0.42.4)', () => {
    // Colocada con 874 de alto, a 100 puntos del borde de abajo
    const c = { x: 0.3, y: (874 - 100) / 874, escala: 1, alto: 874 }
    expect(estiloPieza(c, 'vertical')).toMatchObject({ top: 'auto', bottom: '100px', translate: '-50% 50%' })
    // Sin alto guardado (antes de la v0.42.4), con el alto que se le diga
    expect(estiloPieza({ x: 0.3, y: 0.9, escala: 1 }, 'vertical', 800)).toMatchObject({ bottom: '80px' })
    // Las de arriba, a su distancia del borde de arriba (v0.43.0)
    expect(estiloPieza({ x: 0.3, y: 0.25, escala: 1, alto: 812 }, 'vertical')).toMatchObject({ top: '203px', bottom: 'auto' })
    // Mover y partir de la pantalla apuntan el alto del recuadro
    expect(mover({ x: 0.5, y: 0.5, escala: 1 }, 0, 0.1, 812).alto).toBe(812)
    expect(desdeRect({ left: 0, top: 700, width: 100, height: 100 }, 400, 812).alto).toBe(812)
  })

  it('al moverla, la guardada pasa al alto de ahora sin cambiar de sitio (v0.43.0)', () => {
    // Colocada con 874 a 100 puntos del borde de abajo; ahora el recuadro mide 812
    const c = aAltoActual({ x: 0.3, y: (874 - 100) / 874, escala: 1, alto: 874 }, 812, 'vertical')
    expect(c.alto).toBe(812)
    expect((1 - c.y) * 812).toBeCloseTo(100)
    // Una de arriba, a 200 puntos del borde de arriba
    const d = aAltoActual({ x: 0.3, y: 200 / 874, escala: 1, alto: 874 }, 812, 'vertical')
    expect(d.y * 812).toBeCloseTo(200)
    // Sin alto guardado ni dato, solo se le apunta el de ahora
    expect(aAltoActual({ x: 0.3, y: 0.7, escala: 1 }, 812, 'vertical')).toEqual({ x: 0.3, y: 0.7, escala: 1, alto: 812 })
    // Una de arriba guardada sin alto sigue a su fracción, tal como se veía (v0.43.2)
    expect(aAltoActual({ x: 0.3, y: 0.2, escala: 1 }, 812, 'vertical')).toEqual({ x: 0.3, y: 0.2, escala: 1, alto: 812 })
    expect(estiloPieza({ x: 0.3, y: 0.2, escala: 1 }, 'vertical')).toMatchObject({ top: '20cqh' })
  })
})
