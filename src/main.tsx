import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'
import { aplicarTema, leerAjustes } from './lib/ajustes'
import { pedirPersistencia } from './lib/almacen'

aplicarTema()
try {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (leerAjustes().tema === 'auto') aplicarTema()
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
