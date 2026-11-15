import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'
import { aplicarTema, leerAjustes } from './lib/ajustes'
import { listarJuegos, pedirPersistencia } from './lib/almacen'
import { capturarErrores, modoApp, registrar } from './lib/registro'
import { copiaDiaria } from './lib/seguridad'
import { APP_VERSION } from './lib/version'

capturarErrores()
aplicarTema()
try {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (leerAjustes().tema === 'auto') capturarErrores()
aplicarTema()
  })
} catch {
  // sin matchMedia
}
// Sin zoom con dos dedos: la app se comporta como una nativa
document.addEventListener('gesturestart', (e) => e.preventDefault())
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1) e.preventDefault()
  },
  { passive: false },
)
// Que Safari no borre las partidas si falta espacio (en la app instalada suele concederlo)
void pedirPersistencia()
void listarJuegos()
  .then((j) => registrar('info', `Inicio v${APP_VERSION} (${modoApp()})`, { juegos: j.length }))
  .catch(() => registrar('info', `Inicio v${APP_VERSION} (${modoApp()})`))
// Copia de las partidas del día, y otra vez si la app sigue abierta al cambiar de día
void copiaDiaria()
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void copiaDiaria()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
