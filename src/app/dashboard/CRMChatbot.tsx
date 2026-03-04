'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import {
  MessageCircle, X, Send, FileSpreadsheet, Bot, User,
  Loader2, Download, Sparkles, ChevronDown, Minimize2,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
interface Deal {
  id: string
  account_name: string
  title: string
  stage: string
  status: 'Open' | 'Won' | 'Lost'
  amount: number
  prob: number
  closingYm: string
  closingYmReal: string | null
  daysOld: number
  isMulti: boolean
  lines: { sbu: string; group: string; card: string; amount: number }[]
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  excelData?: ExcelSpec
  timestamp: Date
}

interface ExcelSpec {
  filename: string
  sheets: SheetSpec[]
}

interface SheetSpec {
  name: string
  title?: string
  headers: string[]
  rows: (string | number | null)[][]
  totalsRow?: (string | number | null)[]
  notes?: string
}

interface Props {
  deals?: Deal[]
  accounts?: any[]
  periodLabel?: string
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
const fmt = (n: number) => {
  if (!n) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${Math.round(n / 1000)}K`
  return String(Math.round(n))
}
const mad = (n: number) =>
  new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD', maximumFractionDigits: 0 }).format(n || 0)

function buildContext(deals: Deal[], accounts: any[], periodLabel: string): string {
  if (!deals?.length) return 'Aucune donnée disponible.'
  const open = deals.filter(d => d.status === 'Open')
  const won  = deals.filter(d => d.status === 'Won')
  const lost = deals.filter(d => d.status === 'Lost')
  const pipeAmt  = open.reduce((s, d) => s + d.amount, 0)
  const foreAmt  = open.reduce((s, d) => s + d.amount * (d.prob / 100), 0)
  const wonAmt   = won.reduce((s, d) => s + d.amount, 0)
  const stageMap = new Map<string, number>()
  for (const d of open) stageMap.set(d.stage, (stageMap.get(d.stage) || 0) + d.amount)
  const sbuMap = new Map<string, number>()
  for (const d of open) for (const ln of d.lines) sbuMap.set(ln.sbu, (sbuMap.get(ln.sbu) || 0) + ln.amount)

  const dealsList = deals.slice(0, 200).map(d => {
    const bestSbu = [...d.lines].sort((a, b) => b.amount - a.amount)[0]?.sbu || '—'
    return `- ${d.account_name} | ${d.title} | ${d.stage} | ${d.status} | ${d.amount} MAD | prob:${d.prob}% | BU:${bestSbu} | closing:${d.closingYmReal || d.closingYm}`
  }).join('\n')

  return `
=== CONTEXTE CRM ===
Période: ${periodLabel}
Total deals: ${deals.length} (Open: ${open.length}, Won: ${won.length}, Lost: ${lost.length})
Pipeline total: ${fmt(pipeAmt)} MAD
Forecast pondéré: ${fmt(foreAmt)} MAD
Won période: ${fmt(wonAmt)} MAD
Win rate: ${won.length + lost.length > 0 ? Math.round(won.length / (won.length + lost.length) * 100) : 0}%

Par étape (Open):
${[...stageMap.entries()].map(([s, a]) => `  ${s}: ${fmt(a)} MAD`).join('\n')}

Par SBU (Open):
${[...sbuMap.entries()].map(([s, a]) => `  ${s}: ${fmt(a)} MAD`).join('\n')}

=== DEALS (max 200) ===
Format: Compte | Titre | Stage | Statut | Montant | Probabilité | BU | Closing
${dealsList}
`
}

function buildSystemPrompt(): string {
  return `Tu es un assistant CRM intelligent pour une entreprise tech au Maroc. Tu analyses les données de pipeline commercial et tu réponds aux questions des utilisateurs.

Tu peux répondre en français, en darija (arabe marocain), ou en anglais selon la langue de l'utilisateur.

Tu as accès aux données CRM complètes (deals, pipeline, forecast, clients, BU, etc.).

CAPACITÉS:
1. Répondre à des questions analytiques sur le pipeline (ex: "qui sont les top clients?", "quel est le forecast Q3?")
2. Identifier des deals à risque, stagnants, ou des opportunités
3. Générer des rapports Excel professionnels

RÈGLES POUR EXCEL:
Quand l'utilisateur demande un export, rapport, tableau, liste, ou fichier Excel, tu dois répondre UNIQUEMENT avec ce format JSON exact entre les balises [EXCEL] et [/EXCEL]:

[EXCEL]
{
  "filename": "nom_du_fichier.xlsx",
  "sheets": [
    {
      "name": "NomOnglet",
      "title": "Titre du rapport",
      "headers": ["Col1", "Col2", "Col3"],
      "rows": [
        ["valeur1", "valeur2", 123456],
        ["valeur3", "valeur4", 789012]
      ],
      "totalsRow": ["TOTAL", "", 912468],
      "notes": "Note optionnelle sur ce tableau"
    }
  ]
}
[/EXCEL]

Tu peux avoir plusieurs sheets dans le même fichier. Utilise toujours des montants en nombres (pas de texte "MAD"). Inclus toujours une ligne TOTAL quand pertinent.

STYLE DE RÉPONSE:
- Sois précis et concis
- Utilise des emojis avec parcimonie pour les KPIs importants (✅ 🔴 📊 etc.)
- Pour les analyses textuelles, utilise des listes claires
- Mets en avant les insights importants (deals à risque, opportunités, alertes)`
}

// ─────────────────────────────────────────────────────────────
// CSV GENERATOR — no external deps, opens perfectly in Excel
// ─────────────────────────────────────────────────────────────
function generateExcel(spec: ExcelSpec) {
  // Build one CSV per sheet, separated by blank lines
  const lines: string[] = []

  for (const sheet of spec.sheets) {
    // Sheet name as section title
    lines.push(`=== ${sheet.name} ===`)
    if (sheet.title) lines.push(sheet.title)
    lines.push('')

    // Headers
    lines.push(sheet.headers.map(csvCell).join(','))

    // Rows
    for (const row of sheet.rows) {
      lines.push(row.map(csvCell).join(','))
    }

    // Totals
    if (sheet.totalsRow) {
      lines.push(sheet.totalsRow.map(csvCell).join(','))
    }

    // Notes
    if (sheet.notes) {
      lines.push('')
      lines.push(csvCell(`Note: ${sheet.notes}`))
    }

    lines.push('')
    lines.push('')
  }

  const csvContent = '\uFEFF' + lines.join('\n') // BOM for Excel UTF-8
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = spec.filename.replace('.xlsx', '.csv')
  a.click()
  URL.revokeObjectURL(url)
}

function csvCell(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return ''
  const s = String(val)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

// ─────────────────────────────────────────────────────────────
// PARSE ASSISTANT RESPONSE
// ─────────────────────────────────────────────────────────────
function parseResponse(raw: string): { text: string; excel: ExcelSpec | null } {
  const match = raw.match(/\[EXCEL\]([\s\S]*?)\[\/EXCEL\]/i)
  if (!match) return { text: raw, excel: null }
  try {
    const excel = JSON.parse(match[1].trim()) as ExcelSpec
    const text = raw.replace(match[0], '').trim()
    return { text: text || '✅ Fichier Excel généré et prêt au téléchargement.', excel }
  } catch {
    return { text: raw, excel: null }
  }
}

// ─────────────────────────────────────────────────────────────
// SUGGESTED PROMPTS
// ─────────────────────────────────────────────────────────────
const SUGGESTIONS = [
  '📊 Exporte le pipeline complet en Excel',
  '🔴 Quels deals sont à risque ou stagnants ?',
  '🏆 Top 10 clients par pipeline',
  '📈 Analyse du forecast par BU',
  '📋 Rapport Won vs Lost cette période',
  '⚠️ Deals sans next step ni closing',
]

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────
export default function CRMChatbot({ deals = [], accounts = [], periodLabel = 'Période' }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
    if (open && messages.length === 0) setShowSuggestions(true)
  }, [open])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return
    setShowSuggestions(false)

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const context = buildContext(deals, accounts, periodLabel)
      const history = messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          system: buildSystemPrompt() + '\n\nDONNÉES CRM ACTUELLES:\n' + context,
          messages: [...history, { role: 'user', content: text.trim() }],
        }),
      })

      const data = await response.json()
      const raw = data?.content?.[0]?.text || data?.error || 'Réponse vide'
      if (typeof raw !== 'string') throw new Error(JSON.stringify(raw))
      const { text: msgText, excel } = parseResponse(raw)

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: msgText,
        excelData: excel || undefined,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (e: any) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '❌ Erreur de connexion. Vérifie ta clé API.',
        timestamp: new Date(),
      }])
    } finally {
      setLoading(false)
    }
  }, [deals, accounts, periodLabel, messages, loading])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <>
      {/* ── Floating Button ── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          type="button"
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-xl hover:shadow-2xl hover:scale-105 transition-all duration-200"
          title="Assistant CRM IA"
        >
          <Sparkles className="h-6 w-6" />
          {deals.length > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-black text-white">
              {deals.filter(d => d.status === 'Open').length > 99 ? '99+' : deals.filter(d => d.status === 'Open').length}
            </span>
          )}
        </button>
      )}

      {/* ── Chat Panel ── */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col w-[420px] max-w-[calc(100vw-24px)] h-[600px] max-h-[calc(100vh-48px)] rounded-2xl shadow-2xl overflow-hidden border border-slate-200/60"
          style={{ background: '#0f172a' }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10"
            style={{ background: 'linear-gradient(135deg, #1e293b 0%, #1e1b4b 100%)' }}>
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 shadow-md">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <div className="text-sm font-bold text-white">Assistant CRM</div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {deals.length > 0 ? `${deals.length} deals chargés` : 'En attente de données'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button onClick={() => { setMessages([]); setShowSuggestions(true) }} type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition-colors text-xs font-bold"
                  title="Nouvelle conversation">
                  ↺
                </button>
              )}
              <button onClick={() => setOpen(false)} type="button"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scroll-smooth"
            style={{ background: '#0f172a' }}>

            {/* Welcome */}
            {messages.length === 0 && (
              <div className="flex flex-col items-center gap-3 pt-4 pb-2 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 border border-white/10">
                  <Bot className="h-7 w-7 text-blue-400" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">Bonjour 👋</div>
                  <div className="text-xs text-slate-400 mt-0.5 max-w-[280px]">
                    Pose-moi n'importe quelle question sur ton pipeline, ou demande-moi un rapport Excel.
                  </div>
                </div>
              </div>
            )}

            {/* Suggestion chips */}
            {showSuggestions && messages.length === 0 && (
              <div className="flex flex-col gap-1.5">
                {SUGGESTIONS.map(s => (
                  <button key={s} type="button" onClick={() => sendMessage(s)}
                    className="text-left text-xs px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white transition-all hover:border-blue-500/50">
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Messages */}
            {messages.map(msg => (
              <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* Avatar */}
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full mt-0.5
                  ${msg.role === 'user'
                    ? 'bg-blue-600'
                    : 'bg-gradient-to-br from-blue-500/30 to-violet-500/30 border border-white/10'}`}>
                  {msg.role === 'user'
                    ? <User className="h-3.5 w-3.5 text-white" />
                    : <Bot className="h-3.5 w-3.5 text-blue-400" />}
                </div>

                {/* Bubble */}
                <div className={`flex flex-col gap-2 max-w-[82%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed
                    ${msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-sm'
                      : 'bg-white/8 border border-white/10 text-slate-200 rounded-tl-sm'}`}
                    style={msg.role === 'assistant' ? { background: 'rgba(255,255,255,0.06)' } : undefined}>
                    <MessageContent content={msg.content} />
                  </div>

                  {/* Excel download button */}
                  {msg.excelData && (
                    <button type="button"
                      onClick={() => generateExcel(msg.excelData!)}
                      className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-400/50 transition-all">
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      Télécharger {msg.excelData.filename}
                      <Download className="h-3 w-3" />
                    </button>
                  )}

                  <div className="text-[10px] text-slate-600">
                    {msg.timestamp.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="flex gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10"
                  style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <Bot className="h-3.5 w-3.5 text-blue-400" />
                </div>
                <div className="rounded-2xl rounded-tl-sm px-4 py-3 border border-white/10"
                  style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-white/10 px-3 py-3" style={{ background: '#0f172a' }}>
            <div className="flex items-end gap-2 rounded-xl border border-white/10 px-3 py-2"
              style={{ background: 'rgba(255,255,255,0.05)' }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pose une question ou demande un export Excel…"
                rows={1}
                disabled={loading}
                className="flex-1 resize-none bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none min-h-[20px] max-h-[120px] leading-5 py-0.5"
                style={{ scrollbarWidth: 'none' }}
                onInput={e => {
                  const t = e.currentTarget
                  t.style.height = 'auto'
                  t.style.height = Math.min(t.scrollHeight, 120) + 'px'
                }}
              />
              <button
                type="button"
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all
                  ${input.trim() && !loading
                    ? 'bg-blue-600 text-white hover:bg-blue-500'
                    : 'bg-white/5 text-slate-600'}`}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            <div className="mt-1.5 text-[10px] text-slate-600 text-center">
              Entrée pour envoyer · Shift+Entrée pour nouvelle ligne
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// MESSAGE CONTENT — simple markdown-like renderer
// ─────────────────────────────────────────────────────────────
function MessageContent({ content }: { content: string }) {
  const lines = content.split('\n')
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />
        // Bold: **text**
        const parts = line.split(/(\*\*[^*]+\*\*)/g)
        return (
          <div key={i} className={line.startsWith('- ') || line.startsWith('• ') ? 'flex gap-1.5' : ''}>
            {(line.startsWith('- ') || line.startsWith('• ')) && (
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400 self-start translate-y-1.5" />
            )}
            <span>
              {parts.map((part, j) =>
                part.startsWith('**') && part.endsWith('**')
                  ? <strong key={j} className="font-semibold text-white">{part.slice(2, -2)}</strong>
                  : <span key={j}>{line.startsWith('- ') || line.startsWith('• ') ? part.replace(/^[-•]\s*/, '') : part}</span>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}
