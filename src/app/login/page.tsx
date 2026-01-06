'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    setLoading(false)
    if (error) return setErr(error.message)

    router.push('/dashboard')
  }

  return (
    <div style={{ maxWidth: 420, margin: '60px auto', fontFamily: 'system-ui' }}>
      <h1>Login</h1>

      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 10 }}>
        <input
          placeholder="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <input
          placeholder="password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <button disabled={loading}>
          {loading ? '...' : 'Se connecter'}
        </button>

        {err && <div style={{ color: 'crimson' }}>{err}</div>}
      </form>
    </div>
  )
}
