import { useEffect, useState } from 'react'
import { subscribeToasts } from '../toast'
import type { ToastItem } from '../toast'

export default function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => subscribeToasts(setItems), [])

  if (!items.length) return null

  return (
    <div className="toasts">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}