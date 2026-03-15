'use client'

import { useEffect, useState, useMemo } from 'react'
import { Lightbulb, Rocket, CheckCircle2, Clock, Star, ChevronRight, ArrowUpRight, Target, Zap, TrendingUp, Users, BarChart3, Shield, Cog } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────
type Proposal = {
  id: string
  title: string
  description: string
  category: 'process' | 'crm' | 'commercial' | 'organisation' | 'tech'
  impact: 'high' | 'medium' | 'low'
  effort: 'high' | 'medium' | 'low'
  status: 'idée' | 'étude' | 'validé' | 'en_cours' | 'déployé'
  source: string
  benefice: string
  department: string
}

// ── Proposals data ──────────────────────────────────────────────────────
const PROPOSALS: Proposal[] = [
  // ═══ PROCESS ═══
  {
    id: 'P01', title: 'Automatiser les relances paiement', category: 'process', impact: 'high', effort: 'medium', status: 'idée',
    description: 'Envoi automatique d\'un email de relance J-5 avant échéance facture + alerte CRM si impayé > 7j',
    source: 'Pain point : relances oubliées → retard paiement', benefice: 'Réduire les retards de paiement de 40%', department: 'Finance',
  },
  {
    id: 'P02', title: 'Ticket system pour le Supply', category: 'process', impact: 'high', effort: 'high', status: 'idée',
    description: 'Chaque ligne de la fiche achat génère un ticket supply que Salim/Imane reçoivent et traitent. Notifications temps réel, statut visible par l\'AE.',
    source: 'Suivi supply trop manuel, pas de visibilité en temps réel', benefice: 'Visibilité 100% sur le supply + suppression WhatsApp pour le suivi', department: 'Supply',
  },
  {
    id: 'P03', title: 'Workflow de validation deals > seuil', category: 'process', impact: 'medium', effort: 'medium', status: 'idée',
    description: 'Deals > 500K MAD nécessitent validation direction avant envoi devis. Workflow approval dans le CRM avec notification.',
    source: 'Best practice entreprises IT', benefice: 'Meilleur contrôle des marges sur gros deals', department: 'Vente',
  },
  {
    id: 'P04', title: 'Check-list qualité post-livraison', category: 'process', impact: 'medium', effort: 'low', status: 'idée',
    description: 'Après livraison, déclencher une check-list : PV signé ? Client satisfait ? Support briefé ? Facture envoyée ? Pas de tâche à suivre ?',
    source: 'Deals clôturés avec des actions manquantes', benefice: 'Zéro oubli post-livraison', department: 'Projets',
  },

  // ═══ CRM ═══
  {
    id: 'P05', title: 'Module Recouvrement complet', category: 'crm', impact: 'high', effort: 'high', status: 'idée',
    description: 'Page dédiée au recouvrement : factures échues, timeline des relances, statut paiement, contact comptable client, historique des échanges.',
    source: 'Suivi paiement dispersé entre Excel et CRM', benefice: 'Vue centralisée du cash à recevoir', department: 'Finance',
  },
  {
    id: 'P06', title: 'Dashboard prédictif de closing', category: 'crm', impact: 'medium', effort: 'high', status: 'idée',
    description: 'Prédire la probabilité de closing en analysant : ancienneté du deal, nombre d\'interactions, taille, BU, historique client.',
    source: 'Benchmark CRM modernes (Salesforce Einstein, HubSpot)', benefice: 'Focus sur les deals les plus susceptibles de closer', department: 'Vente',
  },
  {
    id: 'P07', title: 'Vue client 360°', category: 'crm', impact: 'high', effort: 'medium', status: 'idée',
    description: 'Sur la fiche compte, afficher : historique deals, supply en cours, factures, tickets support, renouvellements, contacts, notes, fichiers. Une seule page pour tout voir.',
    source: 'Info client dispersée sur plusieurs pages', benefice: 'Préparation RDV client en 30 secondes au lieu de 10 minutes', department: 'Vente',
  },
  {
    id: 'P08', title: 'Notifications push temps réel', category: 'crm', impact: 'medium', effort: 'medium', status: 'idée',
    description: 'Notifications navigateur + mobile quand : supply livré, facture payée, deal modifié, nouveau message, alerte qualité.',
    source: 'Actuellement il faut rafraîchir pour voir les changements', benefice: 'Réactivité instantanée', department: 'Tous',
  },

  // ═══ COMMERCIAL ═══
  {
    id: 'P09', title: 'Scoring de leads automatique', category: 'commercial', impact: 'high', effort: 'medium', status: 'idée',
    description: 'Score de 0-100 pour chaque prospect basé sur : taille entreprise, secteur, historique achat, niveau d\'engagement, budget déclaré.',
    source: 'Priorisation prospects actuelle = intuition', benefice: 'Prioriser les prospects les plus chauds, +20% conversion', department: 'Vente',
  },
  {
    id: 'P10', title: 'Séquences de prospection automatisées', category: 'commercial', impact: 'high', effort: 'high', status: 'idée',
    description: 'Créer des séquences email/appel : J0 intro, J3 relance, J7 valeur ajoutée, J14 close or nurture. Le CRM rappelle chaque action.',
    source: 'Outils comme Salesloft, Outreach', benefice: 'Processus de prospection systématique, rien n\'est oublié', department: 'Vente',
  },
  {
    id: 'P11', title: 'Analyse win/loss', category: 'commercial', impact: 'medium', effort: 'low', status: 'idée',
    description: 'Après chaque deal Won ou Lost, remplir un mini formulaire : pourquoi gagné/perdu ? Concurrence ? Prix ? Relation ? Timing ? Générer des stats.',
    source: 'Best practice commerciale, pas de capitalisation actuellement', benefice: 'Comprendre ce qui fait gagner ou perdre pour s\'améliorer', department: 'Vente',
  },

  // ═══ ORGANISATION ═══
  {
    id: 'P12', title: 'SLA interdépartementaux', category: 'organisation', impact: 'high', effort: 'medium', status: 'idée',
    description: 'Définir et tracker des SLA : Supply place en < 24h, ETA confirmé en < 48h, Facture émise < 7j après livraison, Paiement relancé J-5.',
    source: 'Pas de benchmark temps de traitement actuel', benefice: 'Identifier les goulots d\'étranglement objectivement', department: 'Tous',
  },
  {
    id: 'P13', title: 'Réunion hebdo structurée via CRM', category: 'organisation', impact: 'medium', effort: 'low', status: 'idée',
    description: 'Générer automatiquement l\'ordre du jour de la réunion hebdo : deals à closer cette semaine, supply en retard, factures impayées, projets en cours.',
    source: 'Réunions actuellement non structurées', benefice: 'Réunions 2x plus courtes et 3x plus efficaces', department: 'Tous',
  },
  {
    id: 'P14', title: 'Matrice RACI dans le CRM', category: 'organisation', impact: 'medium', effort: 'low', status: 'idée',
    description: 'Pour chaque deal, visualiser qui est R (Responsable), A (Accountable), C (Consulté), I (Informé) à chaque étape. Éviter les "je pensais que c\'était toi".',
    source: 'Confusion fréquente sur qui fait quoi', benefice: 'Clarifier les responsabilités, zéro ambiguïté', department: 'Tous',
  },

  // ═══ TECH ═══
  {
    id: 'P15', title: 'API AMAN ↔ CRM', category: 'tech', impact: 'high', effort: 'high', status: 'idée',
    description: 'Connecter AMAN au CRM : quand une facture est émise dans AMAN, elle apparaît automatiquement dans le CRM avec n° facture, montant, échéance.',
    source: 'Saisie manuelle des infos facture = double travail', benefice: 'Suppression de la double saisie facturation', department: 'Finance',
  },
  {
    id: 'P16', title: 'App mobile CRM', category: 'tech', impact: 'medium', effort: 'high', status: 'idée',
    description: 'Version mobile du CRM pour consultation rapide en RDV client : pipeline, fiche client, historique. PWA ou app React Native.',
    source: 'Pas d\'accès mobile actuellement', benefice: 'Accès aux infos client en déplacement', department: 'Vente',
  },
]

// ── Config ──
const CATEGORY_CFG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  process:      { label: 'Process', color: 'text-violet-600', bg: 'bg-violet-50 ring-violet-200', icon: Cog },
  crm:          { label: 'CRM', color: 'text-blue-600', bg: 'bg-blue-50 ring-blue-200', icon: BarChart3 },
  commercial:   { label: 'Commercial', color: 'text-emerald-600', bg: 'bg-emerald-50 ring-emerald-200', icon: TrendingUp },
  organisation: { label: 'Organisation', color: 'text-amber-600', bg: 'bg-amber-50 ring-amber-200', icon: Users },
  tech:         { label: 'Tech', color: 'text-pink-600', bg: 'bg-pink-50 ring-pink-200', icon: Zap },
}

const IMPACT_STYLE = {
  high:   { label: 'Impact fort', badge: 'bg-emerald-100 text-emerald-700' },
  medium: { label: 'Impact moyen', badge: 'bg-amber-100 text-amber-700' },
  low:    { label: 'Impact faible', badge: 'bg-slate-100 text-slate-600' },
}

const EFFORT_STYLE = {
  high:   { label: 'Effort important', badge: 'bg-red-100 text-red-700' },
  medium: { label: 'Effort moyen', badge: 'bg-amber-100 text-amber-700' },
  low:    { label: 'Effort faible', badge: 'bg-emerald-100 text-emerald-700' },
}

const STATUS_STYLE: Record<string, { label: string; bg: string }> = {
  idée:     { label: '💡 Idée', bg: 'bg-slate-100 text-slate-700' },
  étude:    { label: '🔍 Étude', bg: 'bg-blue-100 text-blue-700' },
  validé:   { label: '✅ Validé', bg: 'bg-emerald-100 text-emerald-700' },
  en_cours: { label: '🚀 En cours', bg: 'bg-violet-100 text-violet-700' },
  déployé:  { label: '🏁 Déployé', bg: 'bg-emerald-100 text-emerald-800' },
}

export default function InnovationPage() {
  const [filterCat, setFilterCat] = useState('Tous')
  const [filterImpact, setFilterImpact] = useState('Tous')
  const [viewMode, setViewMode] = useState<'list' | 'matrix'>('list')

  useEffect(() => { document.title = 'Innovation · CRM-PIPE' }, [])

  const filtered = useMemo(() => {
    return PROPOSALS.filter(p => {
      if (filterCat !== 'Tous' && p.category !== filterCat) return false
      if (filterImpact !== 'Tous' && p.impact !== filterImpact) return false
      return true
    })
  }, [filterCat, filterImpact])

  // ── KPIs ──
  const kpis = {
    total: PROPOSALS.length,
    highImpact: PROPOSALS.filter(p => p.impact === 'high').length,
    quickWins: PROPOSALS.filter(p => p.impact === 'high' && p.effort === 'low').length,
    byCategory: Object.keys(CATEGORY_CFG).reduce((acc, cat) => {
      acc[cat] = PROPOSALS.filter(p => p.category === cat).length
      return acc
    }, {} as Record<string, number>),
  }

  // ── Impact/Effort matrix data ──
  const matrixCells = useMemo(() => {
    const impacts: ('high' | 'medium' | 'low')[] = ['high', 'medium', 'low']
    const efforts: ('low' | 'medium' | 'high')[] = ['low', 'medium', 'high']
    return impacts.map(impact =>
      efforts.map(effort => PROPOSALS.filter(p => p.impact === impact && p.effort === effort))
    )
  }, [])

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1500px] px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-md">
              <Lightbulb className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Innovation</h1>
              <p className="text-xs text-slate-500">{kpis.total} propositions · {kpis.highImpact} à fort impact · {kpis.quickWins} quick wins</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setViewMode('list')} className={`h-9 px-3 rounded-xl text-sm font-semibold transition-colors ${viewMode === 'list' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
              Liste
            </button>
            <button onClick={() => setViewMode('matrix')} className={`h-9 px-3 rounded-xl text-sm font-semibold transition-colors ${viewMode === 'matrix' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
              Matrice
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {Object.entries(CATEGORY_CFG).map(([key, cfg]) => {
            const CIcon = cfg.icon
            return (
              <button key={key} onClick={() => setFilterCat(filterCat === key ? 'Tous' : key)}
                className={`rounded-2xl ring-1 shadow-sm p-4 text-left transition-all ${filterCat === key ? `${cfg.bg} scale-[1.02]` : 'bg-white ring-slate-200 hover:ring-slate-300'}`}>
                <div className="flex items-center gap-2">
                  <CIcon className={`h-4 w-4 ${cfg.color}`} />
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{cfg.label}</div>
                </div>
                <div className={`text-2xl font-black mt-1 ${cfg.color}`}>{kpis.byCategory[key]}</div>
                <div className="text-[10px] text-slate-400">propositions</div>
              </button>
            )
          })}
        </div>

        {viewMode === 'list' ? (
          <>
            {/* Filter bar */}
            <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-4 flex flex-wrap items-center gap-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Filtrer</span>
              <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="h-9 rounded-xl border border-slate-200 px-3 text-sm">
                <option value="Tous">Toutes catégories</option>
                {Object.entries(CATEGORY_CFG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <select value={filterImpact} onChange={e => setFilterImpact(e.target.value)} className="h-9 rounded-xl border border-slate-200 px-3 text-sm">
                <option value="Tous">Tout impact</option>
                <option value="high">🟢 Fort</option>
                <option value="medium">🟠 Moyen</option>
                <option value="low">⚪ Faible</option>
              </select>
              <span className="ml-auto text-xs text-slate-400">{filtered.length} proposition{filtered.length > 1 ? 's' : ''}</span>
            </div>

            {/* Proposals List */}
            <div className="space-y-3">
              {filtered.map(p => {
                const cat = CATEGORY_CFG[p.category]
                const CatIcon = cat.icon
                return (
                  <div key={p.id} className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5 hover:ring-slate-300 transition-all">
                    <div className="flex items-start gap-4">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${cat.bg} ring-1 flex-shrink-0`}>
                        <CatIcon className={`h-5 w-5 ${cat.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-slate-900">{p.id}</span>
                          <span className="text-sm font-bold text-slate-900">·</span>
                          <span className="text-sm font-bold text-slate-900">{p.title}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[p.status].bg}`}>{STATUS_STYLE[p.status].label}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">{p.description}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-2.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${IMPACT_STYLE[p.impact].badge}`}>{IMPACT_STYLE[p.impact].label}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${EFFORT_STYLE[p.effort].badge}`}>{EFFORT_STYLE[p.effort].label}</span>
                          <span className="text-[10px] text-slate-400">·</span>
                          <span className="text-[10px] font-semibold text-slate-400">{p.department}</span>
                        </div>
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="rounded-lg bg-slate-50 px-3 py-2">
                            <div className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">Problème</div>
                            <div className="text-[11px] text-slate-600 mt-0.5">{p.source}</div>
                          </div>
                          <div className="rounded-lg bg-emerald-50 px-3 py-2">
                            <div className="text-[9px] font-bold uppercase text-emerald-500 tracking-wider">Bénéfice attendu</div>
                            <div className="text-[11px] text-emerald-700 mt-0.5">{p.benefice}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          /* ═══ MATRIX VIEW ═══ */
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-6">
            <div className="text-sm font-bold text-slate-900 mb-4">Matrice Impact / Effort</div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="p-2 text-xs font-bold text-slate-400 w-24"></th>
                    <th className="p-2 text-xs font-bold text-emerald-600 text-center">Effort faible</th>
                    <th className="p-2 text-xs font-bold text-amber-600 text-center">Effort moyen</th>
                    <th className="p-2 text-xs font-bold text-red-600 text-center">Effort important</th>
                  </tr>
                </thead>
                <tbody>
                  {(['high', 'medium', 'low'] as const).map((impact, iIdx) => (
                    <tr key={impact}>
                      <td className={`p-2 text-xs font-bold text-right pr-4 ${impact === 'high' ? 'text-emerald-600' : impact === 'medium' ? 'text-amber-600' : 'text-slate-400'}`}>
                        Impact {impact === 'high' ? 'fort' : impact === 'medium' ? 'moyen' : 'faible'}
                      </td>
                      {matrixCells[iIdx].map((items, eIdx) => {
                        const cellBg = iIdx === 0 && eIdx === 0 ? 'bg-emerald-50 border-emerald-200' :
                                       iIdx === 2 && eIdx === 2 ? 'bg-red-50 border-red-200' :
                                       'bg-slate-50 border-slate-200'
                        const isQuickWin = iIdx === 0 && eIdx === 0
                        return (
                          <td key={eIdx} className={`p-2 border ${cellBg} rounded-lg align-top min-w-[180px]`}>
                            {isQuickWin && items.length > 0 && (
                              <div className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider mb-1">⚡ Quick Wins</div>
                            )}
                            <div className="space-y-1">
                              {items.map(p => (
                                <div key={p.id} className="text-[11px] text-slate-700 bg-white rounded px-2 py-1 border border-slate-100">
                                  <span className="font-bold text-slate-500">{p.id}</span> {p.title}
                                </div>
                              ))}
                              {items.length === 0 && <div className="text-[10px] text-slate-300 italic">—</div>}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center gap-4 text-[10px] text-slate-400">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200"></span> Quick wins (haut impact, peu d'effort)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 border border-red-200"></span> Projets lourds (faible impact, gros effort)</span>
            </div>
          </div>
        )}

        {/* CRM Coverage */}
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-6">
          <div className="text-sm font-bold text-slate-900 mb-1">Couverture CRM vs Réalité</div>
          <div className="text-xs text-slate-400 mb-4">Estimation de ce que le CRM couvre par rapport à tes tâches quotidiennes</div>
          <div className="space-y-3">
            {[
              { label: 'Prospection & Qualification', pct: 70, color: 'bg-blue-500' },
              { label: 'Pipeline & Deals', pct: 85, color: 'bg-emerald-500' },
              { label: 'Supply Chain (suivi)', pct: 60, color: 'bg-violet-500' },
              { label: 'Facturation', pct: 50, color: 'bg-amber-500' },
              { label: 'Recouvrement', pct: 20, color: 'bg-red-500' },
              { label: 'Suivi Projets', pct: 40, color: 'bg-pink-500' },
              { label: 'Reporting & KPI', pct: 75, color: 'bg-teal-500' },
              { label: 'Communication interne', pct: 30, color: 'bg-orange-500' },
            ].map(item => (
              <div key={item.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-700">{item.label}</span>
                  <span className={`text-xs font-bold ${item.pct >= 70 ? 'text-emerald-600' : item.pct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{item.pct}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full ${item.color} rounded-full transition-all`} style={{ width: `${item.pct}%` }}></div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg bg-slate-50 p-3">
            <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Couverture globale estimée</div>
            <div className="text-xl font-black text-slate-900 mt-1">~50%</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Le CRM couvre environ la moitié de tes tâches quotidiennes. Les propositions ci-dessus visent à combler les gaps.</div>
          </div>
        </div>

      </div>
    </div>
  )
}
