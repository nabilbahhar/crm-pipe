'use client'

import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const ALLOWED_EMAILS = new Set([
  'nabil.imdh@gmail.com',
  's.chitachny@compucom.ma',
])

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const emailNormalized = useMemo(() => email.trim().toLowerCase(), [email])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!emailNormalized) return setErr('Merci de saisir ton email.')
    if (!password) return setErr('Merci de saisir ton mot de passe.')
    if (!ALLOWED_EMAILS.has(emailNormalized)) return setErr("Accès refusé : cet email n'est pas autorisé.")

    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email: emailNormalized, password })
    setLoading(false)

    if (error) return setErr(error.message)

    const signedEmail = (data?.user?.email || '').toLowerCase()
    if (!ALLOWED_EMAILS.has(signedEmail)) {
      await supabase.auth.signOut()
      return setErr("Accès refusé.")
    }

    router.replace('/dashboard-v3')
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#f8fafc' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="text-3xl font-black tracking-tight text-slate-900">CRM-PIPE</div>
          <div className="mt-1 text-sm text-slate-500">Connectez-vous à votre espace</div>
        </div>

        <div className="rounded-2xl bg-white p-7 shadow-sm border border-slate-100">
          {err && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {err}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <input
                className="w-full h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-slate-400 focus:bg-white transition-colors"
                placeholder="votre@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                type="email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Mot de passe</label>
              <div className="flex gap-2">
                <input
                  className="flex-1 h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-slate-400 focus:bg-white transition-colors"
                  placeholder="••••••••"
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  {showPwd ? 'Masquer' : 'Voir'}
                </button>
              </div>
            </div>

            <button
              disabled={loading}
              type="submit"
              className="w-full h-11 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-60 transition-colors mt-2"
            >
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link href="/reset-password" className="text-sm text-slate-500 hover:text-slate-800 transition-colors">
              Mot de passe oublié ?
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
