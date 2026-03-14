'use client'
import DealFormModal from '@/components/DealFormModal'

import { useEffect, useMemo, useRef, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { authFetch } from '@/lib/authFetch'
import { logActivity } from '@/lib/logActivity'
import { mad, fmt, STAGE_CFG as STAGE_STYLE, BU_BADGE_CLS as BU_COLOR, ownerName } from '@/lib/utils'
import { RefreshCw, Plus, Pencil, Eye, ChevronRight, TrendingUp, Target, Award, Clock, List, LayoutGrid, Trash2, X, AlertTriangle, Download } from 'lucide-react'
import Toast from '@/components/Toast'

// ─── Types ────────────────────────────────────────────────────────────────────
type DealRow = {
  id: string
  account_id: string
  title: string
  stage: string
  status: 'Open' | 'Won' | 'Lost'
  bu: string | null
  vendor: string | null
  amount: number
  prob: number | null
  booking_month: string | null
  next_step: string | null
  notes: string | null
  multi_bu: boolean | null
  bu_lines: any
  po_number?: string | null
  po_date?: string | null
  owner_email?: string | null
  owner_name?: string | null
  accounts?: { name?: string } | null
}

// ─── Constants ────────────────────────────────────────────────────────────────
const STAGES = ['Lead','Discovery','Qualified','Solutioning','Proposal Sent','Negotiation','Commit','Won','Lost / No decision'] as const
const STAGE_NEXT: Record<string, string> = {
  Lead: 'Discovery', Discovery: 'Qualified', Qualified: 'Solutioning',
  Solutioning: 'Proposal Sent', 'Proposal Sent': 'Negotiation',
  Negotiation: 'Commit', Commit: 'Won',
}
const STAGE_PROB: Record<string, number> = {
  Lead:10, Discovery:20, Qualified:40, Solutioning:55,
  'Proposal Sent':70, Negotiation:80, Commit:90, Won:100, 'Lost / No decision':0,
}
const BUS = ['HCI','Network','Storage','Cyber','Service','CSG'] as const
const PIPE_STAGES = ['Lead','Discovery','Qualified','Solutioning','Proposal Sent','Negotiation','Commit'] as const

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtAmt = fmt
function timeAgo(iso: string | null | undefined) {
  if (!iso) return null
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'à l\'instant'
  if (s < 3600) return `${Math.floor(s/60)}min`
  if (s < 86400) return `${Math.floor(s/3600)}h`
  const d = Math.floor(s/86400)
  return d === 1 ? 'hier' : `${d}j`
}

function StageBadge({ stage }: { stage: string }) {
  const c = STAGE_STYLE[stage] || STAGE_STYLE.Lead
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />{stage}
    </span>
  )
}

function BuBadge({ bu, buLines }: { bu: string | null; buLines?: any }) {
  if (!bu) return <span className="text-slate-400">—</span>
  if (bu === 'MULTI' && Array.isArray(buLines) && buLines.length > 0) {
    const cartes = [...new Set(buLines.map((l: any) => l.bu || l.card).filter(Boolean))]
    const label = cartes.join(' + ')
    const tip = buLines.map((l: any) => {
      const amt = Number(l.amount || 0)
      const k = amt >= 1_000_000 ? `${(amt/1_000_000).toFixed(1)}M` : amt >= 1000 ? `${Math.round(amt/1000)}K` : String(Math.round(amt))
      return `${l.card || l.bu || '?'} — ${k} MAD`
    }).join('\n')
    return (
      <span className="group relative inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold bg-gradient-to-r from-indigo-50 to-violet-50 text-indigo-700 cursor-default">
        {label}
        <span className="pointer-events-none absolute bottom-full left-0 mb-1 z-50 hidden group-hover:block w-max max-w-[260px] rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium text-white shadow-lg whitespace-pre-wrap">
          {tip}
        </span>
      </span>
    )
  }
  const cls = BU_COLOR[bu] || 'bg-slate-100 text-slate-600'
  return <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${cls}`}>{bu}</span>
}

function ProbBar({ prob }: { prob: number }) {
  const color = prob>=80?'bg-emerald-500':prob>=60?'bg-amber-400':prob>=30?'bg-orange-400':'bg-slate-300'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width:`${prob}%` }} />
      </div>
      <span className="text-xs text-slate-500 tabular-nums">{prob}%</span>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function PipelineContent() {
  const searchParams = useSearchParams()

  const [showNewDeal, setShowNewDeal] = useState(false)
  const [editRow, setEditRow] = useState<any>(null)
  const [rows, setRows]         = useState<DealRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [err, setErr]           = useState<string | null>(null)
  const [info, setInfo]         = useState<{ msg: string; ok: boolean } | null>(null)
  const [view, setView]         = useState<'list' | 'kanban'>('list')

  // Filters — accountFilter initialisé depuis ?account= si présent
  const [stageFilter, setStageFilter] = useState<string>('Tous')
  const [buFilter, setBuFilter]       = useState<string>('Tous')
  const [search, setSearch]           = useState('')
  const [accountFilter, setAccountFilter] = useState<string>(() => searchParams.get('account') || 'Tous')
  const [vendorFilter, setVendorFilter]   = useState<string>('Tous')
  const [ownerFilter, setOwnerFilter]     = useState<string>('Tous')
  const [dragId, setDragId]           = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)
  const [sortCol, setSortCol]         = useState<'amount'|'prob'|'booking_month'|'stage'|'account'|'vendor'>('booking_month')
  // Period filter
  const thisYear = new Date().getFullYear()
  const [yearFilter, setYearFilter]     = useState<number | 'Tous'>(thisYear)
  const [quarterFilter, setQuarterFilter] = useState<1|2|3|4|'Tous'>('Tous')
  const [sortAsc, setSortAsc]         = useState(true)

  useEffect(() => { document.title = 'Pipeline \u00b7 CRM-PIPE' }, [])

  // Sync si navigation back/forward change le param URL
  useEffect(() => {
    const acc = searchParams.get('account')
    if (acc) setAccountFilter(acc)
    else setAccountFilter('Tous')
  }, [searchParams])

  async function load() {
    setLoading(true); setErr(null)
    const { data, error } = await supabase.from('opportunities').select('*,accounts(name)').order('created_at', { ascending:false }).limit(5000)
    if (error) { setErr(error.message); setLoading(false); return }
    setRows((data as DealRow[])||[])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function toast(msg: string, ok = true) { setInfo({ msg, ok }) }

  async function advanceStage(deal: DealRow) {
    const next = STAGE_NEXT[deal.stage]; if (!next) return
    if (next === 'Won') {
      if (!confirm(`⚠️ Marquer "${deal.title}" comme WON ?

Cette action changera le statut en Won. Un numéro de PO sera requis.`)) return
    }
    const { error } = await supabase.from('opportunities').update({
      stage: next, status: next==='Won'?'Won':'Open', prob: STAGE_PROB[next]??deal.prob
    }).eq('id', deal.id)
    if (error) { setErr(error.message); return }

    // Supply order is created when user clicks "Placer la commande" on the purchase form
    await logActivity({
      action_type: next === 'Won' ? 'won' : 'stage',
      entity_type: 'deal',
      entity_id: deal.id,
      entity_name: deal.title,
      detail: `${deal.stage} → ${next}`,
    })
    toast(`${deal.title} → ${next}`); load()
  }

  // Undo delete state
  const [undoToast, setUndoToast] = useState<{ deal: DealRow; timer: ReturnType<typeof setTimeout> } | null>(null)
  const undoCancelled = useRef(false)

  function deleteDeal(deal: DealRow) {
    if (!confirm(`Supprimer "${deal.title}" ? Tu pourras annuler pendant 8 secondes.`)) return
    setRows(prev => prev.filter(r => r.id !== deal.id))
    undoCancelled.current = false
    const timer = setTimeout(async () => {
      if (undoCancelled.current) return
      // Cascade: supprimer les données liées avant l'opportunité
      const { data: piRows } = await supabase.from('purchase_info').select('id').eq('opportunity_id', deal.id)
      const piIds = (piRows || []).map((r: any) => r.id)
      // Delete supply_order via API (bypasses RLS)
      const supplyRes = await authFetch('/api/supply').then(r => r.json()).catch(() => ({ orders: [] }))
      const supplyOrder = (supplyRes?.orders || []).find((o: any) => o.opportunity_id === deal.id)
      await Promise.all([
        supabase.from('deal_files').delete().eq('opportunity_id', deal.id),
        supplyOrder ? authFetch(`/api/supply?orderId=${supplyOrder.id}`, { method: 'DELETE' }) : Promise.resolve(),
        supabase.from('project_services').delete().eq('opportunity_id', deal.id),
        supabase.from('deal_registrations').delete().eq('opportunity_id', deal.id),
        supabase.from('invoices').delete().eq('opportunity_id', deal.id),
        supabase.from('support_tickets').delete().eq('opportunity_id', deal.id),
        ...(piIds.length ? [supabase.from('purchase_lines').delete().in('purchase_info_id', piIds)] : []),
      ])
      if (piIds.length) await supabase.from('purchase_info').delete().eq('opportunity_id', deal.id)
      const { error } = await supabase.from('opportunities').delete().eq('id', deal.id)
      if (error) { setRows(prev => [deal, ...prev]); setErr(error.message); setUndoToast(null); return }
      await logActivity({ action_type: 'delete', entity_type: 'deal', entity_id: deal.id, entity_name: deal.title,
        detail: `${deal.stage} · ${deal.bu || ''} · ${deal.amount ? deal.amount + ' MAD' : ''}`.trim() })
      setUndoToast(null)
    }, 8000)
    setUndoToast({ deal, timer })
  }

  function undoDelete() {
    if (!undoToast) return
    undoCancelled.current = true
    clearTimeout(undoToast.timer)
    setRows(prev => [undoToast.deal, ...prev])
    setUndoToast(null)
  }

  async function handleDrop(targetStage: string) {
    setDragOverStage(null)
    if (!dragId) return
    const deal = rows.find(r => r.id === dragId)
    if (!deal || deal.stage === targetStage) { setDragId(null); return }
    // Confirmation for Won
    if (targetStage === 'Won') {
      if (!confirm(`⚠️ Marquer "${deal.title}" comme WON ?`)) { setDragId(null); return }
    }
    if (targetStage === 'Lost / No decision') {
      if (!confirm(`Marquer "${deal.title}" comme Lost ?`)) { setDragId(null); return }
    }
    const newStatus = targetStage === 'Won' ? 'Won' : targetStage === 'Lost / No decision' ? 'Lost' : 'Open'
    const { error } = await supabase.from('opportunities').update({
      stage: targetStage, status: newStatus, prob: STAGE_PROB[targetStage] ?? deal.prob
    }).eq('id', deal.id)
    if (error) { setErr(error.message); setDragId(null); return }
    // Supply order is created when user clicks "Placer la commande" on the purchase form
    await logActivity({
      action_type: targetStage === 'Won' ? 'won' : 'stage',
      entity_type: 'deal', entity_id: deal.id, entity_name: deal.title,
      detail: `${deal.stage} → ${targetStage} (drag)`,
    })
    setDragId(null)
    toast(`${deal.title} → ${targetStage}`)
    load()
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const open = rows.filter(r => r.status==='Open')
    const won  = rows.filter(r => r.status==='Won')
    const lost = rows.filter(r => r.status==='Lost')
    const now  = new Date()
    const thisM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
    const nextM = now.getMonth()===11
      ? `${now.getFullYear()+1}-01`
      : `${now.getFullYear()}-${String(now.getMonth()+2).padStart(2,'0')}`
    const urgent = open.filter(r => r.booking_month===thisM||r.booking_month===nextM)
    const overdue = open.filter(r => r.booking_month && r.booking_month < thisM)
    const bySt = Object.fromEntries(STAGES.map(s => [s, { count:0, amount:0 }]))
    open.forEach(r => {
      const k = r.stage||'Lead'
      if (!bySt[k]) bySt[k] = { count:0, amount:0 }
      bySt[k].count++; bySt[k].amount += Number(r.amount||0)
    })
    return {
      totalOpen: open.length,
      totalWon: won.length,
      totalLost: lost.length,
      pipeline: open.reduce((s,r)=>s+Number(r.amount||0),0),
      forecast: open.reduce((s,r)=>s+Number(r.amount||0)*(Number(r.prob||0)/100),0),
      wonTotal: won.reduce((s,r)=>s+Number(r.amount||0),0),
      urgentCount: urgent.length,
      urgentAmount: urgent.reduce((s,r)=>s+Number(r.amount||0),0),
      winRate: won.length+lost.length>0 ? Math.round(won.length/(won.length+lost.length)*100) : 0,
      bySt,
      overdueCount: overdue.length,
      overdueAmount: overdue.reduce((s,r)=>s+Number(r.amount||0),0),
    }
  }, [rows])

  // ── Filtered rows ──────────────────────────────────────────────────────────
  // Computed lists for dropdowns
  const accountOptions = useMemo(() => {
    const names = [...new Set(rows.map(r => r.accounts?.name||'').filter(Boolean))].sort()
    return ['Tous', ...names]
  }, [rows])

  const vendorOptions = useMemo(() => {
    const vendors = [...new Set(rows.map(r => r.vendor||'').filter(v => v && v !== 'MULTI'))].sort()
    const hasMulti = rows.some(r => r.multi_bu)
    return ['Tous', ...vendors, ...(hasMulti ? ['Multi-BU'] : [])]
  }, [rows])

  const ownerOptions = useMemo(() => {
    const emails = [...new Set(rows.map(r => r.owner_email||'').filter(Boolean))].sort()
    return ['Tous', ...emails]
  }, [rows])

  const displayRows = useMemo(() => {
    let r = [...rows]
    // Status / Stage filter
    if (stageFilter==='Open')  r = r.filter(x => x.status==='Open')
    else if (stageFilter==='Won')  r = r.filter(x => x.status==='Won')
    else if (stageFilter==='Lost') r = r.filter(x => x.status==='Lost')
    else if (stageFilter==='Overdue') {
      const now = new Date()
      const curM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
      r = r.filter(x => x.status==='Open' && x.booking_month && x.booking_month < curM)
    }
    else if (stageFilter!=='Tous') r = r.filter(x => x.stage===stageFilter)
    // BU filter
    if (buFilter!=='Tous') r = r.filter(x => x.bu===buFilter||(x.multi_bu&&buFilter==='MULTI'))
    // Account filter
    if (accountFilter!=='Tous') r = r.filter(x => (x.accounts?.name||'')=== accountFilter)
    // Vendor filter
    if (vendorFilter!=='Tous') r = r.filter(x => vendorFilter==='Multi-BU' ? (x.multi_bu===true) : (x.vendor||'')=== vendorFilter)
    // Owner filter
    if (ownerFilter!=='Tous') r = r.filter(x => (x.owner_email||'') === ownerFilter)
    // Period filter on booking_month
    if (yearFilter !== 'Tous') {
      const y = String(yearFilter)
      r = r.filter(x => {
        const bm = x.booking_month || ''
        if (!bm.startsWith(y)) return false
        if (quarterFilter !== 'Tous') {
          const month = parseInt(bm.slice(5, 7), 10)
          const q = Math.ceil(month / 3)
          return q === quarterFilter
        }
        return true
      })
    }
    // Search
    const q = search.trim().toLowerCase()
    if (q) r = r.filter(x =>
      (x.accounts?.name||'').toLowerCase().includes(q)||
      (x.title||'').toLowerCase().includes(q)||
      (x.vendor||'').toLowerCase().includes(q)
    )
    r.sort((a,b) => {
      let av:any,bv:any
      if (sortCol==='amount') { av=a.amount; bv=b.amount }
      else if (sortCol==='prob') { av=a.prob||0; bv=b.prob||0 }
      else if (sortCol==='booking_month') { av=a.booking_month||''; bv=b.booking_month||'' }
      else if (sortCol==='account') { av=(a.accounts?.name||'').toLowerCase(); bv=(b.accounts?.name||'').toLowerCase() }
      else if (sortCol==='vendor') { av=(a.vendor||'').toLowerCase(); bv=(b.vendor||'').toLowerCase() }
      else { av=STAGES.indexOf(a.stage as any); bv=STAGES.indexOf(b.stage as any) }
      return sortAsc?(av>bv?1:-1):(av<bv?1:-1)
    })
    return r
  }, [rows, stageFilter, buFilter, accountFilter, vendorFilter, ownerFilter, yearFilter, quarterFilter, search, sortCol, sortAsc])

  function toggleSort(col: 'amount'|'prob'|'booking_month'|'stage'|'account'|'vendor') {
    if (sortCol===col) setSortAsc(p=>!p)
    else { setSortCol(col); setSortAsc(false) }
  }
  const si = (col: 'amount'|'prob'|'booking_month'|'stage'|'account'|'vendor') => (
    <span className={`text-xs ml-0.5 ${sortCol===col ? 'text-slate-800 font-bold' : 'text-slate-300'}`}>
      {sortCol===col ? (sortAsc ? '↑' : '↓') : '↕'}
    </span>
  )

  const [exporting, setExporting] = useState(false)
  async function exportExcel() {
    setExporting(true)
    try {
      const totalAmt = displayRows.reduce((s,d)=>s+(Number(d.amount)||0),0)
      const forecastAmt = displayRows.reduce((s,d)=>s+(Number(d.amount)||0)*((d.prob||0)/100),0)

      // Stage breakdown
      const stageMap = new Map<string, { count: number; amount: number }>()
      displayRows.forEach(d => {
        const st = d.stage || 'Lead'
        const prev = stageMap.get(st) || { count: 0, amount: 0 }
        stageMap.set(st, { count: prev.count + 1, amount: prev.amount + (Number(d.amount) || 0) })
      })

      const spec = {
        filename: `pipeline_${new Date().toISOString().slice(0,10)}.xlsx`,
        sheets: [{
          name: 'Pipeline',
          title: `Pipeline · ${displayRows.length} deals · ${new Date().toLocaleDateString('fr-MA')}`,
          headers: ['Client','Deal','Étape','Statut','BU','Carte','Montant (MAD)','Prob %','Forecast (MAD)','Closing','Owner','Next Step'],
          rows: displayRows.map(d => [
            d.accounts?.name||'—', d.title||'—', d.stage||'Lead', d.status||'Open', d.bu||'—',
            d.vendor||'—', d.amount||0, d.prob||0,
            Math.round((d.amount||0)*((d.prob||0)/100)),
            d.booking_month||'—', ownerName(d.owner_email),
            d.next_step||'—',
          ]),
          totalsRow: ['TOTAL', `${displayRows.length} deals`, '', '', '', '', totalAmt, '', Math.round(forecastAmt), '', '', ''],
          notes: `Pipeline total: ${mad(totalAmt)} · Forecast pondéré: ${mad(forecastAmt)}`,
        }],
        summary: {
          title: `Résumé Pipeline · ${new Date().toLocaleDateString('fr-MA')}`,
          kpis: [
            { label: 'Deals en pipeline', value: displayRows.length, detail: 'Opportunités actives' },
            { label: 'Pipeline total', value: totalAmt, detail: 'Montant total' },
            { label: 'Forecast pondéré', value: Math.round(forecastAmt), detail: 'Montant × probabilité' },
            { label: 'Ticket moyen', value: displayRows.length > 0 ? Math.round(totalAmt / displayRows.length) : 0, detail: 'Pipeline / nb deals' },
          ],
          breakdownTitle: 'Répartition par étape',
          breakdownHeaders: ['Étape', 'Montant (MAD)', 'Nb deals', '% du pipeline'],
          breakdown: [...stageMap.entries()].map(([stage, v]) => [
            stage, v.amount, v.count, totalAmt > 0 ? `${Math.round(v.amount / totalAmt * 100)}%` : '0%',
          ]),
        },
      }
      const res = await authFetch('/api/excel', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(spec) })
      if (!res.ok) throw new Error('Export échoué')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href=url; a.download=spec.filename; a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) { alert(e?.message||'Erreur export') }
    finally { setExporting(false) }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1500px] px-4 py-6">

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-500 text-white shadow-lg">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-black text-slate-900 tracking-tight">Pipeline</div>
              <div className="text-xs text-slate-500">
                Suivi visuel & progression — {rows.filter(r=>r.status==='Open').length} deals ouverts · Drag & drop pour avancer
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={exportExcel} disabled={exporting}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 shadow-sm disabled:opacity-60">
              <Download className="h-4 w-4" /> {exporting ? 'Export…' : 'Excel'}
            </button>
            <Link href="/opportunities" className="inline-flex h-9 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition-colors shadow-sm">
              <Eye className="h-4 w-4" /> Gestion détaillée
            </Link>
            <button onClick={load} disabled={loading}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 shadow-sm">
              <RefreshCw className={`h-4 w-4 ${loading?'animate-spin':''}`} />
            </button>
          </div>
        </div>

        {/* ── Visual Funnel ── */}
        {stats.totalOpen > 0 && (
          <div className="rounded-2xl bg-white ring-1 ring-slate-200/80 shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100">
              <div className="h-5 w-1 rounded-full bg-gradient-to-b from-blue-500 to-violet-500 shrink-0"/>
              <span className="text-sm font-bold text-slate-900">Funnel Pipeline</span>
              <span className="text-xs text-slate-400">Montant par étape</span>
            </div>
            <div className="px-5 py-4">
              <div className="flex items-end gap-1">
                {PIPE_STAGES.map(stage => {
                  const d = stats.bySt[stage] || { count:0, amount:0 }
                  const maxAmt = Math.max(...PIPE_STAGES.map(s => stats.bySt[s]?.amount || 0), 1)
                  const pct = Math.max(8, (d.amount / maxAmt) * 100)
                  const st = STAGE_STYLE[stage] || STAGE_STYLE.Lead
                  return (
                    <div key={stage} className="flex-1 flex flex-col items-center gap-1.5 group">
                      <div className="text-[10px] font-bold text-slate-600 tabular-nums">{fmtAmt(d.amount)}</div>
                      <div className={`w-full rounded-t-lg transition-all ${st.bg} border ${st.border} group-hover:opacity-80`}
                        style={{ height: `${pct}px`, minHeight: 8, maxHeight: 100 }} />
                      <div className={`text-[9px] font-bold text-center leading-tight ${st.text}`}>{stage.replace('Proposal Sent','Proposal')}</div>
                      <div className="text-[10px] font-semibold text-slate-400">{d.count}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {err  && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
        {info && <Toast message={info.msg} type={info.ok ? 'success' : 'error'} onClose={() => setInfo(null)} />}

        {/* Bandeau filtre compte actif (depuis Comptes) */}
        {accountFilter !== 'Tous' && searchParams.get('account') && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5">
            <span className="text-xs font-semibold text-blue-700">
              🏢 Pipeline filtré pour : <span className="font-black">{accountFilter}</span>
            </span>
            <button
              onClick={() => setAccountFilter('Tous')}
              className="ml-auto inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
            >
              <X className="h-3 w-3" /> Voir tout le pipeline
            </button>
          </div>
        )}

        {/* Overdue alert */}
        {stats.overdueCount > 0 && stageFilter !== 'Overdue' && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5">
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
            <span className="text-xs font-semibold text-red-700">
              {stats.overdueCount} deal{stats.overdueCount > 1 ? 's' : ''} en retard ({mad(stats.overdueAmount)}) — closing dépassé
            </span>
            <button
              onClick={() => setStageFilter('Overdue')}
              className="ml-auto inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors"
            >
              Voir les retards
            </button>
          </div>
        )}

        {/* KPIs */}
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400 uppercase tracking-wide">
              <TrendingUp className="h-3.5 w-3.5" /> Pipeline actif
            </div>
            <div className="text-xl font-bold text-slate-900">{mad(stats.pipeline)}</div>
            <div className="mt-1 text-xs text-slate-500">{stats.totalOpen} deals ouverts</div>
          </div>
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400 uppercase tracking-wide">
              <Target className="h-3.5 w-3.5" /> Forecast pondéré
            </div>
            <div className="text-xl font-bold text-violet-700">{mad(stats.forecast)}</div>
            <div className="mt-1 text-xs text-slate-500">Prob × Montant</div>
          </div>
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400 uppercase tracking-wide">
              <Award className="h-3.5 w-3.5" /> Won (PO reçus)
            </div>
            <div className="text-xl font-bold text-emerald-700">{mad(stats.wonTotal)}</div>
            <div className="mt-1 text-xs text-slate-500">{stats.totalWon} deals · Win rate {stats.winRate}%</div>
          </div>
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400 uppercase tracking-wide">
              <Clock className="h-3.5 w-3.5" /> Closing imminent
            </div>
            <div className="text-xl font-bold text-orange-600">{mad(stats.urgentAmount)}</div>
            <div className="mt-1 text-xs text-slate-500">{stats.urgentCount} deals ce mois / mois prochain</div>
          </div>
        </div>

        {/* Funnel cliquable */}
        <div className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Funnel par étape</div>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {PIPE_STAGES.map(s => {
              const d = stats.bySt[s]||{ count:0, amount:0 }
              const c = STAGE_STYLE[s]
              const isActive = stageFilter===s
              return (
                <button key={s}
                  onClick={() => setStageFilter(isActive?'Tous':s)}
                  className={`flex-1 min-w-[90px] rounded-xl border px-3 py-2.5 text-left transition-all hover:shadow-sm
                    ${isActive ? `${c.bg} ${c.border} ${c.text}` : 'border-slate-100 hover:border-slate-200'}`}>
                  <div className={`text-[10px] font-semibold uppercase tracking-wide truncate ${isActive?c.text:'text-slate-400'}`}>{s}</div>
                  <div className={`mt-0.5 text-lg font-bold ${isActive?c.text:'text-slate-700'}`}>{d.count}</div>
                  <div className={`text-[10px] tabular-nums ${isActive?c.text:'text-slate-400'}`}>
                    {d.amount>0 ? `${fmtAmt(d.amount)} MAD` : '—'}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Toolbar */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {/* Status */}
          <div className="flex gap-1 rounded-xl border bg-white p-1 shadow-sm">
            {[
              { key:'Tous', label:`Tous (${rows.length})` },
              { key:'Open',  label:`Open (${stats.totalOpen})` },
              { key:'Won',   label:`Won (${stats.totalWon})` },
              { key:'Lost',  label:`Lost (${stats.totalLost})` },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setStageFilter(key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors
                  ${stageFilter===key
                    ? key==='Won'?'bg-emerald-600 text-white':key==='Lost'?'bg-red-600 text-white':'bg-slate-900 text-white'
                    : 'text-slate-500 hover:bg-slate-50'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* Stage filter - pipeline order */}
          <div className="flex gap-1 rounded-xl border bg-white p-1 shadow-sm overflow-x-auto">
            {['Tous',...STAGES].map(s => {
              const st = STAGE_STYLE[s]
              const isActive = stageFilter===s
              return (
                <button key={s} onClick={() => setStageFilter(s)}
                  className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors
                    ${isActive
                      ? s==='Won'?'bg-emerald-600 text-white':s.includes('Lost')?'bg-red-600 text-white':'bg-slate-900 text-white'
                      : 'text-slate-500 hover:bg-slate-50'}`}>
                  {s==='Tous' ? 'Toutes étapes' : s}
                </button>
              )
            })}
          </div>

          {/* BU */}
          <div className="flex gap-1 rounded-xl border bg-white p-1 shadow-sm">
            {['Tous',...BUS].map(b => (
              <button key={b} onClick={() => setBuFilter(b)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors
                  ${buFilter===b?'bg-slate-900 text-white':'text-slate-500 hover:bg-slate-50'}`}>{b}</button>
            ))}
          </div>

          {/* Compte */}
          <select value={accountFilter} onChange={e => setAccountFilter(e.target.value)}
            className="h-9 rounded-xl border bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm outline-none cursor-pointer">
            {accountOptions.map(a => <option key={a} value={a}>{a==='Tous'?'Tous comptes':a}</option>)}
          </select>

          {/* Vendor / Carte */}
          <select value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}
            className="h-9 rounded-xl border bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm outline-none cursor-pointer">
            {vendorOptions.map(v => <option key={v} value={v}>{v==='Tous'?'Tous vendors':v}</option>)}
          </select>

          {/* Owner / AE */}
          <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}
            className="h-9 rounded-xl border bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm outline-none cursor-pointer">
            {ownerOptions.map(o => (
              <option key={o} value={o}>
                {o === 'Tous' ? 'Tous AE' : ownerName(o)}
              </option>
            ))}
          </select>

          {/* Search */}
          <div className="flex h-9 items-center gap-2 rounded-xl border bg-white px-3 shadow-sm">
            <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Compte, titre, vendor…"
              className="w-48 bg-transparent text-sm outline-none placeholder:text-slate-400" />
          </div>

          {/* Année */}
          <div className="flex rounded-xl border bg-white p-0.5 shadow-sm">
            {([thisYear - 1, thisYear, thisYear + 1] as const).map(y => (
              <button key={y} onClick={() => { setYearFilter(yearFilter === y ? 'Tous' : y); setQuarterFilter('Tous') }}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors
                  ${yearFilter === y ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                {y}
              </button>
            ))}
            <button onClick={() => { setYearFilter('Tous'); setQuarterFilter('Tous') }}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors
                ${yearFilter === 'Tous' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              Tout
            </button>
          </div>

          {/* Trimestre */}
          {yearFilter !== 'Tous' && (
            <div className="flex rounded-xl border bg-white p-0.5 shadow-sm">
              {([1,2,3,4] as const).map(q => (
                <button key={q} onClick={() => setQuarterFilter(quarterFilter === q ? 'Tous' : q)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors
                    ${quarterFilter === q ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                  Q{q}
                </button>
              ))}
            </div>
          )}

          {/* View toggle */}
          <div className="ml-auto flex gap-1 rounded-xl border bg-white p-1 shadow-sm">
            <button onClick={() => setView('list')}
              className={`inline-flex h-7 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors
                ${view==='list'?'bg-slate-900 text-white':'text-slate-500 hover:bg-slate-50'}`}>
              <List className="h-3.5 w-3.5" /> Liste
            </button>
            <button onClick={() => setView('kanban')}
              className={`inline-flex h-7 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors
                ${view==='kanban'?'bg-slate-900 text-white':'text-slate-500 hover:bg-slate-50'}`}>
              <LayoutGrid className="h-3.5 w-3.5" /> Kanban
            </button>
          </div>

          <div className="text-xs text-slate-400">{displayRows.length} résultat{displayRows.length>1?'s':''}</div>
        </div>

        {/* ── LIST ─────────────────────────────────────────────────────────── */}
        {view === 'list' && (
          <div className="mt-3 rounded-2xl border bg-white shadow-sm overflow-hidden">
            <div className="overflow-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-xs text-slate-500">
                    <th className="px-4 py-3 text-left font-semibold cursor-pointer select-none hover:text-slate-800 hover:bg-slate-100 transition-colors" onClick={()=>toggleSort('account')}>
                      <div className="flex items-center gap-1">Compte {si('account')}</div>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">Deal</th>
                    <th className="px-4 py-3 text-left font-semibold cursor-pointer select-none hover:text-slate-800 hover:bg-slate-100 transition-colors" onClick={()=>toggleSort('stage')}>
                      <div className="flex items-center gap-1">Étape {si('stage')}</div>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">BU</th>
                    <th className="px-4 py-3 text-left font-semibold cursor-pointer select-none hover:text-slate-800 hover:bg-slate-100 transition-colors" onClick={()=>toggleSort('vendor')}>
                      <div className="flex items-center gap-1">Vendor {si('vendor')}</div>
                    </th>
                    <th className="px-4 py-3 text-right font-semibold cursor-pointer select-none hover:text-slate-800 hover:bg-slate-100 transition-colors" onClick={()=>toggleSort('amount')}>
                      <div className="flex items-center justify-end gap-1">Montant {si('amount')}</div>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold cursor-pointer select-none hover:text-slate-800 hover:bg-slate-100 transition-colors" onClick={()=>toggleSort('prob')}>
                      <div className="flex items-center gap-1">Prob {si('prob')}</div>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold cursor-pointer select-none hover:text-slate-800 hover:bg-slate-100 transition-colors" onClick={()=>toggleSort('booking_month')}>
                      <div className="flex items-center gap-1">Closing {si('booking_month')}</div>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">Next Step</th>
                    <th className="px-4 py-3 text-left font-semibold">PO</th>
                    <th className="px-4 py-3 text-left font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr><td colSpan={11} className="py-16 text-center text-sm text-slate-400">
                      <div className="flex items-center justify-center gap-2"><RefreshCw className="h-4 w-4 animate-spin" /> Chargement…</div>
                    </td></tr>
                  ) : displayRows.length===0 ? (
                    <tr><td colSpan={11} className="py-12 text-center text-sm text-slate-400">Aucun deal.</td></tr>
                  ) : displayRows.map(r => {
                    const now = new Date()
                    const thisM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
                    const isUrgent = r.booking_month===thisM
                    const isPast = r.booking_month&&r.booking_month<thisM&&r.status==='Open'
                    const vendorLabel = r.multi_bu&&Array.isArray(r.bu_lines)&&r.bu_lines.length>0
                      ? r.bu_lines.map((l:any)=>l.card).filter(Boolean).join(', ')||r.vendor||'—'
                      : r.vendor||'—'
                    return (
                      <tr key={r.id} className="group hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-900">{r.accounts?.name||'—'}</td>
                        <td className="px-4 py-3 max-w-[200px]">
                          <Link href={`/opportunities/${r.id}`}
                            className="block truncate font-medium text-slate-800 hover:text-slate-900 hover:underline" title={r.title}>
                            {r.title}
                          </Link>
                          {timeAgo((r as any).updated_at) && (
                            <div className="text-[10px] text-slate-300 mt-0.5"><Clock className="inline h-2.5 w-2.5 mr-0.5 -mt-px"/>{timeAgo((r as any).updated_at)}</div>
                          )}
                        </td>
                        <td className="px-4 py-3"><StageBadge stage={r.stage} /></td>
                        <td className="px-4 py-3"><BuBadge bu={r.multi_bu?'MULTI':r.bu} buLines={r.bu_lines} /></td>
                        <td className="px-4 py-3 max-w-[140px] overflow-hidden">
                          <div className="truncate text-xs text-slate-700" title={vendorLabel}>{vendorLabel}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums">{mad(Number(r.amount||0))}</td>
                        <td className="px-4 py-3"><ProbBar prob={Number(r.prob||0)} /></td>
                        <td className="px-4 py-3">
                          <span className={`whitespace-nowrap text-xs font-semibold tabular-nums
                            ${isPast?'text-red-600':isUrgent?'text-orange-600':'text-slate-600'}`}>
                            {isPast?'⚠ ':isUrgent?'🔥 ':''}{r.booking_month||'—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-[160px]">
                          <div className="truncate text-xs text-slate-500">{r.next_step||<span className="italic text-slate-300">—</span>}</div>
                        </td>
                        <td className="px-4 py-3">
                          {r.po_number ? (
                            <div>
                              <div className="text-xs font-semibold text-emerald-700">{r.po_number}</div>
                              {r.po_date && <div className="text-[10px] text-slate-400">{new Date(r.po_date).toLocaleDateString('fr-MA')}</div>}
                            </div>
                          ) : r.status === 'Won' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 border border-orange-200 px-2 py-0.5 text-[10px] font-bold text-orange-600">
                              ⚠ PO manquant
                            </span>
                          ) : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Link href={`/opportunities/${r.id}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border text-slate-500 hover:bg-slate-100" title="Voir détails">
                              <Eye className="h-3.5 w-3.5" />
                            </Link>
                            <button onClick={() => setEditRow(r)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border text-slate-500 hover:bg-slate-100" title="Modifier">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => deleteDeal(r)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border text-red-300 hover:bg-red-50 hover:text-red-600" title="Supprimer">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {displayRows.length>0 && (
              <div className="flex items-center justify-between border-t bg-slate-50/50 px-4 py-2.5">
                <div className="text-xs text-slate-400">{displayRows.length} deal{displayRows.length>1?'s':''}</div>
                <div className="flex gap-4 text-xs text-slate-500">
                  <span>Total: <strong className="text-slate-800">{mad(displayRows.reduce((s,r)=>s+Number(r.amount||0),0))}</strong></span>
                  <span>Forecast: <strong className="text-violet-700">{mad(displayRows.reduce((s,r)=>s+Number(r.amount||0)*(Number(r.prob||0)/100),0))}</strong></span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── KANBAN ───────────────────────────────────────────────────────── */}
        {view === 'kanban' && (
          <div className="mt-3 flex gap-3 overflow-x-auto pb-4">
            {(['Lead','Discovery','Qualified','Solutioning','Proposal Sent','Negotiation','Commit','Won','Lost / No decision'] as const).map(stage => {
              const cards = displayRows.filter(r => r.stage===stage)
              const st = STAGE_STYLE[stage]
              const colAmt = cards.reduce((s,r)=>s+Number(r.amount||0),0)
              return (
                <div key={stage} className={`min-w-[240px] w-[240px] flex-shrink-0 rounded-2xl transition-colors ${dragOverStage===stage?'bg-blue-50 ring-2 ring-blue-300':''}`}
                  onDragOver={e => { e.preventDefault(); setDragOverStage(stage) }}
                  onDragLeave={() => setDragOverStage(null)}
                  onDrop={e => { e.preventDefault(); handleDrop(stage) }}>
                  <div className={`mb-2 rounded-xl border px-3 py-2 ${st.bg} ${st.border}`}>
                    <div className="flex items-center justify-between">
                      <div className={`flex items-center gap-1.5 text-xs font-bold ${st.text}`}>
                        <span className={`h-2 w-2 rounded-full ${st.dot}`} />{stage}
                      </div>
                      <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${st.bg} ${st.text}`}>{cards.length}</span>
                    </div>
                    {colAmt>0 && (
                      <div className={`mt-0.5 text-[11px] tabular-nums font-semibold ${st.text} opacity-70`}>{fmtAmt(colAmt)} MAD</div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    {cards.map(r => {
                      const now = new Date()
                      const thisM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
                      const isUrgent = r.booking_month===thisM
                      const isPast = r.booking_month&&r.booking_month<thisM&&r.status==='Open'
                      return (
                        <div key={r.id}
                          draggable
                          onDragStart={() => setDragId(r.id)}
                          onDragEnd={() => { setDragId(null); setDragOverStage(null) }}
                          className={`rounded-xl border bg-white p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing
                          ${dragId===r.id?'opacity-50 ring-2 ring-blue-400':''}
                          ${r.status==='Won'&&!r.po_number?'border-orange-300':isPast?'border-red-200':'border-slate-100'}`}>
                          <div className="font-semibold text-slate-900 text-xs leading-tight">{r.accounts?.name||'—'}</div>
                          <Link href={`/opportunities/${r.id}`}
                            className="mt-0.5 block truncate text-[11px] text-slate-500 hover:text-blue-600 hover:underline"
                            title={r.title}>{r.title}</Link>

                          <div className="mt-2 flex items-center justify-between gap-2">
                            <BuBadge bu={r.multi_bu?'MULTI':r.bu} buLines={r.bu_lines} />
                            <span className="text-xs font-bold text-slate-900 tabular-nums">{fmtAmt(Number(r.amount||0))} MAD</span>
                          </div>

                          <div className="mt-1.5">
                            <ProbBar prob={Number(r.prob||0)} />
                          </div>

                          {r.booking_month && (
                            <div className={`mt-1 text-[11px] font-semibold ${isPast?'text-red-600':isUrgent?'text-orange-600':'text-slate-400'}`}>
                              {isPast?'⚠ ':isUrgent?'🔥 ':''}{r.booking_month}
                            </div>
                          )}

                          {r.next_step && (
                            <div className="mt-1 text-[11px] text-slate-400 italic truncate">{r.next_step}</div>
                          )}

                          {r.po_number ? (
                            <div className="mt-1 text-[11px] font-semibold text-emerald-700">PO: {r.po_number}</div>
                          ) : r.status === 'Won' && (
                            <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-orange-50 border border-orange-200 px-1.5 py-0.5 text-[10px] font-bold text-orange-600">
                              ⚠ PO manquant
                            </div>
                          )}

                          <div className="mt-2 flex items-center gap-1.5 border-t pt-2">
                            {timeAgo((r as any).updated_at) && (
                              <span className="text-[10px] text-slate-300 mr-auto" title={`Modifié ${new Date((r as any).updated_at).toLocaleString('fr-MA')}`}>
                                <Clock className="inline h-2.5 w-2.5 mr-0.5 -mt-px" />{timeAgo((r as any).updated_at)}
                              </span>
                            )}
                            <Link href={`/opportunities/${r.id}`}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-lg border text-slate-400 hover:bg-slate-100" title="Voir">
                              <Eye className="h-3 w-3" />
                            </Link>
                            <button onClick={() => setEditRow(r)}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-lg border text-slate-400 hover:bg-slate-100" title="Modifier">
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button onClick={() => deleteDeal(r)}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-lg border text-red-300 hover:bg-red-50 hover:text-red-500" title="Supprimer">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                    {cards.length===0 && (
                      <div className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-xs text-slate-300">
                        Aucun deal
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* BU Breakdown */}
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {BUS.map(bu => {
            const buDeals = rows.filter(r => r.status==='Open'&&(r.bu===bu||(r.multi_bu&&Array.isArray(r.bu_lines)&&r.bu_lines.some((l:any)=>l.bu===bu))))
            const buAmt = buDeals.reduce((s,r) => {
              if (r.multi_bu&&Array.isArray(r.bu_lines))
                return s+r.bu_lines.filter((l:any)=>l.bu===bu).reduce((ss:number,l:any)=>ss+Number(l.amount||0),0)
              return s+Number(r.amount||0)
            }, 0)
            const cls = BU_COLOR[bu]||'bg-slate-50 text-slate-600'
            return (
              <div key={bu} className="rounded-2xl border bg-white p-3 shadow-sm">
                <div className={`inline-flex rounded-md px-2 py-0.5 text-xs font-bold ${cls}`}>{bu}</div>
                <div className="mt-2 text-lg font-bold text-slate-900">{buDeals.length}</div>
                <div className="text-[11px] text-slate-400 tabular-nums">{mad(buAmt)}</div>
              </div>
            )
          })}
        </div>

      </div>
      {/* ── New / Edit Deal Modal ── */}
      {(showNewDeal || editRow) && (
        <DealFormModal
          editRow={editRow || null}
          onClose={() => { setShowNewDeal(false); setEditRow(null) }}
          onSaved={() => { load(); setShowNewDeal(false); setEditRow(null) }}
        />
      )}

      {/* ── Undo toast ── */}
      {undoToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 shadow-2xl">
          <span className="text-sm text-white">
            <span className="font-bold">{undoToast.deal.title}</span> supprimé
          </span>
          <button onClick={undoDelete}
            className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-bold text-white hover:bg-amber-400 transition-colors">
            Annuler
          </button>
          <div className="h-1 w-20 rounded-full bg-white/20 overflow-hidden">
            <div className="h-full bg-amber-400 rounded-full" style={{ animation: 'shrink 8s linear forwards' }} />
          </div>
        </div>
      )}
      <style>{`@keyframes shrink { from { width: 100% } to { width: 0% } }`}</style>
    </div>
  )
}

// Suspense wrapper requis par Next.js pour useSearchParams()
export default function PipelinePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <RefreshCw className="h-4 w-4 animate-spin" /> Chargement…
        </div>
      </div>
    }>
      <PipelineContent />
    </Suspense>
  )
}
