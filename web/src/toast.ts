export type ToastType = 'info' | 'success' | 'error'

export interface ToastItem {
  id: number
  text: string
  type: ToastType
}

type Listener = (toasts: ToastItem[]) => void

let toasts: ToastItem[] = []
const listeners = new Set<Listener>()
let nextId = 1

function emit() {
  for (const l of listeners) l(toasts)
}

export function toast(text: string, type: ToastType = 'info') {
  const id = nextId++
  toasts = [...toasts, { id, text, type }]
  emit()
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    emit()
  }, 4000)
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}