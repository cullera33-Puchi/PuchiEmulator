import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { agruparDiscos, cueParaBin, esChd, esPbp, esSectorCd, ficherosDeGrupo, ficherosDelCue, numeroDeDisco, reescribirCue, seLeeEntero } from './discos'
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
    expect(ficherosDelCue(discos[0].textos[0].contenido)).toEqual(['pista1.bin'])
    expect(ficherosDeGrupo(discos[0])).toEqual({ nombres: ['pista1.bin', 'disco.cue'], principal: 'disco.cue' })
    expect(ficherosDeGrupo(discos[1])).toEqual({ nombres: ['disco.chd'], principal: 'disco.chd' })
    expect(discos[2].textos[0].contenido).toContain('MODE2/2352')
    expect(ficherosDelCue(discos[2].textos[0].contenido)).toEqual(['pista1.bin'])
    expect(discos.every((d) => d.discos === 1)).toBe(true)
  })

  it('un CUE sin su BIN queda como incompleto', async () => {
    const { discos, incompletos } = await agruparDiscos([fichero('Solo.cue', 'FILE "falta.bin" BINARY\r\n  TRACK 01 MODE2/2352\r\n')])
    expect(discos).toEqual([])
    expect(incompletos).toEqual(['Solo.cue'])
  })

  it('si falta una pista, las que sí están no entran como otro juego (v0.43.2)', async () => {
    const cue = fichero('Juego.cue', 'FILE "Juego (Track 1).bin" BINARY\r\n  TRACK 01 MODE2/2352\r\nFILE "Juego (Track 2).bin" BINARY\r\n  TRACK 02 AUDIO\r\n')
    const pista1 = fichero('Juego (Track 1).bin', fixture('prueba-psx.bin'))
    const r = await agruparDiscos([cue, pista1])
    expect(r.discos).toEqual([])
    expect(r.resto).toEqual([])
    expect(r.incompletos).toEqual(['Juego.cue'])
    // Y una pista sin su hoja no es un juego: falta el .cue
    const sola = await agruparDiscos([pista1])
    expect(sola.discos).toEqual([])
    expect(sola.sinHoja).toEqual(['Juego (Track 1).bin'])
  })

  it('encuentra el BIN aunque las tildes vengan en otra forma (v0.43.2)', async () => {
    const cue = fichero('Pokémon.cue', `FILE "${'Pokémon.bin'.normalize('NFC')}" BINARY\r\n  TRACK 01 MODE2/2352\r\n    INDEX 01 00:00:00\r\n`)
    const bin = fichero('Pokémon.bin'.normalize('NFD'), fixture('prueba-psx.bin'))
    const r = await agruparDiscos([cue, bin])
    expect(r.incompletos).toEqual([])
    expect(r.discos.length).toBe(1)
  })

  it('no se leen enteras las imágenes de disco que la app no abre ni los .bin enormes (v0.43.2)', () => {
    expect(seLeeEntero('juego.iso', 700 * 1024 * 1024)).toBe(false)
    expect(seLeeEntero('pista2.bin', 300 * 1024 * 1024)).toBe(false)
    expect(seLeeEntero('Sega.bin', 4 * 1024 * 1024)).toBe(true)
    expect(seLeeEntero('juego.nds', 256 * 1024 * 1024)).toBe(true)
  })

  it('número de disco en el nombre', () => {
    expect(numeroDeDisco('Final Fantasy VII (Disc 2).cue')).toEqual({ base: 'Final Fantasy VII', numero: 2 })
    expect(numeroDeDisco('Juego (Spain) (Disco 3 de 4).chd')).toEqual({ base: 'Juego (Spain)', numero: 3 })
    expect(numeroDeDisco('Juego [CD1].bin')).toEqual({ base: 'Juego', numero: 1 })
    expect(numeroDeDisco('Juego (Spain).chd')).toEqual({ base: 'Juego (Spain)', numero: null })
  })

  it('reconoce un PBP', () => {
    expect(esPbp(new Uint8Array([0, 0x50, 0x42, 0x50, 0, 0]))).toBe(true)
    expect(esPbp(fixture('prueba-psx.bin'))).toBe(false)
  })

  it('junta los discos de un mismo juego, en orden, con una lista .m3u', async () => {
    const bin = fixture('prueba-psx.bin')
    const cue2 = fichero('Juego (Disc 2).cue', 'FILE "Juego (Disc 2).bin" BINARY\r\n  TRACK 01 MODE2/2352\r\n    INDEX 01 00:00:00\r\n')
    const { discos } = await agruparDiscos([
      cue2,
      fichero('Juego (Disc 2).bin', bin),
      fichero('Juego (Disc 1).chd', fixture('prueba-psx.chd')),
      fichero('Otro.chd', fixture('prueba-psx.chd')),
    ])
    expect(discos.map((d) => [d.nombre, d.discos])).toEqual([
      ['Otro', 1],
      ['Juego', 2],
    ])
    const juego = discos[1]
    expect(juego.datos.map((f) => f.name)).toEqual(['Juego (Disc 1).chd', 'Juego (Disc 2).bin'])
    expect(juego.nombres).toEqual(['disco1.chd', 'disco2-pista1.bin'])
    expect(juego.principal).toBe('discos.m3u')
    expect(juego.textos.map((t) => t.nombre)).toEqual(['disco2.cue', 'discos.m3u'])
    expect(ficherosDelCue(juego.textos[0].contenido)).toEqual(['disco2-pista1.bin'])
    expect(juego.textos[1].contenido).toBe('disco1.chd\ndisco2.cue\n')
  })
})
