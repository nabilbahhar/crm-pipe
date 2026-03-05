'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import NavBar from './NavBar'

const PUBLIC_ROUTES = ['/login', '/reset-password']

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const [checking, setChecking]           = useState(true)
  const [authenticated, setAuthenticated] = useState(false)

  const isPublic = PUBLIC_ROUTES.some(r => pathname === r || pathname.startsWith(r + '#') || pathname.startsWith(r + '?'))

  useEffect(() => {
    // Vérification initiale de la session
    supabase.auth.getSession().then(({ data }) => {
      const isAuth = !!data.session
      setAuthenticated(isAuth)
      setChecking(false)

      if (!isAuth && !isPublic) {
        router.replace('/login')
      }
      if (isAuth && pathname === '/login') {
        router.replace('/dashboard')
      }
    })

    // Écouter les changements d'auth en temps réel
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const isAuth = !!session
      setAuthenticated(isAuth)
      if (!isAuth && !isPublic) {
        router.replace('/login')
      }
    })

    return () => sub.subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Écran de chargement pendant la vérification auth
  if (checking) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#f8fafc',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, background: '#0f172a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: '#fff', fontWeight: 900, fontSize: 13, letterSpacing: '1px' }}>CP</span>
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>Chargement…</div>
        </div>
      </div>
    )
  }

  // Page publique (login, reset-password) → pas de navbar
  if (isPublic) {
    return <>{children}</>
  }

  // Non authentifié sur route protégée → rien (redirect déjà déclenché)
  if (!authenticated) return null

  // Authentifié → navbar + contenu
  return (
    <>
      <NavBar />
      {children}
    </>
  )
}
