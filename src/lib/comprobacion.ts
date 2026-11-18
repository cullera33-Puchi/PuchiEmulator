/**
 * Comprobación en el iPhone (v0.44.0, mejora 20; la DS en vertical, revisada en la v0.45.0, el avance rápido, en la v0.46.0, los discos de PlayStation, en la v0.47.0, y los trucos, en la v0.48.0): una lista de unos 15 minutos con lo que queda por
 * confirmar de las últimas versiones. El usuario marca cada punto como «Bien» o «Falla» mientras juega
 * y manda los resultados con el registro de ese rato. Se guarda en localStorage (no son datos de juego).
 */
import { APP_VERSION } from './version'

export type Resultado = 'pendiente' | 'bien' | 'falla'

export interface PuntoComprobacion {
  id: string
  texto: string
}

export interface GrupoComprobacion {
  titulo: string
  minutos: number
  puntos: PuntoComprobacion[]
}

/** Lo que queda por confirmar en el iPhone, en el orden en que se hace */
export const COMPROBACION: GrupoComprobacion[] = [
  {
    titulo: 'Super Nintendo',
    minutos: 4,
    puntos: [
      { id: 'snes-seguir', texto: 'Abre un juego donde lo dejaste y juega un minuto: imagen y sonido normales.' },
      { id: 'snes-cargar', texto: 'Guarda rápido, juega unos segundos y carga rápido: a los 10 segundos sigue respondiendo.' },
      { id: 'snes-girar', texto: 'Gira a horizontal y vuelve a vertical: la imagen sigue moviéndose.' },
      { id: 'avance-ligero', texto: 'Avance rápido x2: sale la marca ámbar en la imagen y no suena; al quitarlo, vuelven la velocidad normal y el sonido.' },
    ],
  },
  {
    titulo: 'Pantalla y botones',
    minutos: 3,
    puntos: [
      { id: 'fila-centrada', texto: 'En vertical, la fila de guardar, cargar, menú y avance rápido está centrada.' },
      { id: 'ds-vertical-3', texto: 'Nintendo DS en vertical: la fila de guardar, Select, Start y menú se ve entera y responde (si iOS deja un hueco abajo, es suyo).' },
      { id: 'botones-movidos', texto: 'Los botones que has movido no pisan la fila de abajo.' },
      { id: 'menu-fondo', texto: 'Con el menú del juego abierto, no asoma otro color por debajo.' },
    ],
  },
  {
    titulo: 'Otras consolas',
    minutos: 4,
    puntos: [
      { id: 'psx', texto: 'PlayStation: juega un minuto. La imagen no se encoge y el juego va a su velocidad.' },
      { id: 'psx-discos', texto: 'PlayStation con varios discos, si tienes alguno: añade un disco otro día y se junta con su juego; un estado guardado en el disco 2 lo vuelve a poner al cargarlo.' },
      { id: 'n64', texto: 'Nintendo 64, si tienes alguno: juega un minuto. ¿Va fluido, sin parones?' },
      { id: 'ds-seguir', texto: 'Nintendo DS: abre donde lo dejaste y no sale «El emulador ha fallado».' },
      { id: 'sonido', texto: 'Game Boy Advance o Game Boy: el sonido se oye limpio, sin tono metálico.' },
    ],
  },
  {
    titulo: 'Partidas y app',
    minutos: 4,
    puntos: [
      { id: 'trucos', texto: 'Trucos: en un juego de rol, Menú, Trucos. Sale su lista (o eliges el juego); pon uno y comprueba que hace efecto.' },
      { id: 'salir', texto: 'Sal de un juego desde el menú: sale «Guardando…» y vuelves a la biblioteca.' },
      { id: 'volver-abrir', texto: 'Vuelve a abrir ese juego: sigue donde lo dejaste.' },
      { id: 'parpadeo', texto: 'Vuelve atrás deslizando desde el borde: la pantalla no parpadea.' },
      { id: 'cabeceras', texto: 'Los títulos de arriba se ven nítidos, no borrosos bajo la hora.' },
    ],
  },
]

export const TOTAL_PUNTOS = COMPROBACION.reduce((n, g) => n + g.puntos.length, 0)

export interface EstadoComprobacion {
  /** Cuándo se marcó el primer punto (ms): el registro que se manda empieza ahí */
  inicio?: number
  resultados: Record<string, Resultado>
  notas: string
}

const CLAVE = 'puchiemulator-comprobacion'

export function leerComprobacion(): EstadoComprobacion {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? 'null') as Partial<EstadoComprobacion> | null
    return { inicio: v?.inicio, resultados: v?.resultados ?? {}, notas: v?.notas ?? '' }
  } catch {
    return { resultados: {}, notas: '' }
  }
}

export function guardarComprobacion(e: EstadoComprobacion): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(e))
  } catch {
    // sin almacenamiento: vale para esta vez
  }
}

/** Marca un punto. El primero que se marca pone la hora de inicio. */
export function marcar(e: EstadoComprobacion, id: string, r: Resultado, ahora = Date.now()): EstadoComprobacion {
  return { ...e, inicio: e.inicio ?? ahora, resultados: { ...e.resultados, [id]: r } }
}

export function recuento(e: EstadoComprobacion): { bien: number; falla: number; hechos: number } {
  let bien = 0
  let falla = 0
  for (const g of COMPROBACION)
    for (const p of g.puntos) {
      const r = e.resultados[p.id]
      if (r === 'bien') bien++
      else if (r === 'falla') falla++
    }
  return { bien, falla, hechos: bien + falla }
}

const PALABRA: Record<Resultado, string> = { pendiente: 'sin probar', bien: 'bien', falla: 'FALLA' }

/** Los resultados en texto, para pegarlos en el chat */
export function textoComprobacion(e: EstadoComprobacion): string {
  const { bien, falla } = recuento(e)
  const lineas = [`Comprobación en el iPhone, v${APP_VERSION}: ${bien} bien, ${falla} fallan, ${TOTAL_PUNTOS - bien - falla} sin probar`]
  COMPROBACION.forEach((g) => {
    lineas.push('', g.titulo)
    for (const p of g.puntos) lineas.push(`- [${PALABRA[e.resultados[p.id] ?? 'pendiente']}] ${p.texto}`)
  })
  if (e.notas.trim()) lineas.push('', `Notas: ${e.notas.trim()}`)
  return lineas.join('\n')
}
