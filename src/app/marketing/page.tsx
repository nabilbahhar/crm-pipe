'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { ownerName, mad, fmt } from '@/lib/utils'
import {
  Megaphone, Linkedin, Mail, Calendar, Globe, Users,
  TrendingUp, Target, BarChart2, Plus, X, Edit2, Trash2,
  ExternalLink, Eye, ThumbsUp, MessageSquare, Share2,
  CheckCircle2, Clock, FileText, Send, ChevronDown,
  ArrowUp, ArrowDown, Zap, Filter,
} from 'lucide-react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, Legend,
} from 'recharts'

// ─── Types ───────────────────────────────────────────────────────────────────
type Campaign = {
  id: string
  name: string
  channel: 'linkedin' | 'email' | 'event' | 'website' | 'referral' | 'other'
  status: 'draft' | 'active' | 'completed' | 'paused'
  start_date: string | null
  end_date: string | null
  budget: number | null
  leads_generated: number
  impressions: number
  clicks: number
  notes: string | null
  owner_email: string | null
  created_at: string
}

type LinkedInPost = {
  id: string
  title: string
  content: string | null
  post_url: string | null
  published_date: string | null
  status: 'draft' | 'scheduled' | 'published'
  impressions: number
  likes: number
  comments: number
  shares: number
  leads: number
  author_email: string | null
  created_at: string
}

type ContentItem = {
  id: string
  title: string
  channel: 'linkedin' | 'email' | 'blog' | 'event'
  content_type: 'post' | 'article' | 'newsletter' | 'case_study' | 'announcement' | 'event_promo'
  status: 'idea' | 'draft' | 'scheduled' | 'published'
  scheduled_date: string | null
  assigned_to: string | null
  notes: string | null
  created_at: string
}

type LeadSource = {
  source: string
  count: number
  converted: number
  color: string
}

// ─── Constants ───────────────────────────────────────────────────────────────
const CHANNEL_CFG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  linkedin: { label: 'LinkedIn', color: '#0a66c2', bg: 'bg-blue-50', icon: <Linkedin className="h-4 w-4" /> },
  email:    { label: 'Email', color: '#ea580c', bg: 'bg-orange-50', icon: <Mail className="h-4 w-4" /> },
  event:    { label: 'Événement', color: '#7c3aed', bg: 'bg-violet-50', icon: <Calendar className="h-4 w-4" /> },
  website:  { label: 'Website', color: '#0d9488', bg: 'bg-teal-50', icon: <Globe className="h-4 w-4" /> },
  referral: { label: 'Referral', color: '#16a34a', bg: 'bg-emerald-50', icon: <Users className="h-4 w-4" /> },
  other:    { label: 'Autre', color: '#64748b', bg: 'bg-slate-50', icon: <Megaphone className="h-4 w-4" /> },
}

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: 'Brouillon', color: '#64748b', bg: 'bg-slate-100' },
  active:    { label: 'Active', color: '#16a34a', bg: 'bg-emerald-100' },
  completed: { label: 'Terminée', color: '#3b82f6', bg: 'bg-blue-100' },
  paused:    { label: 'En pause', color: '#f59e0b', bg: 'bg-amber-100' },
  scheduled: { label: 'Planifié', color: '#7c3aed', bg: 'bg-violet-100' },
  published: { label: 'Publié', color: '#16a34a', bg: 'bg-emerald-100' },
  idea:      { label: 'Idée', color: '#94a3b8', bg: 'bg-slate-50' },
}

const CONTENT_TYPES: Record<string, string> = {
  post: 'Post', article: 'Article', newsletter: 'Newsletter',
  case_study: 'Étude de cas', announcement: 'Annonce', event_promo: 'Promo événement',
}

const PIE_COLORS = ['#0a66c2', '#ea580c', '#7c3aed', '#0d9488', '#16a34a', '#64748b']

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function MarketingPage() {
  const [userEmail, setUserEmail] = useState('')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [posts, setPosts] = useState<LinkedInPost[]>([])
  const [content, setContent] = useState<ContentItem[]>([])
  const [prospects, setProspects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'linkedin' | 'campaigns' | 'calendar'>('overview')
  const [showNewCampaign, setShowNewCampaign] = useState(false)
  const [showNewPost, setShowNewPost] = useState(false)
  const [showNewContent, setShowNewContent] = useState(false)

  useEffect(() => {
    document.title = 'Marketing · CRM-PIPE'
    load()
  }, [])

  async function load() {
    setLoading(true)
    const [{ data: { user } }] = await Promise.all([supabase.auth.getUser()])
    if (user?.email) setUserEmail(user.email)

    // Load campaigns
    const { data: camps } = await supabase.from('marketing_campaigns').select('*').order('created_at', { ascending: false })
    if (camps) setCampaigns(camps as Campaign[])

    // Load LinkedIn posts
    const { data: lnPosts } = await supabase.from('linkedin_posts').select('*').order('published_date', { ascending: false })
    if (lnPosts) setPosts(lnPosts as LinkedInPost[])

    // Load content calendar
    const { data: items } = await supabase.from('content_calendar').select('*').order('scheduled_date', { ascending: true })
    if (items) setContent(items as ContentItem[])

    // Load prospects for lead source analysis
    const { data: prosp } = await supabase.from('prospects').select('id,source,status,created_at,converted_at')
    if (prosp) setProspects(prosp)

    setLoading(false)
  }

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalLeads = prospects.length
    const convertedLeads = prospects.filter((p: any) => p.converted_at).length
    const conversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0
    const totalBudget = campaigns.reduce((s, c) => s + (c.budget || 0), 0)
    const totalImpressions = posts.reduce((s, p) => s + p.impressions, 0) + campaigns.reduce((s, c) => s + c.impressions, 0)
    const totalEngagement = posts.reduce((s, p) => s + p.likes + p.comments + p.shares, 0)
    const activeCampaigns = campaigns.filter(c => c.status === 'active').length
    const topChannel = (() => {
      const counts: Record<string, number> = {}
      prospects.forEach((p: any) => { const s = p.source || 'other'; counts[s] = (counts[s] || 0) + 1 })
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
      return sorted[0] ? { name: CHANNEL_CFG[sorted[0][0]]?.label || sorted[0][0], count: sorted[0][1] } : { name: '—', count: 0 }
    })()
    return { totalLeads, convertedLeads, conversionRate, totalBudget, totalImpressions, totalEngagement, activeCampaigns, topChannel }
  }, [campaigns, posts, prospects])

  // ── Lead source data ──────────────────────────────────────────────────────
  const leadSources = useMemo(() => {
    const counts: Record<string, { count: number; converted: number }> = {}
    prospects.forEach((p: any) => {
      const s = p.source || 'other'
      if (!counts[s]) counts[s] = { count: 0, converted: 0 }
      counts[s].count++
      if (p.converted_at) counts[s].converted++
    })
    return Object.entries(counts).map(([source, data], i) => ({
      source: CHANNEL_CFG[source]?.label || source,
      count: data.count,
      converted: data.converted,
      color: PIE_COLORS[i % PIE_COLORS.length],
    }))
  }, [prospects])

  // ── LinkedIn stats ────────────────────────────────────────────────────────
  const linkedInStats = useMemo(() => {
    const published = posts.filter(p => p.status === 'published')
    const totalImpressions = published.reduce((s, p) => s + p.impressions, 0)
    const totalLikes = published.reduce((s, p) => s + p.likes, 0)
    const totalComments = published.reduce((s, p) => s + p.comments, 0)
    const totalShares = published.reduce((s, p) => s + p.shares, 0)
    const totalLeads = published.reduce((s, p) => s + p.leads, 0)
    const avgEngagement = published.length > 0 ? Math.round((totalLikes + totalComments + totalShares) / published.length) : 0
    return { published: published.length, totalImpressions, totalLikes, totalComments, totalShares, totalLeads, avgEngagement }
  }, [posts])

  // ── Monthly trend ─────────────────────────────────────────────────────────
  const monthlyTrend = useMemo(() => {
    const months: Record<string, { leads: number; posts: number; campaigns: number }> = {}
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      months[ym] = { leads: 0, posts: 0, campaigns: 0 }
    }
    prospects.forEach((p: any) => {
      const ym = (p.created_at || '').slice(0, 7)
      if (months[ym]) months[ym].leads++
    })
    posts.forEach(p => {
      const ym = (p.published_date || p.created_at).slice(0, 7)
      if (months[ym]) months[ym].posts++
    })
    campaigns.forEach(c => {
      const ym = (c.start_date || c.created_at).slice(0, 7)
      if (months[ym]) months[ym].campaigns++
    })
    const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
    return Object.entries(months).map(([ym, data]) => ({
      month: MONTHS_FR[parseInt(ym.split('-')[1]) - 1],
      ...data,
    }))
  }, [prospects, posts, campaigns])

  // ── Save handlers ─────────────────────────────────────────────────────────
  async function saveCampaign(data: Partial<Campaign>) {
    const { error } = await supabase.from('marketing_campaigns').insert({
      ...data, owner_email: userEmail,
    })
    if (!error) { setShowNewCampaign(false); load() }
  }

  async function savePost(data: Partial<LinkedInPost>) {
    const { error } = await supabase.from('linkedin_posts').insert({
      ...data, author_email: userEmail,
    })
    if (!error) { setShowNewPost(false); load() }
  }

  async function saveContent(data: Partial<ContentItem>) {
    const { error } = await supabase.from('content_calendar').insert({
      ...data, assigned_to: userEmail,
    })
    if (!error) { setShowNewContent(false); load() }
  }

  async function deleteCampaign(id: string) {
    await supabase.from('marketing_campaigns').delete().eq('id', id)
    load()
  }

  async function deletePost(id: string) {
    await supabase.from('linkedin_posts').delete().eq('id', id)
    load()
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const tabs = [
    { id: 'overview' as const, label: 'Vue d\'ensemble', icon: <BarChart2 className="h-4 w-4" /> },
    { id: 'linkedin' as const, label: 'LinkedIn', icon: <Linkedin className="h-4 w-4" /> },
    { id: 'campaigns' as const, label: 'Campagnes', icon: <Megaphone className="h-4 w-4" /> },
    { id: 'calendar' as const, label: 'Calendrier contenu', icon: <Calendar className="h-4 w-4" /> },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">

        {/* ── Header ── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-600 to-rose-500 text-white shadow-lg">
              <Megaphone className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900">Marketing</h1>
              <p className="text-xs text-slate-500">Stratégie, campagnes & contenu — Compucom Maroc</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowNewCampaign(true)} className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 transition-colors">
              <Plus className="h-3.5 w-3.5" /> Nouvelle campagne
            </button>
            <button onClick={() => setShowNewPost(true)} className="flex items-center gap-1.5 rounded-xl bg-[#0a66c2] px-4 py-2 text-xs font-bold text-white hover:bg-[#084d93] transition-colors">
              <Linkedin className="h-3.5 w-3.5" /> Post LinkedIn
            </button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 mb-6 bg-white rounded-xl p-1 ring-1 ring-slate-200 w-fit">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === t.id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
          </div>
        ) : (
          <>
            {/* ══════════════════════════════════════════════════════════════ */}
            {/* ── OVERVIEW TAB ── */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* KPI Cards */}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <KpiBox label="Leads générés" value={String(kpis.totalLeads)} sub={`${kpis.convertedLeads} convertis (${kpis.conversionRate}%)`} icon={<Users className="h-5 w-5" />} color="blue" />
                  <KpiBox label="Campagnes actives" value={String(kpis.activeCampaigns)} sub={`${campaigns.length} total`} icon={<Megaphone className="h-5 w-5" />} color="violet" />
                  <KpiBox label="Top canal" value={kpis.topChannel.name} sub={`${kpis.topChannel.count} leads`} icon={<TrendingUp className="h-5 w-5" />} color="green" />
                  <KpiBox label="Engagement total" value={String(kpis.totalEngagement)} sub={`${kpis.totalImpressions.toLocaleString('fr-FR')} impressions`} icon={<ThumbsUp className="h-5 w-5" />} color="amber" />
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {/* Lead Source Pie */}
                  <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 shadow-sm">
                    <h3 className="text-sm font-black text-slate-900 mb-4">Sources de leads</h3>
                    {leadSources.length === 0 ? (
                      <div className="py-10 text-center text-sm text-slate-400">Aucun prospect avec source définie</div>
                    ) : (
                      <div className="flex items-center gap-6">
                        <ResponsiveContainer width="50%" height={180}>
                          <PieChart>
                            <Pie data={leadSources} dataKey="count" nameKey="source" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                              {leadSources.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="flex-1 space-y-2">
                          {leadSources.map((s, i) => (
                            <div key={i} className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                                <span className="text-xs font-semibold text-slate-700">{s.source}</span>
                              </div>
                              <div className="text-xs font-bold text-slate-900">{s.count} <span className="text-slate-400 font-normal">({s.converted} conv.)</span></div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Monthly Trend */}
                  <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 shadow-sm">
                    <h3 className="text-sm font-black text-slate-900 mb-4">Tendance 6 mois</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={monthlyTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="leads" name="Leads" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="posts" name="Posts" fill="#0a66c2" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="campaigns" name="Campagnes" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Recent Campaigns */}
                <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-black text-slate-900">Campagnes récentes</h3>
                    <button onClick={() => setActiveTab('campaigns')} className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                      Voir tout &rarr;
                    </button>
                  </div>
                  {campaigns.length === 0 ? (
                    <div className="py-8 text-center text-sm text-slate-400">Aucune campagne — créez votre première !</div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {campaigns.slice(0, 6).map(c => (
                        <CampaignCard key={c.id} campaign={c} onDelete={() => deleteCampaign(c.id)} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* ── LINKEDIN TAB ── */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {activeTab === 'linkedin' && (
              <div className="space-y-6">
                {/* LinkedIn KPIs */}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-7">
                  <KpiBox label="Posts publiés" value={String(linkedInStats.published)} color="blue" icon={<FileText className="h-5 w-5" />} />
                  <KpiBox label="Impressions" value={linkedInStats.totalImpressions.toLocaleString('fr-FR')} color="slate" icon={<Eye className="h-5 w-5" />} />
                  <KpiBox label="Likes" value={String(linkedInStats.totalLikes)} color="blue" icon={<ThumbsUp className="h-5 w-5" />} />
                  <KpiBox label="Commentaires" value={String(linkedInStats.totalComments)} color="amber" icon={<MessageSquare className="h-5 w-5" />} />
                  <KpiBox label="Partages" value={String(linkedInStats.totalShares)} color="green" icon={<Share2 className="h-5 w-5" />} />
                  <KpiBox label="Leads LinkedIn" value={String(linkedInStats.totalLeads)} color="violet" icon={<Users className="h-5 w-5" />} />
                  <KpiBox label="Engage. moyen" value={String(linkedInStats.avgEngagement)} color="rose" icon={<Zap className="h-5 w-5" />} />
                </div>

                {/* LinkedIn Posts */}
                <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-black text-slate-900">Posts LinkedIn</h3>
                    <button onClick={() => setShowNewPost(true)} className="flex items-center gap-1.5 rounded-lg bg-[#0a66c2] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#084d93]">
                      <Plus className="h-3 w-3" /> Nouveau post
                    </button>
                  </div>
                  {posts.length === 0 ? (
                    <div className="py-10 text-center text-sm text-slate-400">
                      Aucun post LinkedIn enregistré.<br />
                      <span className="text-xs text-slate-300">Ajoutez vos posts manuellement pour suivre leur performance.</span>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {posts.map(p => (
                        <div key={p.id} className="flex items-start gap-4 rounded-xl border border-slate-100 p-4 hover:bg-slate-50 transition-colors">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#0a66c2] shrink-0">
                            <Linkedin className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-bold text-slate-900 truncate">{p.title}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_CFG[p.status]?.bg || 'bg-slate-100'}`} style={{ color: STATUS_CFG[p.status]?.color }}>
                                {STATUS_CFG[p.status]?.label || p.status}
                              </span>
                            </div>
                            {p.content && <div className="text-xs text-slate-500 line-clamp-2 mb-2">{p.content}</div>}
                            <div className="flex items-center gap-4 text-[10px] text-slate-400 font-semibold">
                              <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {p.impressions.toLocaleString('fr-FR')}</span>
                              <span className="flex items-center gap-1"><ThumbsUp className="h-3 w-3" /> {p.likes}</span>
                              <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {p.comments}</span>
                              <span className="flex items-center gap-1"><Share2 className="h-3 w-3" /> {p.shares}</span>
                              <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {p.leads} leads</span>
                              {p.published_date && <span>{new Date(p.published_date).toLocaleDateString('fr-MA')}</span>}
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            {p.post_url && (
                              <a href={p.post_url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                            <button onClick={() => deletePost(p.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* ── CAMPAIGNS TAB ── */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {activeTab === 'campaigns' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900">{campaigns.length} campagne{campaigns.length > 1 ? 's' : ''}</h3>
                  <button onClick={() => setShowNewCampaign(true)} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800">
                    <Plus className="h-3 w-3" /> Nouvelle
                  </button>
                </div>
                {campaigns.length === 0 ? (
                  <div className="rounded-2xl bg-white p-12 ring-1 ring-slate-200 text-center">
                    <Megaphone className="mx-auto h-12 w-12 text-slate-200 mb-3" />
                    <div className="text-sm font-bold text-slate-400">Aucune campagne</div>
                    <div className="text-xs text-slate-300 mt-1">Créez votre première campagne marketing</div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {campaigns.map(c => (
                      <CampaignCard key={c.id} campaign={c} onDelete={() => deleteCampaign(c.id)} detailed />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* ── CONTENT CALENDAR TAB ── */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {activeTab === 'calendar' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900">Calendrier de contenu</h3>
                  <button onClick={() => setShowNewContent(true)} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800">
                    <Plus className="h-3 w-3" /> Ajouter contenu
                  </button>
                </div>

                {/* Status columns */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {(['idea', 'draft', 'scheduled', 'published'] as const).map(status => {
                    const items = content.filter(c => c.status === status)
                    const cfg = STATUS_CFG[status]
                    return (
                      <div key={status} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full" style={{ background: cfg?.color }} />
                            <span className="text-xs font-black text-slate-900">{cfg?.label}</span>
                          </div>
                          <span className="text-[10px] font-bold text-slate-400">{items.length}</span>
                        </div>
                        <div className="space-y-2">
                          {items.length === 0 ? (
                            <div className="py-6 text-center text-[10px] text-slate-300">Aucun contenu</div>
                          ) : items.map(item => (
                            <div key={item.id} className="rounded-xl border border-slate-100 p-3 hover:border-slate-200 transition-colors">
                              <div className="text-xs font-bold text-slate-900 mb-1">{item.title}</div>
                              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                <span className={`rounded-full px-1.5 py-0.5 font-bold ${CHANNEL_CFG[item.channel]?.bg || 'bg-slate-50'}`} style={{ color: CHANNEL_CFG[item.channel]?.color }}>
                                  {CHANNEL_CFG[item.channel]?.label || item.channel}
                                </span>
                                <span>{CONTENT_TYPES[item.content_type] || item.content_type}</span>
                                {item.scheduled_date && <span>{new Date(item.scheduled_date).toLocaleDateString('fr-MA')}</span>}
                              </div>
                              {item.assigned_to && (
                                <div className="mt-1 text-[10px] text-slate-300">{ownerName(item.assigned_to)}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modals ── */}
      {showNewCampaign && <NewCampaignModal onClose={() => setShowNewCampaign(false)} onSave={saveCampaign} />}
      {showNewPost && <NewPostModal onClose={() => setShowNewPost(false)} onSave={savePost} />}
      {showNewContent && <NewContentModal onClose={() => setShowNewContent(false)} onSave={saveContent} />}
    </div>
  )
}

// ─── Sub-Components ──────────────────────────────────────────────────────────
function KpiBox({ label, value, sub, icon, color }: { label: string; value: string; sub?: string; icon: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    blue: 'from-blue-600 to-blue-400', violet: 'from-violet-600 to-violet-400',
    green: 'from-emerald-600 to-teal-400', amber: 'from-amber-500 to-orange-400',
    red: 'from-red-600 to-rose-400', slate: 'from-slate-800 to-slate-600',
    rose: 'from-pink-600 to-rose-400',
  }
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
      <div className={`h-1 bg-gradient-to-r ${colors[color] || colors.blue}`} />
      <div className="p-4">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${colors[color] || colors.blue} text-white mb-2`}>
          {icon}
        </div>
        <div className="text-lg font-black text-slate-900">{value}</div>
        <div className="text-[10px] font-semibold text-slate-500">{label}</div>
        {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

function CampaignCard({ campaign: c, onDelete, detailed }: { campaign: Campaign; onDelete: () => void; detailed?: boolean }) {
  const ch = CHANNEL_CFG[c.channel] || CHANNEL_CFG.other
  const st = STATUS_CFG[c.status] || STATUS_CFG.draft
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${ch.bg}`} style={{ color: ch.color }}>
            {ch.icon}
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900">{c.name}</div>
            <div className="text-[10px] text-slate-400">{ch.label}</div>
          </div>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${st.bg}`} style={{ color: st.color }}>
          {st.label}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-sm font-black text-slate-900">{c.leads_generated}</div>
          <div className="text-[10px] text-slate-400">Leads</div>
        </div>
        <div>
          <div className="text-sm font-black text-slate-900">{c.impressions.toLocaleString('fr-FR')}</div>
          <div className="text-[10px] text-slate-400">Impressions</div>
        </div>
        <div>
          <div className="text-sm font-black text-slate-900">{c.clicks}</div>
          <div className="text-[10px] text-slate-400">Clicks</div>
        </div>
      </div>
      {detailed && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
          <div>{c.start_date ? new Date(c.start_date).toLocaleDateString('fr-MA') : '—'} → {c.end_date ? new Date(c.end_date).toLocaleDateString('fr-MA') : '—'}</div>
          {c.budget ? <div className="font-bold text-slate-600">{c.budget.toLocaleString('fr-FR')} MAD</div> : null}
          <button onClick={onDelete} className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
        </div>
      )}
    </div>
  )
}

// ─── Modals ──────────────────────────────────────────────────────────────────
function NewCampaignModal({ onClose, onSave }: { onClose: () => void; onSave: (d: Partial<Campaign>) => void }) {
  const [name, setName] = useState('')
  const [channel, setChannel] = useState<string>('linkedin')
  const [budget, setBudget] = useState('')
  const [startDate, setStartDate] = useState('')
  const [notes, setNotes] = useState('')

  const inp = "h-9 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"
  return (
    <Modal title="Nouvelle campagne" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1 block">Nom *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Campagne Q1 LinkedIn" className={inp} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-600 mb-1 block">Canal</label>
            <select value={channel} onChange={e => setChannel(e.target.value)} className={inp}>
              {Object.entries(CHANNEL_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600 mb-1 block">Budget (MAD)</label>
            <input value={budget} onChange={e => setBudget(e.target.value)} type="number" placeholder="0" className={inp} />
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1 block">Date début</label>
          <input value={startDate} onChange={e => setStartDate(e.target.value)} type="date" className={inp} />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1 block">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Description de la campagne..." className={inp + " h-auto py-2"} />
        </div>
        <button onClick={() => { if (name.trim()) onSave({ name, channel: channel as any, budget: Number(budget) || 0, start_date: startDate || null, notes: notes || null, status: 'draft', leads_generated: 0, impressions: 0, clicks: 0 }) }}
          disabled={!name.trim()}
          className="w-full h-10 rounded-xl bg-slate-900 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed">
          Créer la campagne
        </button>
      </div>
    </Modal>
  )
}

function NewPostModal({ onClose, onSave }: { onClose: () => void; onSave: (d: Partial<LinkedInPost>) => void }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [postUrl, setPostUrl] = useState('')
  const [publishedDate, setPublishedDate] = useState('')
  const [status, setStatus] = useState<string>('draft')

  const inp = "h-9 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"
  return (
    <Modal title="Nouveau post LinkedIn" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1 block">Titre / Sujet *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Déploiement BKAM réussi" className={inp} autoFocus />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1 block">Contenu du post</label>
          <textarea value={content} onChange={e => setContent(e.target.value)} rows={3} placeholder="Le texte du post LinkedIn..." className={inp + " h-auto py-2"} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-600 mb-1 block">URL du post</label>
            <input value={postUrl} onChange={e => setPostUrl(e.target.value)} placeholder="https://linkedin.com/..." className={inp} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600 mb-1 block">Statut</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className={inp}>
              <option value="draft">Brouillon</option>
              <option value="scheduled">Planifié</option>
              <option value="published">Publié</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1 block">Date de publication</label>
          <input value={publishedDate} onChange={e => setPublishedDate(e.target.value)} type="date" className={inp} />
        </div>
        <button onClick={() => { if (title.trim()) onSave({ title, content: content || null, post_url: postUrl || null, published_date: publishedDate || null, status: status as any, impressions: 0, likes: 0, comments: 0, shares: 0, leads: 0 }) }}
          disabled={!title.trim()}
          className="w-full h-10 rounded-xl bg-[#0a66c2] text-sm font-bold text-white hover:bg-[#084d93] disabled:opacity-50 disabled:cursor-not-allowed">
          Enregistrer le post
        </button>
      </div>
    </Modal>
  )
}

function NewContentModal({ onClose, onSave }: { onClose: () => void; onSave: (d: Partial<ContentItem>) => void }) {
  const [title, setTitle] = useState('')
  const [channel, setChannel] = useState<string>('linkedin')
  const [contentType, setContentType] = useState<string>('post')
  const [scheduledDate, setScheduledDate] = useState('')
  const [notes, setNotes] = useState('')

  const inp = "h-9 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"
  return (
    <Modal title="Ajouter du contenu" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1 block">Titre *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Article case study BKAM" className={inp} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-600 mb-1 block">Canal</label>
            <select value={channel} onChange={e => setChannel(e.target.value)} className={inp}>
              <option value="linkedin">LinkedIn</option>
              <option value="email">Email</option>
              <option value="blog">Blog</option>
              <option value="event">Événement</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600 mb-1 block">Type</label>
            <select value={contentType} onChange={e => setContentType(e.target.value)} className={inp}>
              {Object.entries(CONTENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1 block">Date planifiée</label>
          <input value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} type="date" className={inp} />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1 block">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Notes..." className={inp + " h-auto py-2"} />
        </div>
        <button onClick={() => { if (title.trim()) onSave({ title, channel: channel as any, content_type: contentType as any, scheduled_date: scheduledDate || null, notes: notes || null, status: 'idea' }) }}
          disabled={!title.trim()}
          className="w-full h-10 rounded-xl bg-slate-900 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed">
          Ajouter au calendrier
        </button>
      </div>
    </Modal>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <span className="text-sm font-black text-slate-900">{title}</span>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100"><X className="h-4 w-4 text-slate-400" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
