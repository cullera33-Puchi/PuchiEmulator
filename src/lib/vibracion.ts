/**
 * Vibración breve. Safari en el iPhone no tiene navigator.vibrate, pero marcar un interruptor nativo
 * oculto dentro de un toque da un toque háptico en iOS 17.4 y posteriores (guía de usabilidad, 9.2).
 */
let interruptor: HTMLInputElement | null = null

function crear(): HTMLInputElement {
  const etiqueta = document.createElement('label')
  etiqueta.setAttribute('aria-hidden', 'true')
  etiqueta.style.cssText = 'position:fixed;left:-200px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none'
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.setAttribute('switch', '')
  input.tabIndex = -1
  etiqueta.appendChild(input)
  document.body.appendChild(etiqueta)
  return input
}

export function vibrar(ms = 10): void {
  try {
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(ms)
      return
    }
    interruptor ??= crear()
    interruptor.click()
  } catch {
    // sin vibración
  }
}
