/**
 * @file lib/utils.ts
 * Helpers partagés — NE PAS redéfinir dans les pages.
 * Importer depuis '@/lib/utils'
 */

// ─── Formatters monétaires ────────────────────────────────────────────────────

/** MAD sans décimales — ex: 1 250 000 MAD  (pour listes, KPIs) */
export const mad = (n: number | null | undefined): string => {
  if (n == null) return '—'
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency: 'MAD',
    maximumFractionDigits: 0,
  }).format(Number(n) || 0)
}

/** MAD avec 2 décimales — ex: 57.500,00 MAD  (pour fiches achat, tableaux financiers) */
export const madFull = (n: number | null | undefined): string => {
  if (n == null) return '—'
  return (
    Number(n).toLocaleString('de-DE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' MAD'
  )
}

/** Montant compact — ex: 1.2M  /  450K  (pour KPI cards, badges) */
export const fmt = (n: number | null | undefined): string => {
  const v = Number(n) || 0
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`
  return String(Math.round(v))
}

/** Pourcentage — ex: 23.5 % */
export const pct = (n: number | null | undefined): string => `${(Number(n) || 0).toFixed(1)} %`

// ─── Formatters date ──────────────────────────────────────────────────────────

/** Date courte — ex: 15/03/25 */
export const fmtDate = (s?: string | null): string => {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('fr-MA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** Date + heure — ex: 15 mars 25, 10:30 */
export const fmtDateTime = (s?: string | null): string => {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('fr-MA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Normalise une valeur date quelconque vers 'YYYY-MM' ou null.
 * Accepte: ISO string, date-only string, timestamp.
 */
export const ymFrom = (raw: any): string | null => {
  if (!raw) return null
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (s.length >= 7 && /^\d{4}-\d{2}/.test(s)) return s.slice(0, 7)
    return null
  }
  try {
    const d = new Date(raw)
    if (!isNaN(d.getTime()))
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  } catch {}
  return null
}

// ─── Normalisation métier ─────────────────────────────────────────────────────

/** Déduit Open / Won / Lost depuis status ou stage */
export const normStatus = (row: {
  status?: string | null
  stage?: string | null
}): 'Open' | 'Won' | 'Lost' => {
  const st = String(row?.status || '').trim()
  if (st === 'Won' || st === 'Lost' || st === 'Open') return st
  const sg = String(row?.stage || '').toLowerCase()
  if (sg === 'won') return 'Won'
  if (sg.includes('lost')) return 'Lost'
  return 'Open'
}

/** Normalise une BU brute vers son label canonique */
export const normSBU = (
  raw: any
): 'HCI' | 'Network' | 'Storage' | 'Cyber' | 'Service' | 'CSG' | 'MULTI' | 'Other' => {
  const u = String(raw || '').trim().toUpperCase()
  if (!u) return 'Other'
  if (u === 'MULTI') return 'MULTI'
  if (u.includes('CSG')) return 'CSG'
  if (u.includes('NETWORK')) return 'Network'
  if (u.includes('STORAGE')) return 'Storage'
  if (u.includes('CYBER')) return 'Cyber'
  if (u.includes('SERVICE')) return 'Service'
  if (u.includes('HCI') || u.includes('INFRA')) return 'HCI'
  return 'Other'
}

// ─── Couleurs métier ──────────────────────────────────────────────────────────

export const SBU_COLORS: Record<string, string> = {
  HCI: '#6366f1',
  Network: '#0ea5e9',
  Storage: '#14b8a6',
  Cyber: '#ef4444',
  Service: '#8b5cf6',
  CSG: '#f59e0b',
  MULTI: '#94a3b8',
  Other: '#cbd5e1',
}

export const BU_BADGE_CLS: Record<string, string> = {
  HCI: 'bg-indigo-50 text-indigo-700',
  Network: 'bg-sky-50 text-sky-700',
  Storage: 'bg-teal-50 text-teal-700',
  Cyber: 'bg-red-50 text-red-700',
  Service: 'bg-violet-50 text-violet-700',
  CSG: 'bg-amber-50 text-amber-700',
  MULTI: 'bg-slate-100 text-slate-600',
}

export const STAGE_CFG: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  Lead:                  { bg: 'bg-slate-100',  text: 'text-slate-600',   dot: 'bg-slate-400',   border: 'border-slate-200'  },
  Discovery:             { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-400',    border: 'border-blue-200'   },
  Qualified:             { bg: 'bg-cyan-50',    text: 'text-cyan-700',    dot: 'bg-cyan-400',    border: 'border-cyan-200'   },
  Solutioning:           { bg: 'bg-violet-50',  text: 'text-violet-700',  dot: 'bg-violet-400',  border: 'border-violet-200' },
  'Proposal Sent':       { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400',   border: 'border-amber-200'  },
  Negotiation:           { bg: 'bg-orange-50',  text: 'text-orange-700',  dot: 'bg-orange-400',  border: 'border-orange-200' },
  Commit:                { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', border: 'border-emerald-200'},
  Won:                   { bg: 'bg-green-100',  text: 'text-green-800',   dot: 'bg-green-500',   border: 'border-green-300'  },
  'Lost / No decision':  { bg: 'bg-red-50',     text: 'text-red-600',     dot: 'bg-red-400',     border: 'border-red-200'    },
}

// ─── Objectif annuel ──────────────────────────────────────────────────────────

const DEFAULT_ANNUAL_TARGET = 30_000_000 // 30M MAD

/** Retourne l'objectif annuel Won (localStorage override ou 30M par défaut) */
export const getAnnualTarget = (): number => {
  if (typeof window === 'undefined') return DEFAULT_ANNUAL_TARGET
  const stored = localStorage.getItem('crm_annual_target')
  if (stored) { const n = Number(stored); if (n > 0) return n }
  return DEFAULT_ANNUAL_TARGET
}

/** Persiste un nouvel objectif annuel */
export const setAnnualTarget = (value: number): void => {
  if (typeof window !== 'undefined') localStorage.setItem('crm_annual_target', String(value))
}

// ─── Supply ───────────────────────────────────────────────────────────────────

export type SupplyStatus = 'a_commander' | 'place' | 'commande' | 'en_stock' | 'livre' | 'facture'

export const SUPPLY_STATUS_CFG: Record<SupplyStatus, {
  label: string; icon: string; color: string; bg: string; border: string; dot: string; next?: SupplyStatus
}> = {
  a_commander: { label: 'À commander', icon: '📋', color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-400',   next: 'place'     },
  place:       { label: 'Placé',        icon: '📤', color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200',    dot: 'bg-blue-500',    next: 'commande'  },
  commande:    { label: 'Commandé',     icon: '🔄', color: 'text-violet-700',  bg: 'bg-violet-50',  border: 'border-violet-200',  dot: 'bg-violet-500',  next: 'en_stock'  },
  en_stock:    { label: 'En stock',     icon: '📦', color: 'text-orange-700',  bg: 'bg-orange-50',  border: 'border-orange-200',  dot: 'bg-orange-400',  next: 'livre'     },
  livre:       { label: 'Livré',        icon: '🚚', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500', next: 'facture'   },
  facture:     { label: 'Facturé',      icon: '✅', color: 'text-slate-600',   bg: 'bg-slate-100',  border: 'border-slate-200',   dot: 'bg-slate-400'                     },
}

export const SUPPLY_STATUS_ORDER: SupplyStatus[] = [
  'a_commander', 'place', 'commande', 'en_stock', 'livre', 'facture',
]

// ─── Line status (tracking par ligne) ────────────────────────────────────────

export type LineStatus = 'pending' | 'commande' | 'sous_douane' | 'en_stock' | 'livre' | 'pas_de_visibilite'

export const LINE_STATUS_CFG: Record<LineStatus, {
  label: string; icon: string; color: string; bg: string; border: string; dot: string
}> = {
  pending:            { label: 'En attente',           icon: '⏳', color: 'text-slate-600',   bg: 'bg-slate-50',    border: 'border-slate-200',   dot: 'bg-slate-400'   },
  commande:           { label: 'Commandé',             icon: '🔄', color: 'text-blue-700',    bg: 'bg-blue-50',     border: 'border-blue-200',    dot: 'bg-blue-500'    },
  sous_douane:        { label: 'Sous douane',          icon: '🛃', color: 'text-violet-700',  bg: 'bg-violet-50',   border: 'border-violet-200',  dot: 'bg-violet-500'  },
  en_stock:           { label: 'En stock',             icon: '📦', color: 'text-orange-700',  bg: 'bg-orange-50',   border: 'border-orange-200',  dot: 'bg-orange-400'  },
  livre:              { label: 'Livré',                icon: '✅', color: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-200', dot: 'bg-emerald-500' },
  pas_de_visibilite:  { label: 'Pas de visibilité',    icon: '❓', color: 'text-red-600',     bg: 'bg-red-50',      border: 'border-red-200',     dot: 'bg-red-400'     },
}

export const LINE_STATUS_ORDER: LineStatus[] = [
  'pending', 'commande', 'sous_douane', 'en_stock', 'livre', 'pas_de_visibilite',
]

// ─── Team name mapping ────────────────────────────────────────────────────────
const TEAM_NAMES: Record<string, string> = {
  'nabil.imdh@gmail.com': 'Nabil Bahhar',
  's.chitachny@compucom.ma': 'Salim Chitachny',
}
export function ownerName(email: string | null | undefined): string {
  if (!email) return '—'
  return TEAM_NAMES[email] || email.split('@')[0]
}
