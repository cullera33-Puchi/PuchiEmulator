import { describe, expect, it } from 'vitest'
import { nombreBiosPsx, problemaBiosPsx, TAM_BIOS_PSX } from './bios'

describe('BIOS de PlayStation', () => {
  it('se deja con su nombre si el núcleo lo busca y, si no, con uno de la lista', () => {
    expect(nombreBiosPsx('SCPH1001.BIN')).toBe('scph1001.bin')
    expect(nombreBiosPsx('carpeta/scph7001.bin')).toBe('scph7001.bin')
    expect(nombreBiosPsx('mi bios.bin')).toBe('scph5501.bin')
    expect(nombreBiosPsx()).toBe('scph5501.bin')
  })

  it('solo vale un fichero de 512 KB', () => {
    expect(problemaBiosPsx(TAM_BIOS_PSX)).toBeNull()
    expect(problemaBiosPsx(1000)).toMatch(/512 KB/)
  })
})
