import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { agruparDiscos, cueParaBin, esChd, esSectorCd, ficherosDeGrupo, ficherosDelCue, reescribirCue } from './discos'
import { Sha1 } from './sha1'

const fixture = (n: string) => new Uint8Array(readFileSync(new URL(`../../tests/fixtures/${n}`, import.meta.url)))
const fichero = (nombre: string, datos: Uint8Array | string) => new File([datos as BlobPart], nombre)

describe('SHA-1 por trozos', () => {
  it('da lo mismo que de una vez, partido de cualquier manera', () => {
    const datos = new Uint8Array(200_003).map((_, i) => (i * 31 + 7) & 0xff)
    const esperado = createHash('sha1').update(datos).digest('hex')
    for (const trozo of [1, 63, 64, 65, 1000, 65536, datos.length]) {
      const h = new Sha1()
      for (let i = 0; i < datos.length; i += trozo) h.actualizar(datos.subarray(i, i + trozo))
      expect(h.resumen()).toBe(esperado)
    }
  })

  it('vacío y con longitudes en el borde del relleno', () => {
    for (const n of [0, 55, 56, 64, 119, 120]) {
      const datos = new Uint8Array(n).fill(0x61)
      const h = new Sha1()
      h.actualizar(datos)
      expect(h.resumen()).toBe(createHash('sha1').update(datos).digest('hex'))
    }
  })
})

describe('discos de PlayStation', () => {
  it('reconoce un sector de CD y un CHD', () => {
    expect(esSectorCd(fixture('prueba-psx.bin'))).toBe(true)
    expect(esChd(fixture('prueba-psx.chd'))).toBe(true)
    expect(esSectorCd(fixture('prueba.md'))).toBe(false)
    expect(esChd(fixture('prueba-psx.bin'))).toBe(false)
  })

  it('lee los ficheros de una hoja CUE y los cambia de nombre', () => {
    const cue = 'FILE "Juego (Pista 1).bin" BINARY\r\n  TRACK 01 MODE2/2352\r\n    INDEX 01 00:00:00\r\nFILE "Juego (Pista 2).bin" BINARY\r\n  TRACK 02 AUDIO\r\n    INDEX 00 00:00:00\r\n    INDEX 01 00:02:00\r\n'
    expect(ficherosDelCue(cue)).toEqual(['Juego (Pista 1).bin', 'Juego (Pista 2).bin'])
    expect(ficherosDelCue('FILE juego.bin BINARY\nTRACK 01 MODE2/2352')).toEqual(['juego.bin'])
    const nueva = reescribirCue(cue, new Map([['juego (pista 1).bin', 'pista1.bin'], ['juego (pista 2).bin', 'pista2.bin']]))
    expect(ficherosDelCue(nueva)).toEqual(['pista1.bin', 'pista2.bin'])
    expect(nueva).toContain('TRACK 02 AUDIO')
  })

  it('hoja para un BIN suelto, según el modo de su primer sector', () => {
    expect(cueParaBin('pista1.bin', 2)).toContain('MODE2/2352')
    expect(cueParaBin('pista1.bin', 1)).toContain('MODE1/2352')
  })

  it('agrupa el CUE con sus BIN, el CHD y el BIN suelto, y deja lo demás', async () => {
    const cue = fichero('Prueba.cue', 'FILE "PRUEBA-PSX.BIN" BINARY\r\n  TRACK 01 MODE2/2352\r\n    INDEX 01 00:00:00\r\n')
    const bin = fichero('prueba-psx.bin', fixture('prueba-psx.bin'))
    const chd = fichero('Otro.chd', fixture('prueba-psx.chd'))
    const suelto = fichero('Suelto.bin', fixture('prueba-psx.bin'))
    const md = fichero('Sega.bin', fixture('prueba.md'))
    const gba = fichero('juego.gba', fixture('prueba.gba'))
    const { discos, resto, incompletos } = await agruparDiscos([bin, cue, chd, suelto, md, gba])
    expect(incompletos).toEqual([])
    expect(resto.map((f) => f.name)).toEqual(['Sega.bin', 'juego.gba'])
    expect(discos.map((d) => [d.nombre, d.datos.map((f) => f.name)])).toEqual([
      ['Prueba', ['prueba-psx.bin']],
      ['Otro', ['Otro.chd']],
      ['Suelto', ['Suelto.bin']],
    ])
    expect(ficherosDelCue(discos[0].cue!)).toEqual(['pista1.bin'])
    expect(ficherosDeGrupo(discos[0])).toEqual({ nombres: ['pista1.bin', 'disco.cue'], principal: 'disco.cue' })
    expect(ficherosDeGrupo(discos[1])).toEqual({ nombres: ['disco.chd'], principal: 'disco.chd' })
    expect(discos[2].cue).toContain('MODE2/2352')
  })

  it('un CUE sin su BIN queda como incompleto', async () => {
    const { discos, incompletos } = await agruparDiscos([fichero('Solo.cue', 'FILE "falta.bin" BINARY\r\n  TRACK 01 MODE2/2352\r\n')])
    expect(discos).toEqual([])
    expect(incompletos).toEqual(['Solo.cue'])
  })
})
