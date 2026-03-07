'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'
import { RefreshCw, Filter, X, Download } from 'lucide-react'

type Activity = {
  id: string
  user_email: string
  action_type: string
  entity_type: string
  entity_id: string | null
  entity_name: string
  detail: string | null
  created_at: string
}

const ACTION_COLOR: Record<string, string> = {
  create: '#10b981', update: '#3b82f6', delete: '#ef4444', stage: '#f59e0b',
  won: '#16a34a', lost: '#dc2626', convert: '#8b5cf6',
}
const ACTION_LABEL: Record<string, string> = {
  create: 'Ajouté', update: 'Modifié', delete: 'Supprimé', stage: 'Stage →',
  won: 'Won ✓', lost: 'Lost ✗', convert: 'Converti',
}
const ENTITY_ICON: Record<string, string> = {
  deal: '💼', account: '🏢', prospect: '🎯', contact: '👤', card: '🃏',
}
const ENTITY_LABEL: Record<string, string> = {
  deal: 'Deal', account: 'Compte', prospect: 'Prospect', contact: 'Contact', card: 'Carte',
}

function userName(email: string) {
  if (email === 'nabil.imdh@gmail.com') return 'Nabil'
  if (email === 's.chitachny@compucom.ma') return 'Salim'
  return email.split('@')[0]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('fr-MA', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDay(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return "Aujourd'hui"
  if (d.toDateString() === yesterday.toDateString()) return 'Hier'
  return d.toLocaleDateString('fr-MA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export default function ActivityPage() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading]       = useState(true)
  const [hasMore, setHasMore]       = useState(false)
  const [page, setPage]             = useState(0)
  const PAGE_SIZE = 100

  // Filters
  const [filterUser,   setFilterUser]   = useState('Tous')
  const [filterType,   setFilterType]   = useState('Tous')
  const [filterEntity, setFilterEntity] = useState('Tous')
  const [filterFrom,   setFilterFrom]   = useState('')
  const [filterTo,     setFilterTo]     = useState('')
  const [search,       setSearch]       = useState('')

  async function load(reset = false) {
    setLoading(true)
    const offset = reset ? 0 : page * PAGE_SIZE

    let q = supabase
      .from('activity_log')
      .select('id,user_email,action_type,entity_type,entity_id,entity_name,detail,created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)

    const { data } = await q
    const rows = (data as Activity[]) || []

    if (reset) {
      setActivities(rows)
      setPage(1)
    } else {
      setActivities(prev => [...prev, ...rows])
      setPage(p => p + 1)
    }
    setHasMore(rows.length === PAGE_SIZE)
    setLoading(false)
  }

  useEffect(() => { document.title = 'Activit\u00e9 \u00b7 CRM-PIPE'; load(true) }, [])

  // Filtered rows (client-side for speed)
  const filtered = useMemo(() => {
    let r = [...activities]
    if (filterUser !== 'Tous') r = r.filter(a => a.user_email === filterUser)
    if (filterType !== 'Tous') r = r.filter(a => a.action_type === filterType)
    if (filterEntity !== 'Tous') r = r.filter(a => a.entity_type === filterEntity)
    if (filterFrom) r = r.filter(a => a.created_at >= filterFrom)
    if (filterTo)   r = r.filter(a => a.created_at <= filterTo + 'T23:59:59')
    if (search) {
      const q = search.toLowerCase()
      r = r.filter(a =>
        a.entity_name.toLowerCase().includes(q) ||
        (a.detail || '').toLowerCase().includes(q) ||
        a.user_email.toLowerCase().includes(q)
      )
    }
    return r
  }, [activities, filterUser, filterType, filterEntity, filterFrom, filterTo, search])

  // Group by day
  const grouped = useMemo(() => {
    const groups: { day: string; items: Activity[] }[] = []
    let lastDay = ''
    filtered.forEach(a => {
      const day = new Date(a.created_at).toDateString()
      if (day !== lastDay) {
        groups.push({ day, items: [a] })
        lastDay = day
      } else {
        groups[groups.length - 1].items.push(a)
      }
    })
    return groups
  }, [filtered])

  function exportCSV() {
    const header = ['Date','Heure','Utilisateur','Action','Type','Entité','Détail']
    const csvRows = [header.join(';')]
    for (const a of filtered) {
      const d = new Date(a.created_at)
      csvRows.push([
        d.toLocaleDateString('fr-MA'),
        d.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' }),
        userName(a.user_email),
        ACTION_LABEL[a.action_type] || a.action_type,
        ENTITY_LABEL[a.entity_type] || a.entity_type,
        a.entity_name,
        a.detail || '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
    }
    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const el = document.createElement('a'); el.href = url
    el.download = `activites_${new Date().toISOString().slice(0, 10)}.csv`
    el.click(); URL.revokeObjectURL(url)
  }

  const hasFilters = filterUser !== 'Tous' || filterType !== 'Tous' || filterEntity !== 'Tous' || filterFrom || filterTo || search

  function resetFilters() {
    setFilterUser('Tous'); setFilterType('Tous'); setFilterEntity('Tous')
    setFilterFrom(''); setFilterTo(''); setSearch('')
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Historique des activités</h1>
            <p className="text-sm text-slate-500 mt-1">
              {filtered.length} événement{filtered.length > 1 ? 's' : ''} · Toutes les modifications de l'équipe
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportCSV} title="Export CSV"
              className="inline-flex items-center gap-2 h-9 px-3 rounded-xl border bg-white text-sm text-slate-600 hover:bg-slate-50 shadow-sm">
              <Download className="h-4 w-4" />
            </button>
            <button onClick={() => load(true)} disabled={loading}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-xl border bg-white text-sm hover:bg-slate-50 shadow-sm">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border shadow-sm p-4 mb-6">
          <div className="flex flex-wrap gap-3 items-end">

            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Recherche</label>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Nom, détail, email..."
                className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-slate-400" />
            </div>

            {/* User */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Utilisateur</label>
              <select value={filterUser} onChange={e => setFilterUser(e.target.value)}
                className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none">
                <option value="Tous">Tous</option>
                <option value="nabil.imdh@gmail.com">Nabil</option>
                <option value="s.chitachny@compucom.ma">Salim</option>
              </select>
            </div>

            {/* Action type */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Action</label>
              <select value={filterType} onChange={e => setFilterType(e.target.value)}
                className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none">
                <option value="Tous">Toutes</option>
                {Object.entries(ACTION_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            {/* Entity type */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Type</label>
              <select value={filterEntity} onChange={e => setFilterEntity(e.target.value)}
                className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none">
                <option value="Tous">Tous</option>
                {Object.entries(ENTITY_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            {/* Date from */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Du</label>
              <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
                className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none" />
            </div>

            {/* Date to */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Au</label>
              <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
                className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none" />
            </div>

            {/* Reset */}
            {hasFilters && (
              <button onClick={resetFilters}
                className="h-9 inline-flex items-center gap-1.5 px-3 rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100">
                <X className="h-3.5 w-3.5" /> Réinitialiser
              </button>
            )}
          </div>
        </div>

        {/* Activity list grouped by day */}
        {loading && activities.length === 0 ? (
          <div className="text-center py-16 text-slate-400">Chargement…</div>
        ) : grouped.length === 0 ? (
          <div className="text-center py-16 text-slate-400">Aucune activité trouvée</div>
        ) : (
          <div className="space-y-6">
            {grouped.map(group => (
              <div key={group.day}>
                {/* Day header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                    {formatDay(group.items[0].created_at)}
                  </div>
                  <div className="flex-1 h-px bg-slate-200" />
                  <div className="text-xs text-slate-300">{group.items.length} événement{group.items.length > 1 ? 's' : ''}</div>
                </div>

                {/* Events */}
                <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                  {group.items.map((a, idx) => {
                    const color  = ACTION_COLOR[a.action_type] || '#64748b'
                    const label  = ACTION_LABEL[a.action_type] || a.action_type
                    const icon   = ENTITY_ICON[a.entity_type] || '📋'
                    return (
                      <div key={a.id} className={`flex gap-4 px-5 py-4 ${idx < group.items.length - 1 ? 'border-b border-slate-50' : ''} hover:bg-slate-50/50 transition-colors`}>

                        {/* Icon */}
                        <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-base flex-shrink-0">
                          {icon}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-slate-900">{userName(a.user_email)}</span>
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
                              style={{ background: color + '18', color }}>
                              {label}
                            </span>
                            {a.entity_id && a.entity_type === 'deal' ? (
                              <Link href={`/opportunities/${a.entity_id}`}
                                className="text-sm font-semibold text-slate-800 hover:text-blue-600 hover:underline truncate">
                                {a.entity_name}
                              </Link>
                            ) : a.entity_type === 'prospect' ? (
                              <Link href="/prospection"
                                className="text-sm font-semibold text-slate-800 hover:text-blue-600 hover:underline truncate">
                                {a.entity_name}
                              </Link>
                            ) : a.entity_type === 'account' ? (
                              <Link href="/accounts"
                                className="text-sm font-semibold text-slate-800 hover:text-blue-600 hover:underline truncate">
                                {a.entity_name}
                              </Link>
                            ) : (
                              <span className="text-sm font-semibold text-slate-800 truncate">{a.entity_name}</span>
                            )}
                          </div>
                          {a.detail && (
                            <div className="mt-1 text-xs text-slate-500 leading-relaxed">{a.detail}</div>
                          )}
                        </div>

                        {/* Time */}
                        <div className="text-xs text-slate-400 whitespace-nowrap flex-shrink-0 pt-0.5">
                          {new Date(a.created_at).toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' })}
                        </div>

                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Load more */}
            {hasMore && (
              <div className="text-center pt-2">
                <button onClick={() => load(false)} disabled={loading}
                  className="inline-flex items-center gap-2 h-10 px-6 rounded-xl border bg-white text-sm font-medium hover:bg-slate-50 shadow-sm">
                  {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                  Charger plus d'activités
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}


//a
