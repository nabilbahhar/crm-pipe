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
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#64748b' }}>
        Chargement…
      </div>
    }>
      <ResetPasswordInner />
    </Suspense>
  )
}

function ResetPasswordInner() {
  const router = useRouter()
  const sp = useSearchParams()
  const code = sp.get('code')

  const [email, setEmail]           = useState('')
  const [newPwd, setNewPwd]         = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [step, setStep]             = useState<'request' | 'exchanging' | 'update'>(code ? 'exchanging' : 'request')
  const [loading, setLoading]       = useState(false)
  const [err, setErr]               = useState<string | null>(null)
  const [info, setInfo]             = useState<string | null>(null)

  const emailNormalized = useMemo(() => email.trim().toLowerCase(), [email])

  // Cas 1 : lien avec ?code= (PKCE flow)
  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!code) return
      setErr(null); setInfo(null); setStep('exchanging')
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (cancelled) return
      if (error) {
        setErr('Lien invalide ou expiré. Recommence depuis la page Login.')
        setStep('request')
        return
      }
      setStep('update')
    }
    run()
    return () => { cancelled = true }
  }, [code])

  // Cas 2 : lien avec #access_token (implicit flow)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setStep('update')
        setErr(null)
        setInfo(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function requestReset(e: React.FormEvent) {
    e.preventDefault()
    setErr(null); setInfo(null)
    if (!emailNormalized) return setErr('Saisis ton email.')
    if (!ALLOWED_EMAILS.has(emailNormalized)) return setErr("Cet email n'est pas autorisé.")
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(emailNormalized, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (error) return setErr(error.message)
    setInfo(`Email envoyé à ${emailNormalized}. Vérifie ta boîte mail et clique sur le lien.`)
  }

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault()
    setErr(null); setInfo(null)
    if (!newPwd || newPwd.length < 8) return setErr('Mot de passe trop court (8 caractères minimum).')
    if (newPwd !== confirmPwd) return setErr('Les deux mots de passe ne correspondent pas.')
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPwd })
    setLoading(false)
    if (error) return setErr(error.message)
    setInfo('Mot de passe mis à jour ! Redirection…')
    setTimeout(() => router.replace('/dashboard'), 1500)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#f8fafc' }}>
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-3xl font-black tracking-tight text-slate-900">CRM-PIPE</div>
          <div className="mt-1 text-sm text-slate-500">
            {step === 'update' ? 'Choisir un nouveau mot de passe' : 'Réinitialiser le mot de passe'}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-7 shadow-sm border border-slate-100">
          {err  && <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{err}</div>}
          {info && <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">{info}</div>}

          {step === 'exchanging' && (
            <div className="text-center py-4 text-sm text-slate-500">Vérification du lien…</div>
          )}

          {step === 'request' && (
            <form onSubmit={requestReset} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                <input
                  className="w-full h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-slate-400 focus:bg-white transition-colors"
                  placeholder="votre@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                />
              </div>
              <button disabled={loading} type="submit"
                className="w-full h-11 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-60 transition-colors">
                {loading ? 'Envoi…' : 'Envoyer le lien de réinitialisation'}
              </button>
              <button type="button" onClick={() => router.replace('/login')}
                className="w-full h-10 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                Retour au login
              </button>
            </form>
          )}

          {step === 'update' && (
            <form onSubmit={updatePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nouveau mot de passe</label>
                <input
                  className="w-full h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-slate-400 focus:bg-white transition-colors"
                  type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)}
                  autoComplete="new-password" placeholder="8 caractères minimum"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirmer le mot de passe</label>
                <input
                  className="w-full h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-slate-400 focus:bg-white transition-colors"
                  type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
                  autoComplete="new-password" placeholder="••••••••"
                />
              </div>
              <button disabled={loading} type="submit"
                className="w-full h-11 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-60 transition-colors">
                {loading ? 'Mise à jour…' : 'Mettre à jour le mot de passe'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
