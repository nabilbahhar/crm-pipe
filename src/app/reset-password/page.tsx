'use client'
export const dynamic = 'force-dynamic'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

const ALLOWED_EMAILS = new Set([
  'nabil.imdh@gmail.com',
  's.chitachny@compucom.ma',
])

export default function ResetPasswordPage() {
  const router = useRouter()
  const sp = useSearchParams()
  const code = sp.get('code') // Supabase PKCE

  const [email, setEmail] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')

  const [step, setStep] = useState<'request' | 'exchanging' | 'update'>(
    code ? 'exchanging' : 'request'
  )
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const emailNormalized = useMemo(() => email.trim().toLowerCase(), [email])

  // Si on arrive depuis l’email Supabase, on échange le code -> session
  useEffect(() => {
    let cancelled = false

    async function run() {
      if (!code) return

      setErr(null)
      setInfo(null)
      setStep('exchanging')

      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (cancelled) return

      if (error) {
        setErr(
          "Lien invalide ou expiré. Recommence la demande de réinitialisation depuis la page Login."
        )
        setStep('request')
        return
      }

      setStep('update')
    }

    run()
    return () => {
      cancelled = true
    }
  }, [code])

  async function requestReset(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setInfo(null)

    if (!emailNormalized) return setErr('Merci de saisir ton email.')
    if (!ALLOWED_EMAILS.has(emailNormalized)) {
      return setErr("Accès refusé : cet email n'est pas autorisé sur ce CRM.")
    }

    setLoading(true)
    const redirectTo = `${window.location.origin}/reset-password`
    const { error } = await supabase.auth.resetPasswordForEmail(emailNormalized, {
      redirectTo,
    })
    setLoading(false)

    if (error) return setErr(error.message)

    setInfo(
      `Email envoyé à ${emailNormalized}. Ouvre le lien reçu pour définir un nouveau mot de passe.`
    )
  }

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setInfo(null)

    if (!newPwd || newPwd.length < 8) {
      return setErr('Mot de passe trop court (minimum 8 caractères).')
    }
    if (newPwd !== confirmPwd) {
      return setErr('Les deux mots de passe ne sont pas identiques.')
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPwd })
    setLoading(false)

    if (error) return setErr(error.message)

    setInfo('Mot de passe mis à jour. Redirection…')
    router.replace('/dashboard-v2')
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="mb-6">
            <div className="text-2xl font-bold text-slate-900">CRM-PIPE</div>
            <div className="text-sm text-slate-500">
              {step === 'update' ? 'Nouveau mot de passe' : 'Réinitialiser le mot de passe'}
            </div>
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

          {step === 'exchanging' ? (
            <div className="text-sm text-slate-600">Vérification du lien…</div>
          ) : null}

          {step === 'request' ? (
            <form onSubmit={requestReset} className="grid gap-3">
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

              <button
                disabled={loading}
                className="mt-2 inline-flex h-11 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                type="submit"
              >
                {loading ? 'Envoi…' : 'Envoyer le lien'}
              </button>

              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-xl border bg-white px-4 text-sm text-slate-700 hover:bg-slate-100"
                onClick={() => router.replace('/login')}
              >
                Retour au login
              </button>

              <div className="pt-2 text-xs text-slate-500">
                Accès autorisé uniquement : nabil.imdh@gmail.com / s.chitachny@compucom.ma
              </div>
            </form>
          ) : null}

          {step === 'update' ? (
            <form onSubmit={updatePassword} className="grid gap-3">
              <label className="grid gap-1">
                <span className="text-sm text-slate-700">Nouveau mot de passe</span>
                <input
                  className="h-11 rounded-xl border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                  type="password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  autoComplete="new-password"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-sm text-slate-700">Confirmer le mot de passe</span>
                <input
                  className="h-11 rounded-xl border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                  type="password"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  autoComplete="new-password"
                />
              </label>

              <button
                disabled={loading}
                className="mt-2 inline-flex h-11 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                type="submit"
              >
                {loading ? 'Mise à jour…' : 'Mettre à jour'}
              </button>

              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-xl border bg-white px-4 text-sm text-slate-700 hover:bg-slate-100"
                onClick={() => router.replace('/login')}
              >
                Retour au login
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  )
}
