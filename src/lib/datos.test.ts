import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { _reiniciarConexion, guardarEstado, guardarPartida, leerEstado, leerPartida, leerRomGuardada, listarJuegos, quitarJuego } from './almacen'
import { anadirFichero, sha1 } from './biblioteca'
import { crearArchivo, ErrorArchivo, importarArchivo, leerArchivo } from './copias'

const fichero = (n: string) => {
  const b = readFileSync(new URL(`../../tests/fixtures/${n}`, import.meta.url))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

beforeEach(async () => {
  _reiniciarConexion()
  await new Promise<void>((resolver) => {
    const p = indexedDB.deleteDatabase('puchiemulator')
    p.onsuccess = p.onerror = p.onblocked = () => resolver()
  })
})

describe('biblioteca', () => {
  it('añade una ROM con su consola y su copia', async () => {
    const r = await anadirFichero('Prueba [!].gba', fichero('prueba.gba'))
    expect(r.tipo).toBe('nuevo')
    const [j] = await listarJuegos()
    expect(j.nombre).toBe('Prueba')
    expect(j.sistema).toBe('gba')
    expect(j.id).toBe(await sha1(new Uint8Array(fichero('prueba.gba'))))
    expect((await leerRomGuardada(j.id))?.byteLength).toBe(32768)
  })

  it('no duplica un juego que ya está, aunque venga en un zip', async () => {
    await anadirFichero('prueba.gba', fichero('prueba.gba'))
    // El zip trae la misma ROM de GBA
    expect((await anadirFichero('Prueba.zip', fichero('prueba.zip'))).tipo).toBe('repetido')
    expect(await listarJuegos()).toHaveLength(1)
  })

  it('rechaza lo que no es un juego', async () => {
    const r = await anadirFichero('notas.txt', new TextEncoder().encode('hola').buffer as ArrayBuffer)
    expect(r.tipo).toBe('no-reconocido')
  })

  it('quitar un juego conserva su partida', async () => {
    const r = await anadirFichero('prueba.gb', fichero('prueba.gb'))
    if (r.tipo !== 'nuevo') throw new Error()
    await guardarPartida({ id: r.juego.id, datos: new Uint8Array([1, 2, 3]).buffer, fecha: 1 })
    await quitarJuego(r.juego.id)
    expect(await listarJuegos()).toHaveLength(0)
    expect(await leerRomGuardada(r.juego.id)).toBeUndefined()
    expect(new Uint8Array((await leerPartida(r.juego.id))!.datos)).toEqual(new Uint8Array([1, 2, 3]))
  })
})

describe('copia de partidas', () => {
  const id = 'a'.repeat(40)

  it('exporta e importa partidas y estados sin cambios', async () => {
    await guardarPartida({ id, datos: new Uint8Array([9, 8, 7]).buffer, rtc: new Uint8Array([1]).buffer, fecha: 10 })
    await guardarEstado({ id, ranura: '2', datos: new Uint8Array(70000).fill(5).buffer, fecha: 20 })
    const texto = JSON.stringify(await crearArchivo(true, '0.1.0'))

    _reiniciarConexion()
    await new Promise<void>((r) => {
      const p = indexedDB.deleteDatabase('puchiemulator')
      p.onsuccess = () => r()
    })
    expect(await leerPartida(id)).toBeUndefined()

    expect(await importarArchivo(texto)).toEqual({ partidas: 1, estados: 1 })
    const p = await leerPartida(id)
    expect(new Uint8Array(p!.datos)).toEqual(new Uint8Array([9, 8, 7]))
    expect(new Uint8Array(p!.rtc!)).toEqual(new Uint8Array([1]))
    const e = await leerEstado(id, '2')
    expect(e?.datos.byteLength).toBe(70000)
    expect(new Uint8Array(e!.datos)[69999]).toBe(5)
  })

  it('sin estados, la copia solo lleva las partidas', async () => {
    await guardarPartida({ id, datos: new Uint8Array([1]).buffer, fecha: 1 })
    await guardarEstado({ id, ranura: 'auto', datos: new Uint8Array([2]).buffer, fecha: 1 })
    const a = await crearArchivo(false, '0.1.0')
    expect(a.partidas).toHaveLength(1)
    expect(a.estados).toHaveLength(0)
  })

  it('rechaza archivos que no son copias o están dañados', () => {
    expect(() => leerArchivo('hola')).toThrow(ErrorArchivo)
    expect(() => leerArchivo('{"formato":"otro"}')).toThrow(ErrorArchivo)
    expect(() => leerArchivo(JSON.stringify({ formato: 'puchiemulator-partidas', version: 1, partidas: [{ id: '../x', datos: '' }] }))).toThrow(ErrorArchivo)
    expect(() => leerArchivo(JSON.stringify({ formato: 'puchiemulator-partidas', version: 99, partidas: [] }))).toThrow(/más nueva/)
  })
})
