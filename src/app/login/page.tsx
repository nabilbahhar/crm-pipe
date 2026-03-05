'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { Eye, EyeOff, TrendingUp, Users, Target, BarChart3 } from 'lucide-react'

const ALLOWED_EMAILS = [
  'nabil.imdh@gmail.com',
  's.chitachny@compucom.ma',
]

const FEATURES = [
  { icon: TrendingUp, label: 'Pipeline en temps réel',   desc: 'Suivi des deals à chaque étape' },
  { icon: Target,     label: 'Objectifs & KPIs',          desc: 'Performance individuelle et équipe' },
  { icon: Users,      label: 'Gestion des comptes',       desc: 'Tous vos clients centralisés' },
  { icon: BarChart3,  label: 'Dashboard analytique',      desc: 'Insights et prévisions' },
]

export default function LoginPage() {
  const router = useRouter()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const allowed = new Set(ALLOWED_EMAILS.map(e => e.toLowerCase()))
    if (!allowed.has(email.trim().toLowerCase())) {
      setError('Accès refusé. Contacte ton administrateur.')
      setLoading(false)
      return
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (signInError) {
      setError('Email ou mot de passe incorrect.')
      setLoading(false)
      return
    }

    router.replace('/dashboard')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>

      {/* ── PANNEAU GAUCHE (branding) ── */}
      <div style={{
        display: 'none',
        width: '52%',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0f172a 100%)',
        padding: '48px 56px',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden',
      }}
        className="login-left-panel"
      >
        {/* Cercles décoratifs */}
        <div style={{
          position: 'absolute', top: -80, right: -80,
          width: 320, height: 320, borderRadius: '50%',
          background: 'rgba(99,102,241,0.08)', pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: -60, left: -60,
          width: 240, height: 240, borderRadius: '50%',
          background: 'rgba(99,102,241,0.06)', pointerEvents: 'none',
        }} />

        {/* Logo */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ color: '#fff', fontWeight: 900, fontSize: 14, letterSpacing: '1px' }}>CP</span>
            </div>
            <span style={{ color: '#fff', fontWeight: 900, fontSize: 20, letterSpacing: '2px' }}>CRM-PIPE</span>
          </div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Compucom Maroc — Outil interne</div>
        </div>

        {/* Texte principal */}
        <div>
          <div style={{ color: '#fff', fontSize: 36, fontWeight: 800, lineHeight: 1.2, marginBottom: 16 }}>
            Piloter votre<br />
            <span style={{ color: '#818cf8' }}>pipeline commercial</span><br />
            en toute clarté.
          </div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15, lineHeight: 1.6, maxWidth: 380 }}>
            Tous vos deals, comptes et performances en un seul endroit. Suivi en temps réel pour l'équipe Sales.
          </div>
        </div>

        {/* Features */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {FEATURES.map(({ icon: Icon, label, desc }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                background: 'rgba(129,140,248,0.12)',
                border: '1px solid rgba(129,140,248,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={18} color="#818cf8" />
              </div>
              <div>
                <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{label}</div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>
          © 2026 Compucom Maroc · Usage interne uniquement
        </div>
      </div>

      {/* ── PANNEAU DROIT (formulaire) ── */}
      <div style={{
        flex: 1,
        background: '#f8fafc',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
      }}>
        <div style={{ width: '100%', maxWidth: 420 }}>

          {/* Mobile logo */}
          <div style={{ textAlign: 'center', marginBottom: 36 }} className="login-mobile-logo">
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 52, height: 52, borderRadius: 14, background: '#0f172a', marginBottom: 12,
            }}>
              <span style={{ color: '#fff', fontWeight: 900, fontSize: 16, letterSpacing: '1px' }}>CP</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', letterSpacing: '1.5px' }}>CRM-PIPE</div>
          </div>

          {/* Card */}
          <div style={{
            background: '#fff',
            borderRadius: 20,
            boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
            border: '1px solid #e2e8f0',
            padding: '40px 36px',
          }}>
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800, color: '#0f172a' }}>
                Bonne journée 👋
              </h1>
              <p style={{ margin: 0, fontSize: 14, color: '#64748b' }}>
                Connecte-toi pour accéder à ton espace.
              </p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* Email */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 7 }}>
                  Adresse email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="toi@compucom.ma"
                  required
                  autoComplete="email"
                  autoFocus
                  style={{
                    width: '100%', height: 46, borderRadius: 12,
                    border: '1.5px solid #e2e8f0',
                    padding: '0 14px', fontSize: 14, outline: 'none',
                    boxSizing: 'border-box', background: '#f8fafc',
                    transition: 'all 0.15s',
                  }}
                  onFocus={e => { e.target.style.borderColor = '#0f172a'; e.target.style.background = '#fff' }}
                  onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc' }}
                />
              </div>

              {/* Mot de passe */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                    Mot de passe
                  </label>
                  <a href="/reset-password" style={{ fontSize: 12, color: '#6366f1', textDecoration: 'none', fontWeight: 500 }}>
                    Oublié ?
                  </a>
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    style={{
                      width: '100%', height: 46, borderRadius: 12,
                      border: '1.5px solid #e2e8f0',
                      padding: '0 46px 0 14px', fontSize: 14, outline: 'none',
                      boxSizing: 'border-box', background: '#f8fafc',
                      transition: 'all 0.15s',
                    }}
                    onFocus={e => { e.target.style.borderColor = '#0f172a'; e.target.style.background = '#fff' }}
                    onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(v => !v)}
                    style={{
                      position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                      border: 'none', background: 'none', cursor: 'pointer',
                      color: '#94a3b8', padding: 4, display: 'flex',
                    }}
                  >
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Erreur */}
              {error && (
                <div style={{
                  background: '#fef2f2', border: '1px solid #fecaca',
                  borderRadius: 10, padding: '11px 14px',
                  fontSize: 13, color: '#dc2626',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span>⚠️</span> {error}
                </div>
              )}

              {/* Bouton */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  height: 48, borderRadius: 12, border: 'none',
                  background: loading ? '#94a3b8' : '#0f172a',
                  color: '#fff', fontSize: 14, fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s', marginTop: 2,
                  letterSpacing: '0.3px',
                }}
              >
                {loading ? 'Connexion en cours…' : 'Se connecter →'}
              </button>

            </form>
          </div>

          {/* Footer */}
          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <span style={{ fontSize: 11, color: '#cbd5e1' }}>
              © 2026 Compucom Maroc · Outil interne
            </span>
          </div>

        </div>
      </div>

      {/* Responsive styles */}
      <style>{`
        @media (min-width: 768px) {
          .login-left-panel { display: flex !important; }
          .login-mobile-logo { display: none !important; }
        }
      `}</style>

    </div>
  )
}
