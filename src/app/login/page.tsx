'use client'

import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

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
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const emailNormalized = useMemo(() => email.trim().toLowerCase(), [email])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setInfo(null)

    if (!emailNormalized) return setErr('Merci de saisir ton email.')
    if (!password) return setErr('Merci de saisir ton mot de passe.')

    if (!ALLOWED_EMAILS.has(emailNormalized)) {
      return setErr("Accès refusé : cet email n'est pas autorisé sur ce CRM.")
    }

    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailNormalized,
      password,
    })
    setLoading(false)

    if (error) return setErr(error.message)

    const signedEmail = (data?.user?.email || '').toLowerCase()
    if (!ALLOWED_EMAILS.has(signedEmail)) {
      await supabase.auth.signOut()
      return setErr("Accès refusé : cet email n'est pas autorisé sur ce CRM.")
    }

    router.replace('/dashboard-v2')
  }

  async function onForgotPassword() {
    setErr(null)
    setInfo(null)

    if (!emailNormalized) return setErr('Saisis ton email d’abord.')
    if (!ALLOWED_EMAILS.has(emailNormalized)) {
      return setErr("Accès refusé : cet email n'est pas autorisé sur ce CRM.")
    }

    // On active ça à l’étape suivante (page /reset-password).
    // Pour l’instant, on met quand même un message clair.
    setInfo("OK. Étape suivante : on ajoute la page /reset-password pour que le lien fonctionne.")
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="mb-6">
            <div className="text-2xl font-bold text-slate-900">CRM-PIPE</div>
            <div className="text-sm text-slate-500">Connexion</div>
          </div>

          {err ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {err}
            </div>
          ) : null}

          {info ? (
            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              {info}
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="grid gap-3">
            <label className="grid gap-1">
              <span className="text-sm text-slate-700">Email</span>
              <input
                className="h-11 rounded-xl border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                placeholder="nabil.imdh@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-sm text-slate-700">Mot de passe</span>
              <div className="flex items-center gap-2">
                <input
                  className="h-11 flex-1 rounded-xl border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                  placeholder="••••••••"
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="h-11 rounded-xl border bg-white px-3 text-sm text-slate-700 hover:bg-slate-100"
                  onClick={() => setShowPwd((v) => !v)}
                >
                  {showPwd ? 'Masquer' : 'Voir'}
                </button>
              </div>
            </label>

            <button
              disabled={loading}
              className="mt-2 inline-flex h-11 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              type="submit"
            >
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>

            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl border bg-white px-4 text-sm text-slate-700 hover:bg-slate-100"
              onClick={onForgotPassword}
            >
              Mot de passe oublié
            </button>

            <div className="pt-2 text-xs text-slate-500">
              Accès autorisé uniquement : nabil.imdh@gmail.com / s.chitachny@compucom.ma
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
