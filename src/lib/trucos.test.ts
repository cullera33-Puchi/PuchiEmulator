import { describe, expect, it } from 'vitest'
import type { Truco } from './almacen'
import { elegirTrucos, envios, juntarTrucos, leerCht, limpiarCodigo, urlTrucos, type FicheroTrucos } from './trucos'

const truco = (codigo: string, activo = true, nombre = 'T'): Truco => ({ nombre, codigo, activo })

describe('trucos (v0.48.0)', () => {
  it('lee un fichero .cht de libretro y deja fuera los que no tienen código', () => {
    const cht = [
      'cheats = 4',
      '',
      'cheat0_desc = "Infinite \\"Lives\\""',
      'cheat0_code = "7E0DBE09"',
      'cheat0_enable = false',
      '',
      'cheat1_desc = "Max Money"',
      'cheat1_code = "7E1234FF+7E1235FF"',
      'cheat1_enable = true',
      '',
      'cheat2_desc = "Memory search (RetroArch)"',
      'cheat2_handler = "1"',
      '',
      'cheat3_code = "ABCD-1234"',
    ].join('\r\n')
    expect(leerCht(cht)).toEqual([
      { nombre: 'Infinite "Lives"', codigo: '7E0DBE09', activo: false },
      // Llegan todos sin poner: los pone el usuario
      { nombre: 'Max Money', codigo: '7E1234FF+7E1235FF', activo: false },
      { nombre: 'Truco 4', codigo: 'ABCD-1234', activo: false },
    ])
  })

  it('limpia el código pegado: espacios a los lados y saltos de línea', () => {
    expect(limpiarCodigo('  7E00001F\n7E000100 \n')).toBe('7E00001F+7E000100')
    expect(limpiarCodigo('+A++B+')).toBe('A+B')
    expect(limpiarCodigo('82000000 0063')).toBe('82000000 0063')
  })

  it('manda solo los activos, uno por llamada', () => {
    const r = envios([truco('7E00001F'), truco('7E000200', false), truco('7E000300')], 'snes')
    expect(r).toEqual({ codigos: ['7E00001F', '7E000300'], fuera: [] })
  })

  it('parte los códigos largos donde se puede (Super Nintendo) y deja fuera los que no (GBA sin tope, PlayStation…)', () => {
    const largo = Array.from({ length: 40 }, (_, i) => `7E${String(i).padStart(4, '0')}FF`).join('+')
    const { codigos, fuera } = envios([truco(largo)], 'snes')
    expect(fuera).toEqual([])
    expect(codigos.length).toBeGreaterThan(1)
    expect(codigos.every((c) => c.length <= 250)).toBe(true)
    expect(codigos.join('+')).toBe(largo)
    // En Game Boy no se parte (hay códigos que dependen del anterior), pero el tope es mucho mayor
    expect(envios([truco(largo)], 'gba').codigos).toEqual([largo])
    // Una parte sola más larga que el tope no se puede poner
    const enorme = truco('A'.repeat(300))
    expect(envios([enorme], 'md')).toEqual({ codigos: [], fuera: [enorme] })
  })

  it('elige el fichero solo si la coincidencia es segura', () => {
    const f = (nombre: string): FicheroTrucos => ({ nombre, carpeta: 'Nintendo - Super Nintendo Entertainment System', puntos: 1, exacto: true })
    expect(elegirTrucos('Chrono Trigger', [f('Chrono Trigger (USA)')])?.nombre).toBe('Chrono Trigger (USA)')
    expect(elegirTrucos('Chrono', [{ ...f('Chrono Trigger (USA)'), exacto: false }])).toBeNull()
  })

  it('dirección del fichero en el archivo, con espacios y paréntesis escapados', () => {
    expect(urlTrucos({ carpeta: 'Nintendo - Game Boy', nombre: 'Pokemon - Red Version (USA, Europe)' })).toBe(
      'https://raw.githubusercontent.com/libretro/libretro-database/master/cht/Nintendo%20-%20Game%20Boy/Pokemon%20-%20Red%20Version%20(USA%2C%20Europe).cht',
    )
  })

  it('al cambiar de fichero se quedan los propios y siguen puestos los del archivo con el mismo código', () => {
    const antes: Truco[] = [
      { nombre: 'Mío', codigo: 'AAAA', activo: true, propio: true },
      { nombre: 'Viejo', codigo: '7E00001F', activo: true },
      { nombre: 'Otro', codigo: '7E000200', activo: false },
    ]
    const nuevos: Truco[] = [truco('7E00001F', false, 'Rojo'), truco('7E000300', false, 'Nuevo')]
    expect(juntarTrucos(antes, nuevos)).toEqual([
      { nombre: 'Mío', codigo: 'AAAA', activo: true, propio: true },
      { nombre: 'Rojo', codigo: '7E00001F', activo: true },
      { nombre: 'Nuevo', codigo: '7E000300', activo: false },
    ])
  })
})
