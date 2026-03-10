'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { ownerName } from '@/lib/utils'
import {
  Send, Paperclip, Smile, Image, File, X, Download,
  Search, MessageCircle, FolderOpen, Gamepad2, RefreshCw,
  Check, CheckCheck, ChevronLeft,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────
type Message = {
  id: string
  sender_email: string
  content: string
  file_url: string | null
  file_name: string | null
  created_at: string
  read_at: string | null
}

type SharedFile = {
  id: string
  name: string
  url: string
  uploaded_by: string
  created_at: string
  size: number | null
}

type SidePanel = 'chat' | 'files' | 'game'

// ── Emoji Picker (minimal) ──────────────────────────────────
const EMOJI_CATEGORIES = [
  { label: 'Fréquents', emojis: ['😂', '👍', '🔥', '💪', '🎯', '✅', '❌', '⚡', '💰', '🚀', '😎', '🤝', '☕', '💀', '🫡', '👀', '🤣', '😤', '🙏', '💯'] },
  { label: 'Business', emojis: ['📊', '📈', '📉', '💼', '🏢', '📋', '📌', '🔔', '💡', '🎓', '🏆', '🥇', '📦', '🛡️', '🔑', '📧', '📱', '💻', '🖥️', '📁'] },
  { label: 'Réactions', emojis: ['❤️', '👏', '🤔', '😱', '🤯', '😅', '😍', '🥳', '🤞', '👊', '✊', '🫶', '🙌', '💥', '🎉', '🎊', '👑', '💎', '🌟', '⭐'] },
]

function EmojiPicker({ onSelect, onClose }: { onSelect: (e: string) => void; onClose: () => void }) {
  return (
    <div className="absolute bottom-full left-0 mb-2 w-72 rounded-2xl border border-slate-200 bg-white shadow-xl z-50 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
        <span className="text-xs font-bold text-slate-600">Emojis</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="p-2 max-h-48 overflow-y-auto space-y-2">
        {EMOJI_CATEGORIES.map(cat => (
          <div key={cat.label}>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 px-1">{cat.label}</div>
            <div className="flex flex-wrap gap-0.5">
              {cat.emojis.map(e => (
                <button key={e} onClick={() => { onSelect(e); onClose() }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 text-lg transition-colors">
                  {e}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Mini Sales Game ─────────────────────────────────────────
function SalesGame() {
  const [score, setScore] = useState({ nabil: 0, salim: 0 })
  const [round, setRound] = useState(0)
  const [question, setQuestion] = useState<{ q: string; a: string; b: string; correct: 'a' | 'b' } | null>(null)
  const [answered, setAnswered] = useState<string | null>(null)
  const [turn, setTurn] = useState<'nabil' | 'salim'>('nabil')

  const questions = useMemo(() => [
    { q: 'Un client dit "Je vais réfléchir". Tu fais quoi ?', a: 'Tu rappelles dans 2 semaines', b: 'Tu demandes "Qu\'est-ce qui vous fait hésiter ?"', correct: 'b' as const },
    { q: 'Deal de 2M MAD, le client veut -30%. Tu proposes quoi ?', a: 'Tu négoces un -15% avec services ajoutés', b: 'Tu acceptes pour closer vite', correct: 'a' as const },
    { q: 'Un prospect te ghoste après le devis. Next step ?', a: 'Tu envoies un email de relance standard', b: 'Tu appelles avec une info utile pour lui', correct: 'b' as const },
    { q: 'Le closing est prévu ce mois. Le client demande un report. Tu fais quoi ?', a: 'Tu acceptes en proposant une nouvelle date ferme', b: 'Tu attends qu\'il revienne', correct: 'a' as const },
    { q: 'Un concurrent propose -20% que toi. Comment tu réagis ?', a: 'Tu baisses ton prix aussi', b: 'Tu valorises ta différenciation et le TCO', correct: 'b' as const },
    { q: 'Forecast review demain. 3 deals sont incertains. Tu fais quoi ?', a: 'Tu les gardes en Commit pour faire beau', b: 'Tu les rétrogrades honnêtement et proposes un plan B', correct: 'b' as const },
    { q: 'Le DSI valide mais les achats bloquent. Comment tu débloques ?', a: 'Tu attends que le DSI pousse en interne', b: 'Tu cherches un champion aux achats et tu le briefs', correct: 'b' as const },
    { q: 'Un client existant demande un renouvellement mais hésite. Tu dis quoi ?', a: '"On a de nouvelles features qui vont vous plaire"', b: '"Sans renouvellement, vous perdez le support et les mises à jour"', correct: 'a' as const },
  ], [])

  function startRound() {
    const available = questions.filter((_, i) => i >= round)
    if (available.length === 0) return
    setQuestion(questions[round])
    setAnswered(null)
  }

  function answer(choice: 'a' | 'b') {
    if (!question || answered) return
    setAnswered(choice)
    if (choice === question.correct) {
      setScore(prev => ({ ...prev, [turn]: prev[turn] + 1 }))
    }
    setTimeout(() => {
      setRound(prev => prev + 1)
      setTurn(prev => prev === 'nabil' ? 'salim' : 'nabil')
      setQuestion(null)
      setAnswered(null)
    }, 1500)
  }

  function resetGame() {
    setScore({ nabil: 0, salim: 0 }); setRound(0); setQuestion(null); setAnswered(null); setTurn('nabil')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="text-sm font-black text-slate-900">🎮 Sales Challenge</div>
        <div className="text-[10px] text-slate-400">Qui est le meilleur commercial ? Répondez tour à tour !</div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Scoreboard */}
        <div className="grid grid-cols-2 gap-3">
          <div className={`rounded-2xl border p-3 text-center ${turn === 'nabil' && !question ? 'border-blue-300 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 bg-slate-50'}`}>
            <div className="text-lg font-black text-slate-900">{score.nabil}</div>
            <div className="text-[10px] font-bold text-slate-500">Nabil 🔥</div>
          </div>
          <div className={`rounded-2xl border p-3 text-center ${turn === 'salim' && !question ? 'border-emerald-300 bg-emerald-50 ring-2 ring-emerald-200' : 'border-slate-200 bg-slate-50'}`}>
            <div className="text-lg font-black text-slate-900">{score.salim}</div>
            <div className="text-[10px] font-bold text-slate-500">Salim 💪</div>
          </div>
        </div>

        {/* Question */}
        {question ? (
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-400 uppercase">Round {round + 1} — Tour de {turn === 'nabil' ? 'Nabil' : 'Salim'}</div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-bold text-slate-900 mb-3">{question.q}</div>
              <div className="space-y-2">
                <button onClick={() => answer('a')}
                  className={`w-full text-left rounded-xl border p-3 text-xs font-semibold transition-all
                    ${answered === 'a' ? (question.correct === 'a' ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-red-400 bg-red-50 text-red-800') : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'}`}>
                  A. {question.a}
                  {answered && question.correct === 'a' && <span className="ml-2">✅</span>}
                </button>
                <button onClick={() => answer('b')}
                  className={`w-full text-left rounded-xl border p-3 text-xs font-semibold transition-all
                    ${answered === 'b' ? (question.correct === 'b' ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-red-400 bg-red-50 text-red-800') : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'}`}>
                  B. {question.b}
                  {answered && question.correct === 'b' && <span className="ml-2">✅</span>}
                </button>
              </div>
            </div>
          </div>
        ) : round >= questions.length ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center space-y-3">
            <div className="text-3xl">🏆</div>
            <div className="text-lg font-black text-slate-900">
              {score.nabil > score.salim ? 'Nabil gagne !' : score.salim > score.nabil ? 'Salim gagne !' : 'Égalité !'}
            </div>
            <div className="text-sm text-slate-500">
              {score.nabil} - {score.salim}
            </div>
            <button onClick={resetGame}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800">
              <RefreshCw className="h-3.5 w-3.5" /> Rejouer
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center space-y-3">
            <div className="text-2xl">{turn === 'nabil' ? '🔥' : '💪'}</div>
            <div className="text-sm font-bold text-slate-900">Tour de {turn === 'nabil' ? 'Nabil' : 'Salim'}</div>
            <button onClick={startRound}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700">
              {round === 0 ? 'Commencer la partie' : 'Question suivante'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────
export default function MessagesPage() {
  const [userEmail, setUserEmail] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [sidePanel, setSidePanel] = useState<SidePanel>('chat')
  const [showEmoji, setShowEmoji] = useState(false)
  const [sharedFiles, setSharedFiles] = useState<SharedFile[]>([])
  const [fileSearch, setFileSearch] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.title = 'Messages · CRM-PIPE'
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setUserEmail(data.user.email)
    })
    loadMessages()
    loadFiles()

    // Real-time subscription
    const channel = supabase
      .channel('team-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_messages' }, (payload) => {
        setMessages(prev => [...prev, payload.new as Message])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadMessages() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('team_messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(500)
      if (data) setMessages(data as Message[])
    } catch {}
    setLoading(false)
  }

  async function loadFiles() {
    try {
      const { data } = await supabase
        .from('shared_files')
        .select('*')
        .order('created_at', { ascending: false })
      if (data) setSharedFiles(data as SharedFile[])
    } catch {}
  }

  async function sendMessage() {
    if (!input.trim() || sending || !userEmail) return
    setSending(true)
    try {
      await supabase.from('team_messages').insert({
        sender_email: userEmail,
        content: input.trim(),
      })
      setInput('')
      inputRef.current?.focus()
    } catch {}
    setSending(false)
  }

  async function handleFileUpload(file: File) {
    if (!userEmail) return
    const path = `shared/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from('team-files').upload(path, file)
    if (error) return
    const { data: urlData } = supabase.storage.from('team-files').getPublicUrl(path)
    // Save to shared_files table
    await supabase.from('shared_files').insert({
      name: file.name,
      url: urlData.publicUrl,
      uploaded_by: userEmail,
      size: file.size,
    })
    // Also send as message
    await supabase.from('team_messages').insert({
      sender_email: userEmail,
      content: `📎 ${file.name}`,
      file_url: urlData.publicUrl,
      file_name: file.name,
    })
    loadFiles()
  }

  const filteredFiles = useMemo(() => {
    if (!fileSearch.trim()) return sharedFiles
    const q = fileSearch.toLowerCase()
    return sharedFiles.filter(f => f.name.toLowerCase().includes(q))
  }, [sharedFiles, fileSearch])

  const otherEmail = userEmail === 'nabil.imdh@gmail.com' ? 's.chitachny@compucom.ma' : 'nabil.imdh@gmail.com'
  const otherName = ownerName(otherEmail)

  function formatTime(iso: string) {
    const d = new Date(iso)
    const today = new Date()
    const isToday = d.toDateString() === today.toDateString()
    if (isToday) return d.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('fr-MA', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' })
  }

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups: { date: string; messages: Message[] }[] = []
    let currentDate = ''
    for (const msg of messages) {
      const d = new Date(msg.created_at).toLocaleDateString('fr-MA', { weekday: 'long', day: 'numeric', month: 'long' })
      if (d !== currentDate) {
        currentDate = d
        groups.push({ date: d, messages: [msg] })
      } else {
        groups[groups.length - 1].messages.push(msg)
      }
    }
    return groups
  }, [messages])

  return (
    <div className="flex h-[calc(100vh-64px)] bg-white">
      {/* ── Left Sidebar ── */}
      <div className="w-72 shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col">
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-lg font-black text-slate-900">Messages</h2>
          <p className="text-[10px] text-slate-400">Communication d'équipe Compucom</p>
        </div>

        {/* Side panel tabs */}
        <div className="flex border-b border-slate-200">
          {([
            { id: 'chat' as const, icon: <MessageCircle className="h-4 w-4" />, label: 'Chat' },
            { id: 'files' as const, icon: <FolderOpen className="h-4 w-4" />, label: 'Fichiers' },
            { id: 'game' as const, icon: <Gamepad2 className="h-4 w-4" />, label: 'Jeu' },
          ]).map(t => (
            <button key={t.id} onClick={() => setSidePanel(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold transition-colors
                ${sidePanel === t.id ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Side panel content */}
        <div className="flex-1 overflow-hidden">
          {sidePanel === 'chat' && (
            <div className="p-3 space-y-2">
              {/* Conversation with Salim/Nabil */}
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-white text-sm font-black">
                    {otherName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-slate-900">{otherName}</div>
                    <div className="text-[10px] text-slate-500 truncate">
                      {messages.length > 0 ? messages[messages.length - 1].content.slice(0, 40) : 'Aucun message'}
                    </div>
                  </div>
                  {messages.length > 0 && (
                    <span className="text-[10px] text-slate-400">
                      {formatTime(messages[messages.length - 1].created_at)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {sidePanel === 'files' && (
            <div className="p-3 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input value={fileSearch} onChange={e => setFileSearch(e.target.value)}
                  placeholder="Chercher un fichier..."
                  className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none focus:border-blue-400" />
              </div>
              <div className="space-y-1.5 max-h-[calc(100vh-280px)] overflow-y-auto">
                {filteredFiles.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">Aucun fichier partagé</div>
                ) : filteredFiles.map(f => (
                  <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2.5 hover:bg-slate-50 transition-colors">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 shrink-0">
                      <File className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-800 truncate">{f.name}</div>
                      <div className="text-[10px] text-slate-400">
                        {ownerName(f.uploaded_by)} · {new Date(f.created_at).toLocaleDateString('fr-MA')}
                      </div>
                    </div>
                    <Download className="h-3.5 w-3.5 text-slate-300" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {sidePanel === 'game' && <SalesGame />}
        </div>
      </div>

      {/* ── Main Chat Area ── */}
      <div className="flex-1 flex flex-col">
        {/* Chat header */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-200 bg-white">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-white text-sm font-black">
            {otherName.charAt(0)}
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900">{otherName}</div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              En ligne
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4" style={{ background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)' }}>
          {loading && (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-5 w-5 animate-spin text-slate-300" />
            </div>
          )}

          {!loading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <MessageCircle className="h-12 w-12 text-slate-200 mb-3" />
              <div className="text-sm font-bold text-slate-400">Aucun message</div>
              <div className="text-xs text-slate-300 mt-1">Commencez la conversation !</div>
            </div>
          )}

          {groupedMessages.map(group => (
            <div key={group.date}>
              <div className="flex items-center gap-3 my-4">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-[10px] font-bold text-slate-400 uppercase">{group.date}</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              {group.messages.map(msg => {
                const isMe = msg.sender_email === userEmail
                return (
                  <div key={msg.id} className={`flex gap-2 mb-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white ${isMe ? 'bg-blue-600' : 'bg-gradient-to-br from-emerald-600 to-teal-600'}`}>
                      {ownerName(msg.sender_email).charAt(0)}
                    </div>
                    <div className={`max-w-[70%] ${isMe ? 'items-end' : 'items-start'}`}>
                      <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm
                        ${isMe
                          ? 'bg-blue-600 text-white rounded-tr-sm'
                          : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'}`}>
                        {msg.content}
                        {msg.file_url && (
                          <a href={msg.file_url} target="_blank" rel="noopener noreferrer"
                            className={`mt-2 flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold
                              ${isMe ? 'border-white/30 text-white/90 hover:bg-white/10' : 'border-slate-200 text-blue-600 hover:bg-blue-50'}`}>
                            <Paperclip className="h-3 w-3" /> {msg.file_name || 'Fichier'}
                          </a>
                        )}
                      </div>
                      <div className={`flex items-center gap-1 mt-1 ${isMe ? 'justify-end' : ''}`}>
                        <span className="text-[10px] text-slate-300">{formatTime(msg.created_at)}</span>
                        {isMe && (
                          msg.read_at
                            ? <CheckCheck className="h-3 w-3 text-blue-400" />
                            : <Check className="h-3 w-3 text-slate-300" />
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-slate-200 px-4 py-3 bg-white">
          <div className="flex items-end gap-2">
            <div className="relative flex-1">
              {showEmoji && <EmojiPicker onSelect={e => setInput(prev => prev + e)} onClose={() => setShowEmoji(false)} />}
              <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <button onClick={() => setShowEmoji(!showEmoji)} className="text-slate-400 hover:text-amber-500 transition-colors shrink-0 mb-0.5">
                  <Smile className="h-5 w-5" />
                </button>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  placeholder="Écris un message..."
                  rows={1}
                  className="flex-1 resize-none bg-transparent text-sm text-slate-800 placeholder-slate-400 focus:outline-none min-h-[22px] max-h-[100px] leading-5"
                  style={{ scrollbarWidth: 'none' }}
                  onInput={e => {
                    const t = e.currentTarget
                    t.style.height = 'auto'
                    t.style.height = Math.min(t.scrollHeight, 100) + 'px'
                  }}
                />
                <input ref={fileRef} type="file" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = '' }} />
                <button onClick={() => fileRef.current?.click()} className="text-slate-400 hover:text-blue-600 transition-colors shrink-0 mb-0.5">
                  <Paperclip className="h-5 w-5" />
                </button>
              </div>
            </div>
            <button onClick={sendMessage} disabled={!input.trim() || sending}
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all shrink-0
                ${input.trim() && !sending
                  ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'
                  : 'bg-slate-100 text-slate-300'}`}>
              <Send className="h-4.5 w-4.5" />
            </button>
          </div>
          <div className="mt-1 text-center text-[10px] text-slate-300">
            Entrée pour envoyer · Shift+Entrée pour nouvelle ligne
          </div>
        </div>
      </div>
    </div>
  )
}
