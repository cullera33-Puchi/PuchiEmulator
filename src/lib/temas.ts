/**
 * Temas de la pantalla de juego: fondo, marco de la pantalla y botones. Son diseños propios
 * inspirados en las consolas, sin logotipos, marcas ni imágenes oficiales.
 * Los colores van como variables CSS en .juego (ver src/index.css).
 */
import type { Sistema } from './sistemas'

export type IdTema = 'oscuro' | 'clasica' | 'advance' | 'super' | 'baya' | 'kiwi' | 'turquesa' | 'amarilla' | 'uva'

export interface Tema {
  id: IdTema
  nombre: string
  /** Color de arriba del fondo: también para la barra de estado */
  arriba: string
  /** Color de abajo del fondo: también para el fondo de la página (franja de iOS) */
  abajo: string
  vars: Record<string, string>
}

const BOTONES_OSCUROS = {
  '--ab': '#2c2c32',
  '--ab-texto': 'rgb(255 255 255 / 0.8)',
  '--ab-pulsado': '#55555e',
  '--cruceta': '#2c2c32',
  '--cruceta-pulsado': '#55555e',
  '--pequeno': '#2c2c32',
  '--pequeno-texto': 'rgb(255 255 255 / 0.75)',
  '--hombro': 'rgb(0 0 0 / 0.22)',
  '--hombro-texto': 'rgb(255 255 255 / 0.85)',
  '--herramienta': 'rgb(0 0 0 / 0.16)',
  '--herramienta-texto': 'rgb(255 255 255 / 0.9)',
  '--borde': 'transparent',
  '--marco': '#3a3a44',
  '--marco-relleno': '10px',
}

const color = (id: IdTema, nombre: string, arriba: string, abajo: string): Tema => ({
  id,
  nombre,
  arriba,
  abajo,
  vars: { ...BOTONES_OSCUROS, '--fondo': `linear-gradient(180deg, ${arriba}, ${abajo})` },
})

export const TEMAS: Tema[] = [
  { id: 'oscuro', nombre: 'Oscuro', arriba: '#000000', abajo: '#000000', vars: {} },
  {
    id: 'clasica',
    nombre: 'Clásica',
    arriba: '#d6d4cf',
    abajo: '#c2bfb9',
    vars: {
      '--fondo': 'linear-gradient(180deg, #d6d4cf, #c2bfb9)',
      '--marco': '#5d6070',
      '--marco-relleno': '12px',
      '--marco-radio': '12px 12px 44px 12px',
      '--ab': '#9c2453',
      '--ab-texto': 'rgb(255 255 255 / 0.85)',
      '--ab-pulsado': '#c23a70',
      '--cruceta': '#2a2a2e',
      '--cruceta-pulsado': '#56565c',
      '--pequeno': '#8c8d94',
      '--pequeno-texto': 'rgb(255 255 255 / 0.9)',
      '--pequeno-giro': '-24deg',
      '--hombro': '#b3b0aa',
      '--hombro-texto': '#3c3c44',
      '--herramienta': 'rgb(0 0 0 / 0.07)',
      '--herramienta-texto': '#3c3c44',
      '--borde': 'transparent',
    },
  },
  {
    id: 'advance',
    nombre: 'Advance',
    arriba: '#5247aa',
    abajo: '#3a308e',
    vars: {
      '--fondo': 'linear-gradient(180deg, #5247aa, #3a308e)',
      '--marco': '#16161c',
      '--marco-relleno': '10px',
      '--marco-radio': '14px',
      '--ab': '#dcdce8',
      '--ab-texto': '#3a308e',
      '--ab-pulsado': '#ffffff',
      '--cruceta': '#24242c',
      '--cruceta-pulsado': '#4c4c58',
      '--pequeno': '#24242c',
      '--pequeno-texto': 'rgb(255 255 255 / 0.8)',
      '--hombro': '#8d86c8',
      '--hombro-texto': '#1d1a44',
      '--herramienta': 'rgb(0 0 0 / 0.18)',
      '--herramienta-texto': 'rgb(255 255 255 / 0.9)',
      '--borde': 'transparent',
    },
  },
  {
    id: 'super',
    nombre: 'Super',
    arriba: '#d9d9de',
    abajo: '#bdbdc6',
    vars: {
      '--fondo': 'linear-gradient(180deg, #d9d9de, #bdbdc6)',
      '--marco': '#2c2c34',
      '--marco-relleno': '10px',
      '--marco-radio': '14px',
      // Cuatro botones de colores; en el resto de temas, X e Y van como A y B
      '--ab': '#5b5b68',
      '--boton-a': '#c8282f',
      '--boton-b': '#e3ac12',
      '--boton-x': '#2f62b6',
      '--boton-y': '#2f8c56',
      '--ab-texto': 'rgb(255 255 255 / 0.9)',
      '--ab-pulsado': '#7a7a88',
      '--cruceta': '#2c2c34',
      '--cruceta-pulsado': '#55555f',
      '--pequeno': '#8d8d9a',
      '--pequeno-texto': 'rgb(255 255 255 / 0.9)',
      '--hombro': '#a9a9b5',
      '--hombro-texto': '#33333c',
      '--herramienta': 'rgb(0 0 0 / 0.07)',
      '--herramienta-texto': '#3c3c46',
      '--borde': 'transparent',
    },
  },
  color('baya', 'Baya', '#c8265e', '#a51a4b'),
  color('kiwi', 'Kiwi', '#9fc93f', '#84ab2d'),
  color('turquesa', 'Turquesa', '#25aaa3', '#1a8b86'),
  color('amarilla', 'Amarilla', '#f2c40f', '#d9a905'),
  color('uva', 'Uva', '#6d51a3', '#553e88'),
]

/** Tema que se usa con «Según la consola». */
export const TEMA_DE_CONSOLA: Record<Sistema, IdTema> = { gb: 'clasica', gbc: 'uva', gba: 'advance', snes: 'super' }

export function temaPorId(id: IdTema): Tema {
  return TEMAS.find((t) => t.id === id) ?? TEMAS[0]
}

export function temaPara(sistema: Sistema, elegido: IdTema | 'auto' | undefined): Tema {
  return temaPorId(!elegido || elegido === 'auto' ? TEMA_DE_CONSOLA[sistema] : elegido)
}

/** Colores de la pantalla en los juegos de Game Boy sin color (paletas de mGBA). */
export type PaletaGb = 'auto' | 'Grayscale' | 'DMG Green' | 'GB Pocket' | 'GB Light'

export const PALETAS: [PaletaGb, string][] = [
  ['auto', 'Según el tema'],
  ['DMG Green', 'Verde original'],
  ['GB Pocket', 'Pocket'],
  ['GB Light', 'Light'],
  ['Grayscale', 'Gris'],
]

export function paletaPara(tema: Tema, elegida: PaletaGb | undefined): Exclude<PaletaGb, 'auto'> {
  if (elegida && elegida !== 'auto') return elegida
  return tema.id === 'clasica' ? 'DMG Green' : 'Grayscale'
}
