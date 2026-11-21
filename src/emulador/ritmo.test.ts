import { describe, expect, it } from 'vitest'
import { estimarRefresco, limitarRecuperacion, planRitmo, Refresco, refrescosPasados } from './ritmo'

describe('planRitmo', () => {
  it('GBA (59,73 Hz) y Super Nintendo (60,10 Hz) en una pantalla de 60 Hz: un fotograma por refresco', () => {
    expect(planRitmo(59.7275, 1000 / 60)).toEqual({ modo: 'sincronizado', cadaRefrescos: 1, porRefresco: 1 })
    expect(planRitmo(60.0988, 1000 / 60)).toEqual({ modo: 'sincronizado', cadaRefrescos: 1, porRefresco: 1 })
  })

  it('en una pantalla de 120 Hz, uno cada dos refrescos; a 30 Hz (bajo consumo), dos por refresco', () => {
    expect(planRitmo(60.0988, 1000 / 120)).toEqual({ modo: 'sincronizado', cadaRefrescos: 2, porRefresco: 1 })
    expect(planRitmo(59.7275, 1000 / 30)).toEqual({ modo: 'sincronizado', cadaRefrescos: 1, porRefresco: 2 })
  })

  it('un juego europeo (50 Hz) en una pantalla de 60 Hz va por tiempo', () => {
    expect(planRitmo(50.007, 1000 / 60)).toEqual({ modo: 'tiempo' })
  })

  it('sin medidas de la pantalla, por tiempo', () => {
    expect(planRitmo(60, 0)).toEqual({ modo: 'tiempo' })
  })
})

describe('Refresco', () => {
  it('necesita unas cuantas medidas y descarta los saltos', () => {
    const r = new Refresco()
    for (let i = 0; i < 29; i++) r.medir(16.7)
    expect(r.ms).toBe(0)
    r.medir(16.6)
    r.medir(250) // la app vuelve de segundo plano
    r.medir(33.4) // un refresco perdido
    expect(r.ms).toBeCloseTo(1000 / 60, 1)
  })

  it('a 120 Hz con intervalos irregulares y refrescos perdidos sigue midiendo 120 Hz', () => {
    // Lo que se vio en el registro del iPhone 17: intervalos de 6 a 10 ms y algún refresco perdido
    const r = new Refresco()
    let semilla = 7
    const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 400; i++) {
      const perdido = azar() < 0.15
      r.medir(perdido ? 16.67 + (azar() - 0.5) * 2 : 8.33 + (azar() - 0.5) * 4)
    }
    expect(1000 / r.ms).toBeCloseTo(120, 6)
    expect(planRitmo(60.0988, r.ms)).toEqual({ modo: 'sincronizado', cadaRefrescos: 2, porRefresco: 1 })
  })

  it('a 60 Hz con los refrescos entregados con un retraso que crece y se recupera, sigue midiendo 60 Hz (v0.49.0)', () => {
    // Lo que daba 53 Hz en el registro de GBA: tres refrescos con 2 ms más cada uno y uno corto que
    // vuelve a su sitio. La mediana se quedaba con los largos (18,7 ms)
    const intervalos: number[] = []
    for (let i = 0; i < 90; i++) intervalos.push(i % 4 === 3 ? 1000 / 60 - 6 : 1000 / 60 + 2)
    expect(1000 / estimarRefresco(intervalos)).toBeCloseTo(60, 6)
    // Y con alguno perdido de vez en cuando
    const conPerdidos = intervalos.map((dt, i) => (i % 13 === 0 ? dt + 1000 / 60 : dt))
    expect(1000 / estimarRefresco(conPerdidos)).toBeCloseTo(60, 6)
  })

  it('a 60 Hz con refrescos a destiempo (uno muy corto y otro muy largo) sigue en 60 Hz (v0.49.0)', () => {
    const intervalos: number[] = []
    for (let i = 0; i < 90; i++) intervalos.push(i % 6 === 0 ? 7 : i % 6 === 1 ? 1000 / 30 - 7 : 1000 / 60)
    expect(1000 / estimarRefresco(intervalos)).toBeCloseTo(60, 6)
  })

  it('una pantalla poco habitual se mide tal cual', () => {
    expect(1000 / estimarRefresco(new Array(40).fill(1000 / 75))).toBeCloseTo(75)
  })
})

describe('Refresco, al subir la pantalla de frecuencia', () => {
  it('avisa de que la medida va atrasada hasta que se pone al día, y no con el vaivén normal (v0.43.2)', () => {
    const r = new Refresco()
    for (let i = 0; i < 90; i++) r.medir(1000 / 60)
    expect(r.ms).toBeCloseTo(1000 / 60)
    expect(r.atrasado).toBe(false)
    // El vaivén normal alterna intervalos cortos y largos: no cuenta
    for (let i = 0; i < 20; i++) r.medir(i % 2 ? 24 : 9)
    expect(r.atrasado).toBe(false)
    // La pantalla pasa a 120 Hz: a los seis refrescos ya se sabe
    for (let i = 0; i < 5; i++) r.medir(1000 / 120)
    expect(r.atrasado).toBe(false)
    r.medir(1000 / 120)
    expect(r.atrasado).toBe(true)
    // Cuando la mediana se entera, deja de avisar
    for (let i = 0; i < 90; i++) r.medir(1000 / 120)
    expect(r.ms).toBeCloseTo(1000 / 120)
    expect(r.atrasado).toBe(false)
  })
})

describe('refrescosPasados', () => {
  it('cuenta los refrescos perdidos, como mucho 4', () => {
    expect(refrescosPasados(8.3, 1000 / 120)).toBe(1)
    expect(refrescosPasados(16.7, 1000 / 120)).toBe(2)
    expect(refrescosPasados(5, 1000 / 120)).toBe(1)
    expect(refrescosPasados(100, 1000 / 120)).toBe(4)
  })
})

describe('limitarRecuperacion', () => {
  it('sale del ciclo de 15 imágenes por segundo de la DS a 30 Hz', () => {
    // 2 fotogramas por refresco de 33 ms, 9,5 ms cada uno: tras un refresco perdido tocarían 4 (38 ms)
    expect(limitarRecuperacion(4, 2, 9.5, 33.3)).toBe(2)
  })

  it('recupera lo que quepa en el refresco', () => {
    expect(limitarRecuperacion(4, 1, 5, 16.7)).toBe(2)
    expect(limitarRecuperacion(4, 1, 1, 16.7)).toBe(4)
  })

  it('no limita si ni los fotogramas normales caben: mejor la velocidad que la fluidez', () => {
    expect(limitarRecuperacion(4, 2, 20, 33.3)).toBe(4)
  })

  it('no toca nada sin retraso o sin medidas', () => {
    expect(limitarRecuperacion(2, 2, 9.5, 33.3)).toBe(2)
    expect(limitarRecuperacion(4, 2, 0, 33.3)).toBe(4)
  })
})
