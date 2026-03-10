'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { authFetch } from '@/lib/authFetch'
import { ownerName } from '@/lib/utils'
import {
  ArrowLeft, Camera, Save, Loader2, User, Mail, Phone, Building2,
  MapPin, Briefcase, CheckCircle2, AlertCircle, Trash2,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────
type Profile = {
  id?: string
  user_email: string
  full_name: string
  job_title: string
  phone: string
  mobile: string
  department: string
  location: string
  bio: string
  avatar_url: string | null
}

const emptyProfile = (email: string): Profile => ({
  user_email: email,
  full_name: ownerName(email),
  job_title: '',
  phone: '',
  mobile: '',
  department: '',
  location: '',
  bio: '',
  avatar_url: null,
})

const inp = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100 transition placeholder:text-slate-300'

// ─── Page ─────────────────────────────────────────────────────
export default function ProfilePage() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null!)

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) return
      setEmail(user.email)
      document.title = 'Mon Profil · CRM-PIPE'

      // Load profile from DB
      try {
        const { data } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('user_email', user.email)
          .maybeSingle()

        if (data) {
          setProfile(data as Profile)
          if (data.avatar_url) {
            const { data: urlData } = await supabase.storage
              .from('profile-avatars')
              .createSignedUrl(data.avatar_url, 3600)
            if (urlData?.signedUrl) setAvatarPreview(urlData.signedUrl)
          }
        } else {
          setProfile(emptyProfile(user.email))
        }
      } catch {
        // Table may not exist yet — use default profile
        setProfile(emptyProfile(user.email))
      }
      setLoading(false)
    })()
  }, [])

  const handleSave = async () => {
    if (!profile || !email) return
    setErr(null)
    setSaving(true)

    try {
      const payload = {
        user_email: email,
        full_name: profile.full_name.trim(),
        job_title: profile.job_title.trim(),
        phone: profile.phone.trim(),
        mobile: profile.mobile.trim(),
        department: profile.department.trim(),
        location: profile.location.trim(),
        bio: profile.bio.trim(),
        avatar_url: profile.avatar_url,
        updated_at: new Date().toISOString(),
      }

      // Upsert on user_email — try full payload first
      const { error } = await supabase
        .from('user_profiles')
        .upsert(payload, { onConflict: 'user_email' })

      if (error) {
        // Fallback: save only base columns if extended columns don't exist yet
        const basePayload = {
          user_email: email,
          full_name: profile.full_name.trim(),
          phone: profile.phone.trim(),
          department: profile.department.trim(),
          bio: profile.bio.trim(),
          avatar_url: profile.avatar_url,
          updated_at: new Date().toISOString(),
        }
        const { error: err2 } = await supabase
          .from('user_profiles')
          .upsert(basePayload, { onConflict: 'user_email' })
        if (err2) throw err2
      }

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (e: any) {
      setErr(e?.message || 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  // Compress image client-side before upload
  function compressImage(file: File, maxSize = 800, quality = 0.8): Promise<File> {
    return new Promise((resolve, reject) => {
      // If already small enough (<2MB) and JPEG, skip compression
      if (file.size <= 2 * 1024 * 1024 && file.type === 'image/jpeg') {
        resolve(file)
        return
      }
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        const canvas = document.createElement('canvas')
        let w = img.width, h = img.height
        if (w > maxSize || h > maxSize) {
          if (w > h) { h = Math.round(h * maxSize / w); w = maxSize }
          else { w = Math.round(w * maxSize / h); h = maxSize }
        }
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, w, h)
        canvas.toBlob(
          blob => {
            if (!blob) return reject(new Error('Compression échouée'))
            const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
            resolve(compressed)
          },
          'image/jpeg',
          quality
        )
      }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')) }
      img.src = url
    })
  }

  const handleAvatarUpload = async (file: File) => {
    if (!email) return
    // Validate format
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!ALLOWED.includes(file.type)) {
      setErr('Format non supporté. Utilise JPG, PNG, WebP ou GIF.')
      return
    }

    setUploading(true)
    setErr(null)

    try {
      // Auto-compress large images (no more 5MB limit!)
      const compressed = await compressImage(file)
      const safeName = compressed.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${email.replace(/[^a-zA-Z0-9]/g, '_')}/${Date.now()}_${safeName}`

      // Delete old avatar if exists
      if (profile?.avatar_url) {
        await supabase.storage.from('profile-avatars').remove([profile.avatar_url])
      }

      // Upload via server route (compressed file)
      const formData = new FormData()
      formData.append('file', compressed)
      formData.append('path', path)
      formData.append('bucket', 'profile-avatars')

      const res = await authFetch('/api/upload', { method: 'POST', body: formData })
      const result = await res.json()

      if (!res.ok || result.error) {
        setErr(`Erreur upload : ${result.error || 'Upload échoué'}`)
        setUploading(false)
        return
      }

      // Get signed URL for preview
      const { data: urlData } = await supabase.storage
        .from('profile-avatars')
        .createSignedUrl(result.path, 3600)
      if (urlData?.signedUrl) setAvatarPreview(urlData.signedUrl)

      setProfile(p => p ? { ...p, avatar_url: result.path } : p)

      // Auto-save avatar_url to DB immediately (resilient — ignores missing columns)
      try {
        await supabase
          .from('user_profiles')
          .upsert({ user_email: email, avatar_url: result.path, updated_at: new Date().toISOString() }, { onConflict: 'user_email' })
      } catch { /* ignore DB errors — avatar is in storage */ }
    } catch (e: any) {
      setErr(`Erreur : ${e?.message || 'inconnue'}`)
    }
    setUploading(false)
  }

  const removeAvatar = async () => {
    if (!profile?.avatar_url) return
    try {
      await supabase.storage.from('profile-avatars').remove([profile.avatar_url])
    } catch {}
    setProfile(p => p ? { ...p, avatar_url: null } : p)
    setAvatarPreview(null)
  }

  const upd = (field: keyof Profile, value: string) =>
    setProfile(p => p ? { ...p, [field]: value } : p)

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8fafc]">
      <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
    </div>
  )

  if (!profile) return null

  const initials = profile.full_name
    ? profile.full_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : (email || '?')[0].toUpperCase()

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto max-w-3xl px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 shadow-sm transition">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-900">Mon Profil</h1>
            <p className="text-sm text-slate-500">{email}</p>
          </div>
        </div>

        {/* Avatar section */}
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-blue-900 h-32 relative">
            {/* Decorative pattern */}
            <div className="absolute inset-0 opacity-10"
              style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
          </div>
          <div className="px-8 pb-8 -mt-16 relative">
            <div className="flex items-end gap-6">
              {/* Avatar */}
              <div className="relative group">
                <div className="h-28 w-28 rounded-2xl border-4 border-white shadow-lg overflow-hidden bg-slate-100 flex items-center justify-center">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Avatar" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-3xl font-black text-slate-400">{initials}</span>
                  )}
                  {uploading && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-2xl">
                      <Loader2 className="h-6 w-6 text-white animate-spin" />
                    </div>
                  )}
                </div>
                <div className="absolute -bottom-1 -right-1 flex gap-1">
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white shadow-md hover:bg-slate-700 transition"
                    title="Changer la photo"
                  >
                    <Camera className="h-3.5 w-3.5" />
                  </button>
                  {avatarPreview && (
                    <button
                      onClick={removeAvatar}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white shadow-md hover:bg-red-600 transition"
                      title="Supprimer la photo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) handleAvatarUpload(f)
                    e.target.value = '' // reset to allow same file
                  }}
                />
              </div>
              {/* Name & role */}
              <div className="pb-1">
                <h2 className="text-xl font-black text-slate-900">{profile.full_name || ownerName(email)}</h2>
                <p className="text-sm text-slate-500">{profile.job_title || 'Membre de l\'équipe'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="rounded-2xl border border-slate-100 bg-white p-8 shadow-sm space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <User className="h-5 w-5 text-slate-400" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Informations personnelles</h3>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {/* Nom complet */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                <User className="inline h-3 w-3 mr-1" />Nom complet *
              </label>
              <input value={profile.full_name} onChange={e => upd('full_name', e.target.value)}
                placeholder="Prénom Nom" className={inp} />
            </div>

            {/* Email (readonly) */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                <Mail className="inline h-3 w-3 mr-1" />Email
              </label>
              <input value={email || ''} disabled
                className={`${inp} bg-slate-50 text-slate-400 cursor-not-allowed`} />
            </div>

            {/* Poste */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                <Briefcase className="inline h-3 w-3 mr-1" />Poste / Fonction
              </label>
              <input value={profile.job_title} onChange={e => upd('job_title', e.target.value)}
                placeholder="Ex: Business Development Manager" className={inp} />
            </div>

            {/* Département */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                <Building2 className="inline h-3 w-3 mr-1" />Département
              </label>
              <input value={profile.department} onChange={e => upd('department', e.target.value)}
                placeholder="Ex: Commercial, Inside Sales…" className={inp} />
            </div>

            {/* Téléphone fixe */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                <Phone className="inline h-3 w-3 mr-1" />Téléphone fixe
              </label>
              <input value={profile.phone} onChange={e => upd('phone', e.target.value)}
                placeholder="+212 5XX XXX XXX" className={inp} />
            </div>

            {/* Mobile */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                <Phone className="inline h-3 w-3 mr-1" />Mobile
              </label>
              <input value={profile.mobile} onChange={e => upd('mobile', e.target.value)}
                placeholder="+212 6XX XXX XXX" className={inp} />
            </div>

            {/* Localisation */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                <MapPin className="inline h-3 w-3 mr-1" />Localisation
              </label>
              <input value={profile.location} onChange={e => upd('location', e.target.value)}
                placeholder="Ex: Casablanca, Maroc" className={inp} />
            </div>

            {/* Bio */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Bio / Notes</label>
              <textarea value={profile.bio} onChange={e => upd('bio', e.target.value)}
                rows={3} placeholder="Quelques mots sur toi, tes compétences, ton périmètre…"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100 resize-none transition placeholder:text-slate-300" />
            </div>
          </div>
        </div>

        {/* Error/Success + Save */}
        {err && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {err}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> Profil sauvegardé avec succès !
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button onClick={() => router.back()}
            className="h-11 rounded-xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
            Annuler
          </button>
          <button onClick={handleSave} disabled={saving || !profile.full_name.trim()}
            className="h-11 rounded-xl bg-slate-900 px-8 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50 transition flex items-center gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Sauvegarde…' : 'Enregistrer'}
          </button>
        </div>

        {/* SQL Notice */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
          <strong>Note :</strong> Cette page nécessite la table <code className="font-mono bg-amber-100 px-1 rounded">user_profiles</code> et le bucket <code className="font-mono bg-amber-100 px-1 rounded">profile-avatars</code> dans Supabase.
        </div>

      </div>
    </div>
  )
}
