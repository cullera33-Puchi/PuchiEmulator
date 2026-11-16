/**
 * BIOS de PlayStation del usuario (v0.37.0, opcional). Sin ella, el núcleo usa su BIOS libre, con la
 * que funcionan casi todos los juegos. La BIOS se guarda solo en el iPhone (nunca en el repositorio,
 * en la app publicada ni en las copias de partidas) y se deja en /sistema del núcleo antes de abrir
 * cada juego, con uno de los nombres que busca PCSX ReARMed.
 */

/** Nombres que busca el núcleo, en su orden (frontend/libretro.c) */
export const BIOS_CONOCIDAS = ['scph5500', 'scph5501', 'scph5502', 'psxonpsp660', 'scph101', 'scph7001', 'scph1001']

/** Una BIOS de PlayStation ocupa 512 KB */
export const TAM_BIOS_PSX = 512 * 1024

/** Nombre con el que se deja en /sistema: el suyo si el núcleo lo conoce y, si no, uno de la lista. */
export function nombreBiosPsx(original?: string): string {
  const base = (original ?? '').split(/[\\/]/).pop()!.toLowerCase().replace(/\.bin$/, '')
  return `${BIOS_CONOCIDAS.includes(base) ? base : 'scph5501'}.bin`
}

/** Por qué no vale un fichero como BIOS, o null si vale */
export function problemaBiosPsx(tam: number): string | null {
  return tam === TAM_BIOS_PSX ? null : 'Una BIOS de PlayStation ocupa 512 KB: este fichero no lo es.'
}
