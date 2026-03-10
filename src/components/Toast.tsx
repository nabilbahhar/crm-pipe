'use client'
import { useEffect } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'warning'

interface ToastProps {
  message: string
  type?: ToastType
  onClose: () => void
  duration?: number // ms, default 4000
}

export default function Toast({ message, type = 'success', onClose, duration = 4000 }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, duration)
    return () => clearTimeout(t)
  }, [onClose, duration])

  const config = {
    success: { icon: CheckCircle2, bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800', iconColor: 'text-emerald-500' },
    error: { icon: XCircle, bg: 'bg-red-50 border-red-200', text: 'text-red-800', iconColor: 'text-red-500' },
    warning: { icon: AlertTriangle, bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', iconColor: 'text-amber-500' },
  }[type]

  const Icon = config.icon

  return (
    <div className={`fixed top-6 right-6 z-[300] flex items-center gap-3 px-5 py-3 rounded-xl border shadow-lg ${config.bg} animate-in slide-in-from-right`}>
      <Icon size={20} className={config.iconColor} />
      <span className={`text-sm font-medium ${config.text}`}>{message}</span>
      <button onClick={onClose} className="ml-2 opacity-50 hover:opacity-100">
        <X size={16} />
      </button>
    </div>
  )
}
