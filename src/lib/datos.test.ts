import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  _reiniciarConexion,
  actualizarJuego,
  leerJuego,
  guardarEstado,
  guardarNota,
  guardarPartida,
  guardarSesionJuego,
  leerEstado,
  leerNota,
  leerPartida,
  leerRomGuardada,
  listarJuegos,
  listarSesiones,
  quitarJuego,
  renombrarEstado,
} from './almacen'
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

    expect(await importarArchivo(texto)).toMatchObject({ partidas: 1, estados: 1, sesiones: 0, notas: 0 })
    const p = await leerPartida(id)
    expect(new Uint8Array(p!.datos)).toEqual(new Uint8Array([9, 8, 7]))
    expect(new Uint8Array(p!.rtc!)).toEqual(new Uint8Array([1]))
    const e = await leerEstado(id, '2')
    expect(e?.datos.byteLength).toBe(70000)
    expect(new Uint8Array(e!.datos)[69999]).toBe(5)
  })

  it('la copia lleva las notas de los juegos; una nota vacía se borra', async () => {
    await guardarNota(id, 'Voy por la tercera mazmorra. Contraseña: 1234')
    expect((await leerNota(id))?.texto).toMatch(/tercera/)
    const texto = JSON.stringify(await crearArchivo(false, '0.14.0'))
    await guardarNota(id, '   ')
    expect(await leerNota(id)).toBeUndefined()
    expect((await importarArchivo(texto)).notas).toBe(1)
    expect((await leerNota(id))?.texto).toBe('Voy por la tercera mazmorra. Contraseña: 1234')
  })

  it('la copia lleva el favorito y el estado de cada juego y los pone en los que están en la biblioteca', async () => {
    const r = await anadirFichero('prueba.gba', fichero('prueba.gba'))
    if (r.tipo !== 'nuevo') throw new Error('no se añadió')
    const j = r.juego
    await actualizarJuego({ ...j, favorito: true, estado: 'terminado', terminado: 1234 })
    const texto = JSON.stringify(await crearArchivo(false, '0.15.0'))
    await actualizarJuego({ ...j, favorito: undefined, estado: undefined, terminado: undefined })
    await importarArchivo(texto)
    expect((await leerJuego(j.id))?.estado).toBe('terminado')
    expect((await leerJuego(j.id))?.favorito).toBe(true)
    expect((await leerJuego(j.id))?.terminado).toBe(1234)
  })

  it('la copia lleva las nueve ranuras con su nombre, y guardar de nuevo conserva el nombre', async () => {
    await guardarEstado({ id, ranura: '9', datos: new Uint8Array([7]).buffer, fecha: 5 })
    await renombrarEstado(id, '9', '  Antes del jefe  ')
    await guardarEstado({ id, ranura: '9', datos: new Uint8Array([8]).buffer, fecha: 6 })
    expect((await leerEstado(id, '9'))?.nombre).toBe('Antes del jefe')
    const texto = JSON.stringify(await crearArchivo(true, '0.19.0'))
    await renombrarEstado(id, '9', '')
    expect((await leerEstado(id, '9'))?.nombre).toBeUndefined()
    await importarArchivo(texto)
    expect((await leerEstado(id, '9'))?.nombre).toBe('Antes del jefe')
  })

  it('«Deshacer» al recuperar una copia devuelve los estados y las notas de antes (v0.30.0)', async () => {
    await guardarEstado({ id, ranura: '3', datos: new Uint8Array([1]).buffer, fecha: 1 })
    await guardarNota(id, 'Nota vieja')
    const texto = JSON.stringify(await crearArchivo(true, '0.29.0'))
    // Después de la copia: estado nuevo con nombre, otro en una ranura que la copia no tiene, y otra nota
    await guardarEstado({ id, ranura: '3', datos: new Uint8Array([2]).buffer, fecha: 2 })
    await renombrarEstado(id, '3', 'Antes del jefe')
    await guardarNota(id, 'Nota nueva')
    const r = await importarArchivo(texto)
    expect(new Uint8Array((await leerEstado(id, '3'))!.datos)).toEqual(new Uint8Array([1]))
    await r.deshacerEstadosYNotas()
    const e = await leerEstado(id, '3')
    expect(new Uint8Array(e!.datos)).toEqual(new Uint8Array([2]))
    expect(e?.nombre).toBe('Antes del jefe')
    expect((await leerNota(id))?.texto).toBe('Nota nueva')
  })

  it('«Deshacer» borra los estados que la copia trajo y antes no estaban', async () => {
    await guardarEstado({ id, ranura: '5', datos: new Uint8Array([1]).buffer, fecha: 1 })
    const texto = JSON.stringify(await crearArchivo(true, '0.29.0'))
    _reiniciarConexion()
    await new Promise<void>((r) => {
      const p = indexedDB.deleteDatabase('puchiemulator')
      p.onsuccess = () => r()
    })
    const r = await importarArchivo(texto)
    expect(await leerEstado(id, '5')).toBeDefined()
    await r.deshacerEstadosYNotas()
    expect(await leerEstado(id, '5')).toBeUndefined()
  })

  it('una copia con sesiones de una consola desconocida o colecciones que no son listas se rechaza', () => {
    const base = { formato: 'puchiemulator-partidas', version: 4, fecha: 1, app: '0.29.0', partidas: [] }
    expect(() => leerArchivo(JSON.stringify({ ...base, sesiones: [{ juegoId: id, nombre: 'x', sistema: 'psp', inicio: 1, fin: 2, ms: 1 }] }))).toThrow(ErrorArchivo)
    expect(() => leerArchivo(JSON.stringify({ ...base, estados: {} }))).toThrow(ErrorArchivo)
    expect(() => leerArchivo(JSON.stringify({ ...base, sesiones: {} }))).toThrow(ErrorArchivo)
  })

  it('una copia de antes de las notas (formato 1) se sigue leyendo', () => {
    const viejo = JSON.stringify({ formato: 'puchiemulator-partidas', version: 1, fecha: 1, app: '0.13.0', partidas: [{ id, datos: 'AQI=', fecha: 1 }], estados: [] })
    expect(leerArchivo(viejo)).toMatchObject({ notas: [], partidas: [{ id }] })
  })

  it('la copia lleva el tiempo jugado y al recuperarla no se duplican sesiones', async () => {
    const s = { juegoId: id, nombre: 'Juego', sistema: 'gba' as const, inicio: 1000, fin: 61000, ms: 60000 }
    const nuevo = await guardarSesionJuego(s)
    expect(typeof nuevo).toBe('number')
    // Actualizar la misma sesión no crea otra
    await guardarSesionJuego({ ...s, id: nuevo, fin: 91000, ms: 90000 })
    expect(await listarSesiones()).toHaveLength(1)
    const texto = JSON.stringify(await crearArchivo(false, '0.6.0'))
    expect((await importarArchivo(texto)).sesiones).toBe(0)
    _reiniciarConexion()
    await new Promise<void>((r) => {
      const p = indexedDB.deleteDatabase('puchiemulator')
      p.onsuccess = () => r()
    })
    expect((await importarArchivo(texto)).sesiones).toBe(1)
    expect((await listarSesiones())[0]).toMatchObject({ juegoId: id, ms: 90000 })
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
