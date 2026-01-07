'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

export default function Home() {
  const router = useRouter()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (loading) return

    // Si connecté -> dashboard principal
    if (user) router.replace('/dashboard-v2')
    // Sinon -> login
    else router.replace('/login')
  }, [user, loading, router])

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-sm text-gray-500">Chargement…</div>
    </main>
  )
}
