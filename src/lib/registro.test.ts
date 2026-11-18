import { describe, expect, it, vi } from 'vitest'

const almacen = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => almacen.get(k) ?? null,
  setItem: (k: string, v: string) => void almacen.set(k, v),
})

const { borrarRegistro, entradasUltimaPartida, leerRegistro, registrar, textoRegistro } = await import('./registro')

describe('registro', () => {
  it('guarda como mucho 400 entradas', () => {
    for (let i = 0; i < 450; i++) registrar('info', `evento ${i}`)
    expect(leerRegistro()).toHaveLength(400)
    expect(leerRegistro()[0].m).toBe('evento 50')
  })

  it('el mismo aviso solo una vez por minuto', () => {
    const antes = leerRegistro().length
    registrar('aviso', 'repetido')
    registrar('aviso', 'repetido')
    expect(leerRegistro().length - antes).toBeLessThanOrEqual(1)
    expect(leerRegistro().at(-1)?.m).toBe('repetido')
  })

  it('borrar se puede deshacer y conserva lo anotado mientras tanto', () => {
    const deshacer = borrarRegistro()
    expect(leerRegistro()).toHaveLength(0)
    registrar('info', 'después')
    deshacer()
    expect(leerRegistro().at(-1)?.m).toBe('después')
    expect(leerRegistro().length).toBe(400)
  })

  it('el texto lleva cabecera con versión y modo, y una línea por entrada', () => {
    const t = textoRegistro('juegos 2')
    expect(t.split('\n')[0]).toMatch(/^PuchiEmulator v.+ \| (instalada|navegador) \|.*juegos 2$/)
    expect(t).toMatch(/\[info\] después/)
  })
})

describe('última partida (v0.43.3)', () => {
  it('desde el último «Juego abierto», con lo de después; sin ninguno, todo', () => {
    const e = (m: string) => ({ t: '2026-11-18T08:00:00.000Z', l: 'info' as const, m })
    const lista = [e('Inicio'), e('Juego abierto'), e('Rendimiento'), e('Juego cerrado'), e('Juego abierto'), e('Estado cargado'), e('Inicio')]
    expect(entradasUltimaPartida(lista).map((x) => x.m)).toEqual(['Juego abierto', 'Estado cargado', 'Inicio'])
    expect(entradasUltimaPartida([e('Inicio'), e('Copia')]).length).toBe(2)
  })
})
