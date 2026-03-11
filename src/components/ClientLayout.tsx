'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import NavBar from './NavBar'
import PipouChatbot from './PipouChatbot'

const PUBLIC_ROUTES = ['/login', '/reset-password']

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const [checking, setChecking]           = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  // ─── Initial session check (runs once) ───
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const isAuth = !!data.session
      setAuthenticated(isAuth)
      setChecking(false)

      const currentPath = pathnameRef.current
      const isPublicRoute = PUBLIC_ROUTES.some(r => currentPath === r)
      if (!isAuth && !isPublicRoute) {
        router.replace('/login')
      }
      if (isAuth && currentPath === '/login') {
        router.replace('/dashboard')
      }
    }).catch((err) => {
      console.warn('ClientLayout getSession error:', err)
      setChecking(false)
      const isPublicRoute = PUBLIC_ROUTES.some(r => pathnameRef.current === r)
      if (!isPublicRoute) router.replace('/login')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Auth state listener (separate from pathname) ───
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const isAuth = !!session
      setAuthenticated(isAuth)
      const isPublicRoute = PUBLIC_ROUTES.some(r => pathnameRef.current === r)
      if (!isAuth && !isPublicRoute) {
        router.replace('/login')
      }
    })

    return () => sub.subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isPublic = PUBLIC_ROUTES.some(r => pathname === r)

  // ─── Redirect logic on pathname change ───
  useEffect(() => {
    if (!checking && !authenticated && !isPublic) {
      router.replace('/login')
    }
    if (!checking && authenticated && pathname === '/login') {
      router.replace('/dashboard')
    }
  }, [pathname, checking, authenticated, isPublic, router])

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

  // Authentifié → navbar + contenu + Pipou chatbot global
  return (
    <>
      <NavBar />
      {children}
      <PipouChatbot />
    </>
  )
}
