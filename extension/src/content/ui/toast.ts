// Toast component — shows info, error, or warning messages near the input field

type ToastVariant = 'info' | 'error' | 'warning'

interface ToastOptions {
  message: string
  variant?: ToastVariant
  duration?: number // ms, default 3000
}

let activeToast: HTMLElement | null = null

export function showToast({ message, variant = 'info', duration = 3000 }: ToastOptions): void {
  // Remove any existing toast
  dismissToast()

  const toast = document.createElement('div')
  toast.className = `promptgod-toast promptgod-toast--${variant}`
  toast.textContent = message
  toast.setAttribute('role', 'alert')

  document.body.appendChild(toast)
  activeToast = toast

  // Trigger entrance animation on next frame
  requestAnimationFrame(() => {
    toast.classList.add('promptgod-toast--visible')
  })

  setTimeout(() => {
    dismissToast()
  }, duration)
}

export function dismissToast(): void {
  if (activeToast) {
    activeToast.remove()
    activeToast = null
  }
}
