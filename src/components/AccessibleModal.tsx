'use client'

import { useEffect, useRef, useCallback, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface AccessibleModalProps {
  open: boolean
  onClose: () => void
  title: string
  /** Optional: wider modal. Default max-w-lg */
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '5xl'
  /** If true, show the built-in header with title + close button */
  showHeader?: boolean
  /** Optional: gradient header style */
  headerGradient?: boolean
  /** Optional: additional className on the modal panel */
  className?: string
  children: ReactNode
}

const SIZE_MAP: Record<string, string> = {
  sm:  'max-w-sm',
  md:  'max-w-md',
  lg:  'max-w-lg',
  xl:  'max-w-xl',
  '2xl': 'max-w-2xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
}

/**
 * Accessible modal component with:
 * - role="dialog" + aria-modal="true" + aria-labelledby
 * - Focus trap (Tab/Shift+Tab cycle within modal)
 * - ESC key to close
 * - Click outside to close
 * - Auto-focus first focusable element on open
 * - Focus restoration on close
 * - Scroll lock on body
 * - Portal rendering (z-[200])
 */
export default function AccessibleModal({
  open,
  onClose,
  title,
  size = 'lg',
  showHeader = true,
  headerGradient = false,
  className = '',
  children,
}: AccessibleModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2, 8)}`).current

  // ─── Focus trap: get all focusable elements ───
  const getFocusableElements = useCallback(() => {
    if (!modalRef.current) return []
    return Array.from(
      modalRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    )
  }, [])

  // ─── ESC key + focus trap ───
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      if (e.key === 'Tab') {
        const focusable = getFocusableElements()
        if (focusable.length === 0) {
          e.preventDefault()
          return
        }
        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose, getFocusableElements])

  // ─── Auto-focus + scroll lock + focus restoration ───
  useEffect(() => {
    if (open) {
      // Save current focus
      previousFocus.current = document.activeElement as HTMLElement

      // Lock body scroll
      const original = document.body.style.overflow
      document.body.style.overflow = 'hidden'

      // Auto-focus first element after render
      requestAnimationFrame(() => {
        const focusable = getFocusableElements()
        if (focusable.length > 0) {
          focusable[0].focus()
        } else {
          modalRef.current?.focus()
        }
      })

      return () => {
        document.body.style.overflow = original
        // Restore focus
        previousFocus.current?.focus()
      }
    }
  }, [open, getFocusableElements])

  if (!open) return null

  const sizeClass = SIZE_MAP[size] || SIZE_MAP.lg

  const modal = (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="presentation"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`w-full ${sizeClass} max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 outline-none ${className}`}
      >
        {showHeader && (
          <div className={`flex items-center justify-between px-6 py-4 ${
            headerGradient
              ? 'bg-gradient-to-r from-slate-900 to-slate-700 rounded-t-2xl'
              : 'border-b border-slate-200'
          }`}>
            <h2
              id={titleId}
              className={`text-base font-semibold ${headerGradient ? 'text-white' : 'text-slate-800'}`}
            >
              {title}
            </h2>
            <button
              onClick={onClose}
              aria-label="Fermer"
              className={`p-1.5 rounded-lg transition-colors ${
                headerGradient
                  ? 'text-slate-300 hover:text-white hover:bg-white/10'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
              }`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="overflow-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}

/**
 * Accessible confirm dialog with proper ARIA.
 */
export function AccessibleConfirm({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <AccessibleModal open={open} onClose={onCancel} title={title} size="sm">
      <div className="p-6">
        <p className="text-sm text-slate-600 mb-6">{message}</p>
        <div className="flex justify-end gap-2.5">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded-lg font-medium text-white transition-colors ${
              danger
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </AccessibleModal>
  )
}
