'use client'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { ownerName } from '@/lib/utils'
import {
  Send, Paperclip, Smile, File, X, Download, Trash2,
  Search, MessageCircle, FolderOpen, Gamepad2, RefreshCw,
  Check, CheckCheck, Briefcase, Bell, Coffee,
  Image as ImageIcon, FileText, FileSpreadsheet, Film,
  ChevronDown, Pin, Reply, MoreHorizontal,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────
type Channel = 'boulot' | 'rappels' | 'blabla'

type Message = {
  id: string
  sender_email: string
  content: string
  channel: Channel
  file_url: string | null
  file_name: string | null
  file_size: number | null
  created_at: string
  read_at: string | null
}

type SharedFile = {
  id: string
  name: string
  url: string
  storage_path: string | null
  uploaded_by: string
  size: number | null
  channel: Channel
  message_id: string | null
  created_at: string
}

type SideTab = 'channels' | 'files' | 'game'

// ── Channel config ──────────────────────────────────────────
const CHANNELS: { id: Channel; label: string; icon: typeof Briefcase; color: string; bg: string; border: string; desc: string }[] = [
  { id: 'boulot', label: 'Boulot', icon: Briefcase, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', desc: 'Discussions pro & deals' },
  { id: 'rappels', label: 'Rappels', icon: Bell, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', desc: 'Tâches & reminders' },
  { id: 'blabla', label: 'Blabla', icon: Coffee, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', desc: 'Détente & discussions' },
]

// ── Emoji Picker ────────────────────────────────────────────
const EMOJI_CATS = [
  { label: 'Fréquents', emojis: ['😂','👍','🔥','💪','🎯','✅','❌','⚡','💰','🚀','😎','🤝','☕','💀','🫡','👀','🤣','😤','🙏','💯'] },
  { label: 'Business', emojis: ['📊','📈','📉','💼','🏢','📋','📌','🔔','💡','🎓','🏆','🥇','📦','🛡️','🔑','📧','📱','💻','🖥️','📁'] },
  { label: 'Réactions', emojis: ['❤️','👏','🤔','😱','🤯','😅','😍','🥳','🤞','👊','✊','🫶','🙌','💥','🎉','🎊','👑','💎','🌟','⭐'] },
]

function EmojiPicker({ onSelect, onClose }: { onSelect: (e: string) => void; onClose: () => void }) {
  return (
    <div className="absolute bottom-full left-0 mb-2 w-72 rounded-2xl border border-slate-200 bg-white shadow-xl z-50 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
        <span className="text-xs font-bold text-slate-600">Emojis</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="p-2 max-h-48 overflow-y-auto space-y-2">
        {EMOJI_CATS.map(cat => (
          <div key={cat.label}>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 px-1">{cat.label}</div>
            <div className="flex flex-wrap gap-0.5">
              {cat.emojis.map(e => (
                <button key={e} onClick={() => { onSelect(e); onClose() }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 text-lg transition-colors">{e}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── File icon helper ─────────────────────────────────────────
function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (['jpg','jpeg','png','gif','webp'].includes(ext)) return <ImageIcon className="h-4 w-4" />
  if (['pdf'].includes(ext)) return <FileText className="h-4 w-4 text-red-500" />
  if (['xlsx','xls','csv'].includes(ext)) return <FileSpreadsheet className="h-4 w-4 text-green-600" />
  if (['mp4','mov','avi'].includes(ext)) return <Film className="h-4 w-4 text-purple-500" />
  if (['doc','docx'].includes(ext)) return <FileText className="h-4 w-4 text-blue-600" />
  if (['pptx','ppt'].includes(ext)) return <FileText className="h-4 w-4 text-orange-500" />
  return <File className="h-4 w-4" />
}

function fmtSize(b: number | null) {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1024*1024) return `${(b/1024).toFixed(0)} KB`
  return `${(b/1024/1024).toFixed(1)} MB`
}

function isImage(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return ['jpg','jpeg','png','gif','webp'].includes(ext)
}

// ── Sales Game ──────────────────────────────────────────────
function SalesGame() {
  const [score, setScore] = useState({ nabil: 0, salim: 0 })
  const [round, setRound] = useState(0)
  const [question, setQuestion] = useState<{ q: string; a: string; b: string; correct: 'a'|'b' } | null>(null)
  const [answered, setAnswered] = useState<string | null>(null)
  const [turn, setTurn] = useState<'nabil'|'salim'>('nabil')

  const questions = useMemo(() => [
    { q: 'Un client dit "Je vais réfléchir". Tu fais quoi ?', a: 'Tu rappelles dans 2 semaines', b: 'Tu demandes "Qu\'est-ce qui vous fait hésiter ?"', correct: 'b' as const },
    { q: 'Deal de 2M MAD, le client veut -30%. Tu proposes quoi ?', a: 'Tu négoces un -15% avec services ajoutés', b: 'Tu acceptes pour closer vite', correct: 'a' as const },
    { q: 'Un prospect te ghoste après le devis. Next step ?', a: 'Tu envoies un email de relance standard', b: 'Tu appelles avec une info utile pour lui', correct: 'b' as const },
    { q: 'Le closing est prévu ce mois. Le client demande un report.', a: 'Tu acceptes en proposant une nouvelle date ferme', b: 'Tu attends qu\'il revienne', correct: 'a' as const },
    { q: 'Un concurrent propose -20% que toi. Comment tu réagis ?', a: 'Tu baisses ton prix aussi', b: 'Tu valorises ta différenciation et le TCO', correct: 'b' as const },
    { q: 'Forecast review demain. 3 deals sont incertains.', a: 'Tu les gardes en Commit pour faire beau', b: 'Tu les rétrogrades honnêtement', correct: 'b' as const },
    { q: 'Le DSI valide mais les achats bloquent.', a: 'Tu attends que le DSI pousse en interne', b: 'Tu cherches un champion aux achats', correct: 'b' as const },
    { q: 'Client existant hésite à renouveler.', a: '"On a de nouvelles features pour vous"', b: '"Sans renouvellement, vous perdez le support"', correct: 'a' as const },
  ], [])

  function startRound() {
    if (round >= questions.length) return
    setQuestion(questions[round]); setAnswered(null)
  }

  function answer(choice: 'a'|'b') {
    if (!question || answered) return
    setAnswered(choice)
    if (choice === question.correct) setScore(p => ({ ...p, [turn]: p[turn]+1 }))
    setTimeout(() => { setRound(p=>p+1); setTurn(p=>p==='nabil'?'salim':'nabil'); setQuestion(null); setAnswered(null) }, 1500)
  }

  function reset() { setScore({ nabil:0, salim:0 }); setRound(0); setQuestion(null); setAnswered(null); setTurn('nabil') }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="text-sm font-black text-slate-900">🎮 Sales Challenge</div>
        <div className="text-[10px] text-slate-400">Qui est le meilleur commercial ?</div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className={`rounded-2xl border p-3 text-center ${turn==='nabil'&&!question?'border-blue-300 bg-blue-50 ring-2 ring-blue-200':'border-slate-200 bg-slate-50'}`}>
            <div className="text-lg font-black text-slate-900">{score.nabil}</div>
            <div className="text-[10px] font-bold text-slate-500">Nabil 🔥</div>
          </div>
          <div className={`rounded-2xl border p-3 text-center ${turn==='salim'&&!question?'border-emerald-300 bg-emerald-50 ring-2 ring-emerald-200':'border-slate-200 bg-slate-50'}`}>
            <div className="text-lg font-black text-slate-900">{score.salim}</div>
            <div className="text-[10px] font-bold text-slate-500">Salim 💪</div>
          </div>
        </div>
        {question ? (
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-400 uppercase">Round {round+1} — {turn==='nabil'?'Nabil':'Salim'}</div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-bold text-slate-900 mb-3">{question.q}</div>
              <div className="space-y-2">
                {(['a','b'] as const).map(ch => (
                  <button key={ch} onClick={() => answer(ch)}
                    className={`w-full text-left rounded-xl border p-3 text-xs font-semibold transition-all
                      ${answered===ch?(question.correct===ch?'border-emerald-400 bg-emerald-50 text-emerald-800':'border-red-400 bg-red-50 text-red-800'):'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'}`}>
                    {ch.toUpperCase()}. {question[ch]}
                    {answered && question.correct===ch && <span className="ml-2">✅</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : round >= questions.length ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center space-y-3">
            <div className="text-3xl">🏆</div>
            <div className="text-lg font-black text-slate-900">{score.nabil>score.salim?'Nabil gagne !':score.salim>score.nabil?'Salim gagne !':'Égalité !'}</div>
            <div className="text-sm text-slate-500">{score.nabil} - {score.salim}</div>
            <button onClick={reset} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"><RefreshCw className="h-3.5 w-3.5"/>Rejouer</button>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center space-y-3">
            <div className="text-2xl">{turn==='nabil'?'🔥':'💪'}</div>
            <div className="text-sm font-bold text-slate-900">Tour de {turn==='nabil'?'Nabil':'Salim'}</div>
            <button onClick={startRound} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700">{round===0?'Commencer':'Question suivante'}</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main ────────────────────────────────────────────────────
export default function MessagesPage() {
  const [userEmail, setUserEmail] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [activeChannel, setActiveChannel] = useState<Channel>('boulot')
  const [sideTab, setSideTab] = useState<SideTab>('channels')
  const [showEmoji, setShowEmoji] = useState(false)
  const [sharedFiles, setSharedFiles] = useState<SharedFile[]>([])
  const [fileSearch, setFileSearch] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const otherEmail = userEmail === 'nabil.imdh@gmail.com' ? 's.chitachny@compucom.ma' : 'nabil.imdh@gmail.com'
  const otherName = ownerName(otherEmail)

  // ── Mark as read ──
  async function markAllRead(email: string) {
    try {
      await supabase.from('team_messages').update({ read_at: new Date().toISOString() }).neq('sender_email', email).is('read_at', null)
    } catch {}
  }

  // ── Load ──
  async function loadMessages() {
    setLoading(true)
    try {
      const { data } = await supabase.from('team_messages').select('*').order('created_at', { ascending: true }).limit(1000)
      if (data) setMessages(data as Message[])
    } catch {}
    setLoading(false)
  }

  async function loadFiles() {
    try {
      const { data } = await supabase.from('shared_files').select('*').order('created_at', { ascending: false })
      if (data) setSharedFiles(data as SharedFile[])
    } catch {}
  }

  useEffect(() => {
    document.title = 'Messages · CRM-PIPE'
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) { setUserEmail(data.user.email); markAllRead(data.user.email) }
    })
    loadMessages(); loadFiles()

    const ch = supabase.channel('team-messages-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_messages' }, payload => {
        const m = payload.new as Message
        setMessages(prev => [...prev, m])
        supabase.auth.getUser().then(({ data }) => {
          if (data.user?.email && m.sender_email !== data.user.email)
            supabase.from('team_messages').update({ read_at: new Date().toISOString() }).eq('id', m.id).then(()=>{})
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, activeChannel])

  // ── Send message ──
  async function sendMessage() {
    if ((!input.trim() && pendingFiles.length === 0) || sending || !userEmail) return
    setSending(true)
    try {
      // Upload pending files first
      for (const f of pendingFiles) {
        await uploadFile(f)
      }
      setPendingFiles([])

      // Send text message if any
      if (input.trim()) {
        await supabase.from('team_messages').insert({ sender_email: userEmail, content: input.trim(), channel: activeChannel })
        setInput('')
      }
      inputRef.current?.focus()
    } catch (err) { console.error('Send error:', err) }
    setSending(false)
  }

  // ── Upload file via /api/upload (service role, bypasses RLS) ──
  async function uploadFile(file: File) {
    setUploading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const path = `chat/${activeChannel}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`
      const form = new FormData()
      form.append('file', file)
      form.append('bucket', 'team-files')
      form.append('path', path)
      form.append('file_type', 'chat')

      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
        body: form,
      })

      if (!res.ok) {
        const err = await res.json()
        console.error('Upload error:', err)
        return
      }

      const result = await res.json()
      // Get public URL
      const { data: urlData } = supabase.storage.from('team-files').getPublicUrl(result.path)
      const publicUrl = urlData.publicUrl

      // Insert message with file
      const { data: msgData } = await supabase.from('team_messages').insert({
        sender_email: userEmail,
        content: `📎 ${file.name}`,
        channel: activeChannel,
        file_url: publicUrl,
        file_name: file.name,
        file_size: file.size,
      }).select('id').single()

      // Insert shared_files record
      await supabase.from('shared_files').insert({
        name: file.name,
        url: publicUrl,
        storage_path: result.path,
        uploaded_by: userEmail,
        size: file.size,
        channel: activeChannel,
        message_id: msgData?.id || null,
      })

      loadFiles()
    } catch (err) { console.error('Upload error:', err) }
    setUploading(false)
  }

  // ── File handling ──
  function handleFilesSelected(files: FileList | null) {
    if (!files) return
    const arr = Array.from(files)
    // Under 10MB each
    const valid = arr.filter(f => f.size <= 10 * 1024 * 1024)
    if (valid.length < arr.length) alert('Certains fichiers dépassent 10MB et ont été ignorés.')
    setPendingFiles(prev => [...prev, ...valid])
  }

  // ── Drag & drop ──
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    handleFilesSelected(e.dataTransfer.files)
  }, [])

  // ── Channel messages ──
  const channelMessages = useMemo(() => messages.filter(m => (m.channel || 'boulot') === activeChannel), [messages, activeChannel])

  // ── Unread counts per channel ──
  const unreadCounts = useMemo(() => {
    const counts: Record<Channel, number> = { boulot: 0, rappels: 0, blabla: 0 }
    for (const m of messages) {
      if (m.sender_email !== userEmail && !m.read_at) {
        const ch = (m.channel || 'boulot') as Channel
        counts[ch]++
      }
    }
    return counts
  }, [messages, userEmail])

  // ── Group messages by date ──
  const grouped = useMemo(() => {
    const g: { date: string; msgs: Message[] }[] = []
    let cur = ''
    for (const m of channelMessages) {
      const d = new Date(m.created_at).toLocaleDateString('fr-MA', { weekday: 'long', day: 'numeric', month: 'long' })
      if (d !== cur) { cur = d; g.push({ date: d, msgs: [m] }) }
      else g[g.length-1].msgs.push(m)
    }
    return g
  }, [channelMessages])

  // ── Files filtered ──
  const filteredFiles = useMemo(() => {
    let f = sharedFiles
    if (fileSearch.trim()) { const q = fileSearch.toLowerCase(); f = f.filter(x => x.name.toLowerCase().includes(q)) }
    return f
  }, [sharedFiles, fileSearch])

  // ── File stats ──
  const fileStats = useMemo(() => {
    const byChannel: Record<Channel, number> = { boulot: 0, rappels: 0, blabla: 0 }
    for (const f of sharedFiles) byChannel[(f.channel || 'boulot') as Channel]++
    return { total: sharedFiles.length, byChannel, totalSize: sharedFiles.reduce((s, f) => s + (f.size || 0), 0) }
  }, [sharedFiles])

  function formatTime(iso: string) {
    const d = new Date(iso), t = new Date()
    const isToday = d.toDateString() === t.toDateString()
    if (isToday) return d.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('fr-MA', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' })
  }

  const chCfg = CHANNELS.find(c => c.id === activeChannel)!

  return (
    <div className="flex h-[calc(100vh-64px)] bg-white">
      {/* ══ Left Sidebar ══ */}
      <div className="w-80 shrink-0 border-r border-slate-200 bg-slate-50/80 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-blue-600" /> Messages
          </h2>
          <p className="text-[10px] text-slate-400 mt-0.5">Nabil & Salim — Compucom Maroc</p>
        </div>

        {/* Side tabs */}
        <div className="flex border-b border-slate-200">
          {([
            { id: 'channels' as const, icon: MessageCircle, label: 'Channels' },
            { id: 'files' as const, icon: FolderOpen, label: 'Fichiers' },
            { id: 'game' as const, icon: Gamepad2, label: 'Jeu' },
          ]).map(t => (
            <button key={t.id} onClick={() => setSideTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold transition-colors
                ${sideTab === t.id ? 'text-blue-600 border-b-2 border-blue-600 bg-white/50' : 'text-slate-400 hover:text-slate-600'}`}>
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>

        {/* Side content */}
        <div className="flex-1 overflow-y-auto">
          {sideTab === 'channels' && (
            <div className="p-3 space-y-2">
              {/* Conversation header */}
              <div className="flex items-center gap-3 px-2 py-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-white text-sm font-black shrink-0">
                  {otherName.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900">{otherName}</div>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> En ligne
                  </div>
                </div>
              </div>

              <div className="h-px bg-slate-200 my-2" />

              {/* Channels list */}
              {CHANNELS.map(ch => {
                const isActive = activeChannel === ch.id
                const unread = unreadCounts[ch.id]
                const lastMsg = [...messages].reverse().find(m => (m.channel || 'boulot') === ch.id)
                const Icon = ch.icon
                return (
                  <button key={ch.id} onClick={() => setActiveChannel(ch.id)}
                    className={`w-full flex items-center gap-3 rounded-xl p-3 transition-all text-left
                      ${isActive ? `${ch.bg} ${ch.border} border ring-1 ring-offset-0 ring-${ch.id==='boulot'?'blue':ch.id==='rappels'?'amber':'emerald'}-200` : 'hover:bg-slate-100 border border-transparent'}`}>
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isActive ? ch.bg : 'bg-slate-100'} ${ch.color} shrink-0`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-bold ${isActive ? 'text-slate-900' : 'text-slate-700'}`}>{ch.label}</span>
                        {unread > 0 && (
                          <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-black text-white
                            ${ch.id==='boulot'?'bg-blue-600':ch.id==='rappels'?'bg-amber-500':'bg-emerald-500'}`}>
                            {unread}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">
                        {lastMsg ? lastMsg.content.slice(0, 35) + (lastMsg.content.length > 35 ? '...' : '') : ch.desc}
                      </div>
                    </div>
                  </button>
                )
              })}

              {/* Quick stats */}
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Statistiques</div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 p-2">
                    <div className="text-sm font-black text-slate-900">{messages.length}</div>
                    <div className="text-[9px] text-slate-400">Messages</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2">
                    <div className="text-sm font-black text-slate-900">{fileStats.total}</div>
                    <div className="text-[9px] text-slate-400">Fichiers</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2">
                    <div className="text-sm font-black text-slate-900">{fmtSize(fileStats.totalSize) || '0'}</div>
                    <div className="text-[9px] text-slate-400">Taille</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {sideTab === 'files' && (
            <div className="p-3 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input value={fileSearch} onChange={e => setFileSearch(e.target.value)}
                  placeholder="Chercher un fichier..." className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none focus:border-blue-400" />
              </div>

              {/* File count by channel */}
              <div className="flex gap-1.5">
                {CHANNELS.map(ch => (
                  <div key={ch.id} className={`flex-1 rounded-lg ${ch.bg} px-2 py-1.5 text-center`}>
                    <div className={`text-xs font-black ${ch.color}`}>{fileStats.byChannel[ch.id]}</div>
                    <div className="text-[9px] text-slate-400">{ch.label}</div>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5 max-h-[calc(100vh-350px)] overflow-y-auto">
                {filteredFiles.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">Aucun fichier partagé</div>
                ) : filteredFiles.map(f => (
                  <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2.5 hover:bg-slate-50 transition-colors group">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 shrink-0">
                      {fileIcon(f.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-800 truncate">{f.name}</div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                        {ownerName(f.uploaded_by).split(' ')[0]} · {fmtSize(f.size)}
                        <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-bold
                          ${f.channel==='boulot'?'bg-blue-50 text-blue-600':f.channel==='rappels'?'bg-amber-50 text-amber-600':'bg-emerald-50 text-emerald-600'}`}>
                          {f.channel || 'boulot'}
                        </span>
                      </div>
                    </div>
                    <Download className="h-3.5 w-3.5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {sideTab === 'game' && <SalesGame />}
        </div>
      </div>

      {/* ══ Main Chat ══ */}
      <div className="flex-1 flex flex-col"
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}>

        {/* Drag overlay */}
        {dragOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-blue-600/10 backdrop-blur-sm border-2 border-dashed border-blue-400 rounded-xl m-2 pointer-events-none">
            <div className="text-center">
              <Paperclip className="h-10 w-10 text-blue-500 mx-auto mb-2" />
              <div className="text-lg font-bold text-blue-700">Déposer les fichiers ici</div>
              <div className="text-sm text-blue-500">Max 10MB par fichier</div>
            </div>
          </div>
        )}

        {/* Chat header — Channel info */}
        <div className={`flex items-center justify-between px-6 py-3 border-b ${chCfg.border} ${chCfg.bg}/30`}>
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${chCfg.bg} ${chCfg.color}`}>
              <chCfg.icon className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                #{chCfg.label}
                <span className="text-[10px] font-normal text-slate-400">· {channelMessages.length} messages</span>
              </div>
              <div className="text-[10px] text-slate-400">{chCfg.desc}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-black border-2 border-white">N</div>
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white text-[10px] font-black border-2 border-white">S</div>
            </div>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1" style={{ background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)' }}>
          {loading && <div className="flex items-center justify-center py-8"><RefreshCw className="h-5 w-5 animate-spin text-slate-300" /></div>}

          {!loading && channelMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className={`flex h-16 w-16 items-center justify-center rounded-2xl ${chCfg.bg} ${chCfg.color} mb-4`}>
                <chCfg.icon className="h-8 w-8" />
              </div>
              <div className="text-sm font-bold text-slate-400">Aucun message dans #{chCfg.label}</div>
              <div className="text-xs text-slate-300 mt-1">
                {activeChannel === 'boulot' ? 'Discussions pro, deals, relances...' :
                 activeChannel === 'rappels' ? 'Rappels, tâches, deadlines...' :
                 'Blagues, pause café, détente...'}
              </div>
            </div>
          )}

          {grouped.map(group => (
            <div key={group.date}>
              <div className="flex items-center gap-3 my-4">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">{group.date}</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              {group.msgs.map(msg => {
                const isMe = msg.sender_email === userEmail
                const hasFile = !!msg.file_url
                const isImg = hasFile && msg.file_name && isImage(msg.file_name)
                return (
                  <div key={msg.id} className={`flex gap-2.5 mb-3 ${isMe ? 'flex-row-reverse' : ''} group`}>
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white mt-1
                      ${isMe ? 'bg-blue-600' : 'bg-gradient-to-br from-emerald-600 to-teal-600'}`}>
                      {ownerName(msg.sender_email).charAt(0)}
                    </div>
                    <div className={`max-w-[70%] ${isMe ? 'items-end' : 'items-start'}`}>
                      <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm
                        ${isMe
                          ? 'bg-blue-600 text-white rounded-tr-sm'
                          : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'}`}>

                        {/* Text */}
                        {!hasFile && msg.content}
                        {hasFile && !msg.content.startsWith('📎') && <div className="mb-2">{msg.content}</div>}

                        {/* Image preview */}
                        {isImg && (
                          <a href={msg.file_url!} target="_blank" rel="noopener noreferrer" className="block mt-1">
                            <img src={msg.file_url!} alt={msg.file_name || ''} className="max-w-xs max-h-48 rounded-xl object-cover border border-white/20" />
                          </a>
                        )}

                        {/* File attachment */}
                        {hasFile && !isImg && (
                          <a href={msg.file_url!} target="_blank" rel="noopener noreferrer"
                            className={`mt-1.5 flex items-center gap-2.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all
                              ${isMe ? 'border-white/20 text-white/90 hover:bg-white/10 bg-white/5' : 'border-slate-200 text-slate-700 hover:bg-blue-50 bg-slate-50'}`}>
                            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${isMe ? 'bg-white/10' : 'bg-white'}`}>
                              {fileIcon(msg.file_name || '')}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="truncate">{msg.file_name || 'Fichier'}</div>
                              {msg.file_size && <div className={`text-[10px] ${isMe ? 'text-white/50' : 'text-slate-400'}`}>{fmtSize(msg.file_size)}</div>}
                            </div>
                            <Download className="h-3.5 w-3.5 shrink-0 opacity-50" />
                          </a>
                        )}
                      </div>
                      <div className={`flex items-center gap-1 mt-1 ${isMe ? 'justify-end' : ''}`}>
                        <span className="text-[10px] text-slate-300">{formatTime(msg.created_at)}</span>
                        {isMe && (msg.read_at
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

        {/* Pending files preview */}
        {pendingFiles.length > 0 && (
          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50">
            <div className="flex flex-wrap gap-2">
              {pendingFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs">
                  {fileIcon(f.name)}
                  <span className="font-medium text-slate-700 max-w-[120px] truncate">{f.name}</span>
                  <span className="text-slate-400">{fmtSize(f.size)}</span>
                  <button onClick={() => setPendingFiles(prev => prev.filter((_,j) => j!==i))} className="text-slate-300 hover:text-red-500">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upload progress */}
        {uploading && (
          <div className="px-4 py-2 border-t border-blue-100 bg-blue-50">
            <div className="flex items-center gap-2 text-xs text-blue-600 font-semibold">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Upload en cours...
            </div>
          </div>
        )}

        {/* Input area */}
        <div className="border-t border-slate-200 px-4 py-3 bg-white">
          <div className="flex items-end gap-2">
            <div className="relative flex-1">
              {showEmoji && <EmojiPicker onSelect={e => setInput(p => p+e)} onClose={() => setShowEmoji(false)} />}
              <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                <button onClick={() => setShowEmoji(!showEmoji)} className="text-slate-400 hover:text-amber-500 transition-colors shrink-0 mb-0.5">
                  <Smile className="h-5 w-5" />
                </button>
                <textarea ref={inputRef} value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  placeholder={`Message dans #${chCfg.label}...`}
                  rows={1}
                  className="flex-1 resize-none bg-transparent text-sm text-slate-800 placeholder-slate-400 focus:outline-none min-h-[22px] max-h-[100px] leading-5"
                  style={{ scrollbarWidth: 'none' }}
                  onInput={e => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 100) + 'px' }} />
                <input ref={fileRef} type="file" className="hidden" multiple accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.xlsx,.xls,.docx,.doc,.csv,.pptx,.ppt"
                  onChange={e => { handleFilesSelected(e.target.files); e.target.value = '' }} />
                <button onClick={() => fileRef.current?.click()} className="text-slate-400 hover:text-blue-600 transition-colors shrink-0 mb-0.5" title="Joindre un fichier">
                  <Paperclip className="h-5 w-5" />
                </button>
              </div>
            </div>
            <button onClick={sendMessage} disabled={(!input.trim() && pendingFiles.length===0) || sending}
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all shrink-0
                ${(input.trim() || pendingFiles.length>0) && !sending
                  ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-200'
                  : 'bg-slate-100 text-slate-300'}`}>
              <Send className="h-4.5 w-4.5" />
            </button>
          </div>
          <div className="mt-1.5 flex items-center justify-between px-1">
            <div className="text-[10px] text-slate-300">Entrée envoyer · Shift+Entrée nouvelle ligne · Glisser-déposer fichiers</div>
            <div className={`text-[10px] font-bold ${chCfg.color}`}>#{chCfg.label}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
