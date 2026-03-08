'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
  X, Send, FileSpreadsheet, Bot, User,
  Loader2, Download, Sparkles, Zap,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
interface Deal {
  id: string; account_name: string; title: string; stage: string
  status: 'Open' | 'Won' | 'Lost'; amount: number; prob: number
  closingYm: string; closingYmReal: string | null; daysOld: number
  isMulti: boolean; lines: { sbu: string; group: string; card: string; amount: number }[]
}

interface Message {
  id: string; role: 'user' | 'assistant'; content: string
  excelData?: ExcelSpec; timestamp: Date
}

interface ExcelSpec {
  filename: string
  sheets: { name: string; title?: string; headers: string[]; rows: (string | number | null)[][]; totalsRow?: (string | number | null)[]; notes?: string }[]
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
const fmtAmt = (n: number) => {
  if (!n) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${Math.round(n / 1000)}K`
  return String(Math.round(n))
}

function buildContext(deals: Deal[]): string {
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
Total deals: ${deals.length} (Open: ${open.length}, Won: ${won.length}, Lost: ${lost.length})
Pipeline total: ${fmtAmt(pipeAmt)} MAD
Forecast pondéré: ${fmtAmt(foreAmt)} MAD
Won: ${fmtAmt(wonAmt)} MAD
Win rate: ${won.length + lost.length > 0 ? Math.round(won.length / (won.length + lost.length) * 100) : 0}%

Par étape (Open):
${[...stageMap.entries()].map(([s, a]) => `  ${s}: ${fmtAmt(a)} MAD`).join('\n')}

Par SBU (Open):
${[...sbuMap.entries()].map(([s, a]) => `  ${s}: ${fmtAmt(a)} MAD`).join('\n')}

=== DEALS (max 200) ===
Format: Compte | Titre | Stage | Statut | Montant | Probabilité | BU | Closing
${dealsList}
`
}

const SYSTEM_PROMPT = `Tu es "Pipou", l'Inside Sales IA de Nabil chez Compucom Maroc. Tu es drôle, sympa, et ultra efficace.

Tu parles en français, en darija, ou en anglais selon la langue de l'utilisateur. Tu tutoies Nabil.

Tu as accès aux données CRM complètes (deals, pipeline, forecast, clients, BU, etc.).

CAPACITÉS:
1. Répondre à des questions analytiques sur le pipeline
2. Identifier des deals à risque, stagnants, ou des opportunités
3. Générer des rapports Excel professionnels
4. Donner des conseils sales stratégiques

RÈGLES POUR EXCEL:
Quand l'utilisateur demande un export/rapport/tableau/fichier Excel, réponds UNIQUEMENT avec ce format JSON entre [EXCEL] et [/EXCEL]:

[EXCEL]
{
  "filename": "nom_du_fichier.xlsx",
  "sheets": [
    {
      "name": "NomOnglet",
      "title": "Titre du rapport",
      "headers": ["Col1", "Col2", "Col3"],
      "rows": [["val1", "val2", 123]],
      "totalsRow": ["TOTAL", "", 123],
      "notes": "Note optionnelle"
    }
  ]
}
[/EXCEL]

Utilise des montants en nombres (pas de texte "MAD"). Inclus une ligne TOTAL quand pertinent.

STYLE:
- Sois précis, concis, et ajoute une touche d'humour
- Utilise des emojis pour les KPIs (✅ 🔴 📊 🚀 💰)
- Mets en avant les insights importants
- Appelle Nabil par son prénom de temps en temps`

// ─────────────────────────────────────────────────────────────
// THINKING STATES
// ─────────────────────────────────────────────────────────────
const THINKING_MESSAGES = [
  '🧠 Je fouille dans tes deals...',
  '📊 J\'analyse les chiffres...',
  '🔍 Je regarde le pipeline...',
  '💡 Je prépare ma réponse...',
  '📈 Je crunch les données...',
  '🎯 J\'identifie les patterns...',
]

// ─────────────────────────────────────────────────────────────
// SUGGESTIONS
// ─────────────────────────────────────────────────────────────
const SUGGESTIONS = [
  '📊 Exporte le pipeline complet en Excel',
  '🔴 Quels deals sont à risque ?',
  '🏆 Top 10 clients par pipeline',
  '📈 Analyse du forecast par BU',
  '💰 Rapport Won vs Lost',
  '⚠️ Deals sans next step',
]

// ─────────────────────────────────────────────────────────────
// EXCEL GENERATOR
// ─────────────────────────────────────────────────────────────
async function generateExcel(spec: ExcelSpec) {
  const response = await fetch('/api/excel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(spec),
  })
  if (!response.ok) throw new Error('Erreur')
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = spec.filename.endsWith('.xlsx') ? spec.filename : spec.filename + '.xlsx'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

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
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────
export default function PipouChatbot() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const [thinkingMsg, setThinkingMsg] = useState('')
  const [deals, setDeals] = useState<Deal[]>([])
  const [dealsLoaded, setDealsLoaded] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const thinkingInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load deals data on first open
  useEffect(() => {
    if (open && !dealsLoaded) {
      loadDeals()
    }
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  async function loadDeals() {
    const { data } = await supabase.from('opportunities').select('*, accounts(name)').order('created_at', { ascending: false })
    if (data) {
      const mapped: Deal[] = data.map((r: any) => {
        const buLines = Array.isArray(r.bu_lines) ? r.bu_lines : []
        return {
          id: r.id,
          account_name: r.accounts?.name || '—',
          title: r.title || '—',
          stage: r.stage || 'Lead',
          status: r.status || 'Open',
          amount: Number(r.amount) || 0,
          prob: Number(r.prob) || 0,
          closingYm: r.booking_month || '—',
          closingYmReal: r.closing_date || null,
          daysOld: Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000),
          isMulti: !!r.multi_bu,
          lines: buLines.length > 0
            ? buLines.map((l: any) => ({ sbu: l.bu || '—', group: l.group || '—', card: l.card || l.bu || '—', amount: Number(l.amount) || 0 }))
            : [{ sbu: r.bu || '—', group: '—', card: r.vendor || '—', amount: Number(r.amount) || 0 }],
        }
      })
      setDeals(mapped)
      setDealsLoaded(true)
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinkingMsg])

  // Thinking animation
  useEffect(() => {
    if (loading) {
      let idx = 0
      setThinkingMsg(THINKING_MESSAGES[0])
      thinkingInterval.current = setInterval(() => {
        idx = (idx + 1) % THINKING_MESSAGES.length
        setThinkingMsg(THINKING_MESSAGES[idx])
      }, 2000)
    } else {
      setThinkingMsg('')
      if (thinkingInterval.current) clearInterval(thinkingInterval.current)
    }
    return () => { if (thinkingInterval.current) clearInterval(thinkingInterval.current) }
  }, [loading])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return
    setShowSuggestions(false)

    const userMsg: Message = {
      id: Date.now().toString(), role: 'user',
      content: text.trim(), timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const context = buildContext(deals)
      const history = messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 8000,
          system: SYSTEM_PROMPT + '\n\nDONNÉES CRM ACTUELLES:\n' + context,
          messages: [...history, { role: 'user', content: text.trim() }],
        }),
      })

      const data = await response.json()
      const raw = data?.content?.[0]?.text || data?.error || 'Réponse vide'
      if (typeof raw !== 'string') throw new Error(JSON.stringify(raw))
      const { text: msgText, excel } = parseResponse(raw)

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(), role: 'assistant',
        content: msgText, excelData: excel || undefined, timestamp: new Date(),
      }])
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(), role: 'assistant',
        content: '❌ Oups, j\'ai eu un souci de connexion. Réessaie !', timestamp: new Date(),
      }])
    } finally {
      setLoading(false)
    }
  }, [deals, messages, loading])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) }
  }

  return (
    <>
      {/* ── Floating Button — animated gradient ── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          type="button"
          className="fixed bottom-6 right-6 z-[100] group"
          title="Pipou — ton Inside Sales IA"
        >
          <div className="relative flex h-14 w-14 items-center justify-center rounded-full shadow-xl hover:shadow-2xl hover:scale-110 transition-all duration-300"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb, #06b6d4)' }}>
            <span className="text-2xl">🤖</span>
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-black text-white ring-2 ring-white">
              <Zap className="h-3 w-3" />
            </span>
          </div>
          <span className="absolute -top-8 right-0 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
            Pipou — Inside Sales IA 🚀
          </span>
        </button>
      )}

      {/* ── Chat Panel ── */}
      {open && (
        <div className="fixed bottom-6 right-6 z-[100] flex flex-col w-[420px] max-w-[calc(100vw-24px)] h-[600px] max-h-[calc(100vh-48px)] rounded-2xl shadow-2xl overflow-hidden border border-slate-200/60"
          style={{ background: '#0f172a' }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10"
            style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e3a5f 100%)' }}>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl shadow-md text-xl"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}>
                🤖
              </div>
              <div>
                <div className="text-sm font-black text-white tracking-tight">Pipou</div>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Ton Inside Sales IA
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button onClick={() => { setMessages([]); setShowSuggestions(true) }} type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition-colors text-xs font-bold"
                  title="Nouvelle conversation">↺</button>
              )}
              <button onClick={() => setOpen(false)} type="button"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scroll-smooth" style={{ background: '#0f172a' }}>

            {/* Welcome */}
            {messages.length === 0 && (
              <div className="flex flex-col items-center gap-3 pt-4 pb-2 text-center">
                <div className="text-4xl">🤖</div>
                <div>
                  <div className="text-sm font-bold text-white">Salut Nabil ! 👋</div>
                  <div className="text-xs text-slate-400 mt-1 max-w-[300px]">
                    C'est Pipou, ton Inside Sales IA. Qu'est-ce qu'on attaque aujourd'hui ? 🚀
                  </div>
                </div>
              </div>
            )}

            {/* Suggestion chips */}
            {showSuggestions && messages.length === 0 && (
              <div className="flex flex-col gap-1.5">
                {SUGGESTIONS.map(s => (
                  <button key={s} type="button" onClick={() => sendMessage(s)}
                    className="text-left text-xs px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white transition-all hover:border-violet-500/50">
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Messages */}
            {messages.map(msg => (
              <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full mt-0.5
                  ${msg.role === 'user' ? 'bg-blue-600' : ''}`}
                  style={msg.role === 'assistant' ? { background: 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(37,99,235,0.3))' } : undefined}>
                  {msg.role === 'user'
                    ? <User className="h-3.5 w-3.5 text-white" />
                    : <span className="text-sm">🤖</span>}
                </div>
                <div className={`flex flex-col gap-2 max-w-[82%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed
                    ${msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-sm'
                      : 'border border-white/10 text-slate-200 rounded-tl-sm'}`}
                    style={msg.role === 'assistant' ? { background: 'rgba(255,255,255,0.06)' } : undefined}>
                    <MessageContent content={msg.content} />
                  </div>
                  {msg.excelData && (
                    <button type="button"
                      onClick={() => generateExcel(msg.excelData!).catch(() => alert('Erreur Excel'))}
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

            {/* Thinking state */}
            {loading && (
              <div className="flex gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                  style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(37,99,235,0.3))' }}>
                  <span className="text-sm">🤖</span>
                </div>
                <div className="rounded-2xl rounded-tl-sm px-4 py-3 border border-white/10"
                  style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 text-violet-400 animate-spin" />
                    <span className="text-xs text-violet-300 font-medium animate-pulse">{thinkingMsg}</span>
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
                placeholder="Demande à Pipou..."
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
                    ? 'bg-gradient-to-r from-violet-600 to-blue-600 text-white hover:from-violet-500 hover:to-blue-500'
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
// MESSAGE CONTENT
// ─────────────────────────────────────────────────────────────
function MessageContent({ content }: { content: string }) {
  const lines = content.split('\n')
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />
        const parts = line.split(/(\*\*[^*]+\*\*)/g)
        return (
          <div key={i} className={line.startsWith('- ') || line.startsWith('• ') ? 'flex gap-1.5' : ''}>
            {(line.startsWith('- ') || line.startsWith('• ')) && (
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400 self-start translate-y-1.5" />
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
