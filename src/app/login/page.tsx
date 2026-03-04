'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { Eye, EyeOff } from 'lucide-react'

const ALLOWED_EMAILS = [
  'nabil.imdh@gmail.com',
  's.chitachny@compucom.ma',
]

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd]   = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const allowed = new Set(ALLOWED_EMAILS.map(e => e.toLowerCase()))
    if (!allowed.has(email.trim().toLowerCase())) {
      setError('Accès refusé.')
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
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#f8fafc' }}>
      <div style={{
        width: '100%', maxWidth: 400,
        background: '#fff', borderRadius: 20,
        boxShadow: '0 8px 40px rgba(0,0,0,0.08)',
        padding: '40px 36px',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 48, height: 48, borderRadius: 14, background: '#0f172a',
            marginBottom: 16,
          }}>
            <span style={{ color: '#fff', fontWeight: 900, fontSize: 16, letterSpacing: '1px' }}>CP</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: '1.5px' }}>CRM-PIPE</div>
          <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>Connectez-vous à votre espace</div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Email */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="votre@email.com"
              required
              style={{
                width: '100%', height: 44, borderRadius: 12,
                border: '1px solid #e2e8f0', padding: '0 14px',
                fontSize: 14, outline: 'none', boxSizing: 'border-box',
                transition: 'border 0.15s',
              }}
            />
          </div>

          {/* Password */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
              Mot de passe
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  width: '100%', height: 44, borderRadius: 12,
                  border: '1px solid #e2e8f0', padding: '0 44px 0 14px',
                  fontSize: 14, outline: 'none', boxSizing: 'border-box',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPwd(v => !v)}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4,
                }}
              >
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 10, padding: '10px 14px',
              fontSize: 12, color: '#dc2626',
            }}>
              ⚠️ {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              height: 44, borderRadius: 12, border: 'none',
              background: loading ? '#94a3b8' : '#0f172a',
              color: '#fff', fontSize: 14, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: 4,
            }}
          >
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>

          <div style={{ textAlign: 'center' }}>
            <a href="/reset-password" style={{ fontSize: 12, color: '#94a3b8', textDecoration: 'none' }}>
              Mot de passe oublié ?
            </a>
          </div>
        </form>
      </div>
    </div>
  )
}
