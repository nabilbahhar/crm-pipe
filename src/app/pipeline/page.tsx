'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { RefreshCw, Search, TrendingUp, Target, Zap, Trophy, Plus } from 'lucide-react'

type StageDef = { stage: string; sort_order: number }
type Account = { id: string; name: string }
type Opp = {
  id: string; title: string; stage: string; prob: number | null
  amount: number; booking_month: string | null; account_id: string
  bu: string | null; status: string | null; next_step: string | null
}

const STAGE_CONFIG: Record<string, { color: string; light: string; border: string; dot: string }> = {
  'Lead':               { color: '#64748b', light: '#f8fafc',   border: '#e2e8f0', dot: '#94a3b8' },
  'Discovery':          { color: '#3b82f6', light: '#eff6ff',   border: '#bfdbfe', dot: '#3b82f6' },
  'Qualified':          { color: '#8b5cf6', light: '#f5f3ff',   border: '#ddd6fe', dot: '#8b5cf6' },
  'Solutioning':        { color: '#a855f7', light: '#faf5ff',   border: '#e9d5ff', dot: '#a855f7' },
  'Proposal Sent':      { color: '#ec4899', light: '#fdf2f8',   border: '#fbcfe8', dot: '#ec4899' },
  'Negotiation':        { color: '#f59e0b', light: '#fffbeb',   border: '#fde68a', dot: '#f59e0b' },
  'Commit':             { color: '#f97316', light: '#fff7ed',   border: '#fed7aa', dot: '#f97316' },
  'Won':                { color: '#10b981', light: '#ecfdf5',   border: '#a7f3d0', dot: '#10b981' },
  'Lost / No decision': { color: '#ef4444', light: '#fef2f2',   border: '#fecaca', dot: '#ef4444' },
}

const DEFAULT_STAGE = { color: '#64748b', light: '#f8fafc', border: '#e2e8f0', dot: '#94a3b8' }

const BU_OPTIONS = ['Tous', 'HCI', 'Network', 'Storage', 'Cyber', 'Service', 'CSG']

const BU_COLORS: Record<string, { bg: string; text: string }> = {
  'HCI':     { bg: '#eff6ff', text: '#2563eb' },
  'Network': { bg: '#f5f3ff', text: '#7c3aed' },
  'Storage': { bg: '#fffbeb', text: '#d97706' },
  'Cyber':   { bg: '#fef2f2', text: '#dc2626' },
  'Service': { bg: '#ecfdf5', text: '#059669' },
  'CSG':     { bg: '#f8fafc', text: '#475569' },
}

const mad = (n: number) => new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 }).format(n || 0)
const madShort = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return String(n || 0)
}

export default function PipelinePage() {
  const [stages, setStages] = useState<StageDef[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [items, setItems] = useState<Opp[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [buFilter, setBuFilter] = useState('Tous')
  const [hideWonLost, setHideWonLost] = useState(true)

  async function load() {
    setErr(null); setLoading(true)
    const s = await supabase.from('stage_definitions').select('stage,sort_order').order('sort_order')
    const a = await supabase.from('accounts').select('id,name').order('name')
    const o = await supabase.from('opportunities')
      .select('id,title,stage,prob,amount,booking_month,account_id,bu,status,next_step')
      .order('amount', { ascending: false })
    setLoading(false)
    if (s.error) return setErr(s.error.message)
    if (a.error) return setErr(a.error.message)
    if (o.error) return setErr(o.error.message)
    setStages((s.data ?? []) as StageDef[])
    setAccounts((a.data ?? []) as Account[])
    setItems((o.data ?? []) as Opp[])
  }

  useEffect(() => { load() }, [])

  const accountNameById = useMemo(() => {
    const m = new Map(accounts.map(a => [a.id, a.name] as const))
    return (id: string) => m.get(id) ?? '—'
  }, [accounts])

  const filteredItems = useMemo(() => items.filter(o => {
    if (hideWonLost && (o.stage === 'Won' || o.stage === 'Lost / No decision')) return false
    if (buFilter !== 'Tous' && o.bu !== buFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!o.title.toLowerCase().includes(q) && !accountNameById(o.account_id).toLowerCase().includes(q)) return false
    }
    return true
  }), [items, search, buFilter, hideWonLost, accountNameById])

  const visibleStages = useMemo(() =>
    hideWonLost ? stages.filter(s => s.stage !== 'Won' && s.stage !== 'Lost / No decision') : stages,
    [stages, hideWonLost]
  )

  const byStage = useMemo(() => {
    const m = new Map<string, Opp[]>()
    for (const st of visibleStages) m.set(st.stage, [])
    for (const o of filteredItems) {
      if (!m.has(o.stage)) m.set(o.stage, [])
      m.get(o.stage)!.push(o)
    }
    return m
  }, [filteredItems, visibleStages])

  const kpis = useMemo(() => {
    const open = filteredItems.filter(o => o.stage !== 'Won' && o.stage !== 'Lost / No decision')
    const pipeline = open.reduce((s, o) => s + (o.amount || 0), 0)
    const weighted = open.reduce((s, o) => s + (o.amount || 0) * ((o.prob || 0) / 100), 0)
    const commit = open.filter(o => o.stage === 'Commit').reduce((s, o) => s + (o.amount || 0), 0)
    const won = items.filter(o => o.stage === 'Won').reduce((s, o) => s + (o.amount || 0), 0)
    return { pipeline, weighted, commit, won, count: open.length }
  }, [filteredItems, items])

  async function updateStage(id: string, newStage: string, oldStage: string) {
    const { error } = await supabase.from('opportunities').update({ stage: newStage }).eq('id', id)
    if (error) return setErr(error.message)
    // Log activity
    const { data: { user } } = await supabase.auth.getUser()
    const deal = items.find(o => o.id === id)
    if (user && deal) {
      await supabase.from('activity_log').insert({
        user_email: user.email,
        action_type: 'stage',
        entity_type: 'deal',
        entity_name: deal.title,
        detail: `${oldStage} → ${newStage}`,
      })
    }
    setItems(prev => prev.map(o => (o.id === id ? { ...o, stage: newStage } : o)))
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <style>{`
        .pipe-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; transition: all 0.15s; cursor: default; }
        .pipe-card:hover { box-shadow: 0 4px 20px rgba(0,0,0,0.08); border-color: #cbd5e1; transform: translateY(-1px); }
        .pipe-scroll::-webkit-scrollbar { height: 5px; }
        .pipe-scroll::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 3px; }
        .pipe-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
        .stage-select { width: 100%; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 10px; font-size: 11px; color: #64748b; background: #f8fafc; outline: none; cursor: pointer; margin-top: 10px; }
        .stage-select:hover { background: #f1f5f9; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        .pipe-card { animation: fadeUp 0.25s ease both; }
      `}</style>

      <div style={{ maxWidth: 1700, margin: '0 auto', padding: '24px 20px' }}>

        {/* Header */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>Pipeline</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '3px 0 0 0' }}>
              {kpis.count} deals actifs · {mad(kpis.pipeline)} MAD
            </p>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {/* Search */}
            <div style={{ position: 'relative' }}>
              <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: '#94a3b8' }} />
              <input
                placeholder="Chercher..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ height: 34, width: 200, borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', padding: '0 12px 0 32px', fontSize: 13, outline: 'none', color: '#0f172a' }}
              />
            </div>

            {/* BU filters */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {BU_OPTIONS.map(bu => (
                <button key={bu} onClick={() => setBuFilter(bu)} style={{
                  height: 30, borderRadius: 20, padding: '0 12px', fontSize: 12, fontWeight: 500,
                  border: `1px solid ${buFilter === bu ? '#0f172a' : '#e2e8f0'}`,
                  background: buFilter === bu ? '#0f172a' : '#fff',
                  color: buFilter === bu ? '#fff' : '#64748b',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  {bu}
                </button>
              ))}
            </div>

            {/* Won/Lost toggle */}
            <button onClick={() => setHideWonLost(v => !v)} style={{
              height: 30, borderRadius: 20, padding: '0 12px', fontSize: 12, fontWeight: 500,
              border: '1px solid #e2e8f0', background: !hideWonLost ? '#f1f5f9' : '#fff',
              color: '#475569', cursor: 'pointer',
            }}>
              {hideWonLost ? '+ Won/Lost' : '− Won/Lost'}
            </button>

            <button onClick={load} disabled={loading} style={{ height: 30, borderRadius: 10, padding: '0 12px', fontSize: 12, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <RefreshCw style={{ width: 12, height: 12 }} className={loading ? 'animate-spin' : ''} />
              Rafraîchir
            </button>

            <Link href="/opportunities" style={{ height: 30, borderRadius: 10, padding: '0 14px', fontSize: 12, fontWeight: 600, background: '#0f172a', color: '#fff', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Plus style={{ width: 12, height: 12 }} /> Nouveau deal
            </Link>
          </div>
        </div>

        {/* KPI Bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Pipeline Total', value: mad(kpis.pipeline), sub: `${kpis.count} deals`, icon: <TrendingUp style={{ width: 16, height: 16, color: '#3b82f6' }} />, bar: '#3b82f6', pct: 100 },
            { label: 'Forecast Pondéré', value: mad(kpis.weighted), sub: `${kpis.pipeline ? ((kpis.weighted/kpis.pipeline)*100).toFixed(0) : 0}% du pipeline`, icon: <Target style={{ width: 16, height: 16, color: '#8b5cf6' }} />, bar: '#8b5cf6', pct: kpis.pipeline ? (kpis.weighted/kpis.pipeline)*100 : 0 },
            { label: 'Commit', value: mad(kpis.commit), sub: 'Deals en commit', icon: <Zap style={{ width: 16, height: 16, color: '#f59e0b' }} />, bar: '#f59e0b', pct: kpis.pipeline ? (kpis.commit/kpis.pipeline)*100 : 0 },
            { label: 'Won', value: mad(kpis.won), sub: 'Deals gagnés', icon: <Trophy style={{ width: 16, height: 16, color: '#10b981' }} />, bar: '#10b981', pct: 100 },
          ].map(k => (
            <div key={k.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                {k.icon}
                <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{k.label}</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.3px' }}>{k.value}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{k.sub} MAD</div>
              <div style={{ height: 3, background: '#f1f5f9', borderRadius: 2, marginTop: 10 }}>
                <div style={{ height: '100%', width: `${Math.min(k.pct, 100)}%`, background: k.bar, borderRadius: 2, transition: 'width 0.6s ease' }} />
              </div>
            </div>
          ))}
        </div>

        {err && <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#dc2626', fontSize: 13 }}>{err}</div>}

        {/* Kanban Board */}
        <div className="pipe-scroll" style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 16, alignItems: 'flex-start' }}>
          {visibleStages.map(s => {
            const list = byStage.get(s.stage) ?? []
            const total = list.reduce((acc, x) => acc + Number(x.amount || 0), 0)
            const cfg = STAGE_CONFIG[s.stage] || DEFAULT_STAGE

            return (
              <div key={s.stage} style={{ flexShrink: 0, width: 260, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Column header */}
                <div style={{ background: cfg.light, border: `1px solid ${cfg.border}`, borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{s.stage}</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, background: '#fff', border: `1px solid ${cfg.border}`, borderRadius: 20, padding: '1px 8px' }}>
                      {list.length}
                    </span>
                  </div>
                  {total > 0 && (
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 3, fontWeight: 500 }}>
                      {madShort(total)} MAD
                    </div>
                  )}
                </div>

                {/* Cards */}
                {list.length === 0 ? (
                  <div style={{ border: '1px dashed #e2e8f0', borderRadius: 10, padding: '20px 12px', textAlign: 'center', fontSize: 11, color: '#cbd5e1' }}>
                    Aucun deal
                  </div>
                ) : (
                  list.map((o, i) => {
                    const prob = Number(o.prob ?? 0)
                    const buCfg = o.bu ? (BU_COLORS[o.bu] || { bg: '#f8fafc', text: '#64748b' }) : null

                    return (
                      <div key={o.id} className="pipe-card" style={{ animationDelay: `${i * 30}ms` }}>
                        {/* BU + Prob */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          {buCfg && o.bu ? (
                            <span style={{ fontSize: 10, fontWeight: 600, borderRadius: 6, padding: '2px 7px', background: buCfg.bg, color: buCfg.text }}>
                              {o.bu}
                            </span>
                          ) : <span />}
                          {prob > 0 && (
                            <span style={{ fontSize: 11, fontWeight: 700, color: prob >= 75 ? '#10b981' : prob >= 50 ? '#f59e0b' : '#94a3b8' }}>
                              {prob}%
                            </span>
                          )}
                        </div>

                        {/* Title */}
                        <Link href={`/opportunities?edit=${o.id}`} style={{ textDecoration: 'none' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', lineHeight: 1.4, marginBottom: 4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
                            className="hover:text-blue-600">
                            {o.title}
                          </div>
                        </Link>

                        {/* Account */}
                        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>{accountNameById(o.account_id)}</div>

                        {/* Amount */}
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                          {mad(o.amount)}
                          <span style={{ fontSize: 10, fontWeight: 400, color: '#cbd5e1', marginLeft: 3 }}>MAD</span>
                        </div>

                        {/* Prob bar */}
                        {prob > 0 && (
                          <div style={{ height: 3, background: '#f1f5f9', borderRadius: 2, marginTop: 8 }}>
                            <div style={{ height: '100%', width: `${prob}%`, background: prob >= 75 ? '#10b981' : prob >= 50 ? '#f59e0b' : '#3b82f6', borderRadius: 2 }} />
                          </div>
                        )}

                        {/* Closing */}
                        {o.booking_month && (
                          <div style={{ fontSize: 10, color: '#cbd5e1', marginTop: 6 }}>Closing : {o.booking_month}</div>
                        )}

                        {/* Next step */}
                        {o.next_step && (
                          <div style={{ marginTop: 8, padding: '5px 8px', borderRadius: 6, background: '#f8fafc', border: '1px solid #f1f5f9', fontSize: 10, color: '#94a3b8', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            → {o.next_step}
                          </div>
                        )}

                        {/* Stage selector */}
                        <select
                          value={o.stage}
                          onChange={e => updateStage(o.id, e.target.value, o.stage)}
                          className="stage-select"
                          onClick={e => e.stopPropagation()}
                        >
                          {stages.map(ss => <option key={ss.stage} value={ss.stage}>{ss.stage}</option>)}
                        </select>
                      </div>
                    )
                  })
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
