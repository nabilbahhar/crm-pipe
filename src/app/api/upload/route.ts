import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { requireAuth } from '@/lib/apiAuth'

export const runtime = 'nodejs'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

// ─── Security: Strict file type whitelist (no octet-stream) ────
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/csv',
  // PowerPoint
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'application/vnd.ms-powerpoint', // .ppt
]

// ─── Security: Whitelist allowed buckets ───────────────────────
const ALLOWED_BUCKETS = ['deal-files', 'account-files', 'expense-files', 'profile-avatars']

// ─── Security: Whitelist file_type values for DB records ────────
const ALLOWED_FILE_TYPES = ['devis', 'bon_commande', 'facture', 'photo', 'autre', 'bc_client', 'bc_fournisseur', 'bon_livraison', 'pv_reception', 'contrat', 'avatar']

// ─── Security: Validate path (no traversal) ───────────────────
function isPathSafe(path: string): boolean {
  if (!path || typeof path !== 'string') return false
  // Block path traversal
  if (path.includes('..') || path.includes('//')) return false
  // Block null bytes
  if (path.includes('\0')) return false
  // Must be a reasonable filename/path
  if (path.length > 500) return false
  // Block absolute paths
  if (path.startsWith('/')) return false
  return true
}

/**
 * POST /api/upload
 * Server-side file upload to Supabase Storage + optional DB record insert.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const formData = await req.formData()
    const file   = formData.get('file') as File | null
    const bucket = (formData.get('bucket') as string) || 'deal-files'
    const path   = formData.get('path') as string

    // Optional DB record fields
    const opportunityId = formData.get('opportunity_id') as string | null
    const fileType      = formData.get('file_type') as string | null
    // Security: Use verified identity from auth, not client-provided value
    const uploadedBy    = (auth as { user: { email?: string } }).user.email || 'unknown'

    // Security: Validate file_type if provided
    if (fileType && !ALLOWED_FILE_TYPES.includes(fileType)) {
      return NextResponse.json({ error: 'Type de fichier DB non autorisé' }, { status: 400 })
    }

    if (!file || !path) {
      return NextResponse.json({ error: 'Fichier ou chemin manquant' }, { status: 400 })
    }

    // ─── Security: Validate bucket ─────────────────────────────
    if (!ALLOWED_BUCKETS.includes(bucket)) {
      return NextResponse.json({ error: 'Bucket non autorisé' }, { status: 400 })
    }

    // ─── Security: Validate path (no traversal) ────────────────
    if (!isPathSafe(path)) {
      return NextResponse.json({ error: 'Chemin de fichier invalide' }, { status: 400 })
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `Fichier trop volumineux (max ${MAX_FILE_SIZE / 1024 / 1024} MB)` }, { status: 400 })
    }

    // ─── Security: Validate file type (MIME + extension) ───────
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Type de fichier non autorisé' }, { status: 400 })
    }

    // Also validate file extension
    const ext = file.name.split('.').pop()?.toLowerCase()
    const SAFE_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'xlsx', 'xls', 'docx', 'doc', 'csv', 'pptx', 'ppt']
    if (!ext || !SAFE_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ error: 'Extension de fichier non autorisée' }, { status: 400 })
    }

    // Convert File to ArrayBuffer then Buffer for upload
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Upload using service role key (bypasses RLS)
    const { data, error } = await supabaseServer.storage
      .from(bucket)
      .upload(path, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (error) {
      console.error('[upload] Storage error:', error)
      return NextResponse.json({ error: 'Erreur lors de l\'upload' }, { status: 500 })
    }

    // Insert DB record into deal_files or account_files depending on context
    let dbRecord = null
    const accountId = formData.get('account_id') as string | null

    if (accountId && fileType) {
      // Account-level file
      const { data: row, error: dbErr } = await supabaseServer
        .from('account_files')
        .insert({
          account_id: accountId,
          file_type: fileType,
          file_name: file.name,
          file_url: data.path,
          uploaded_by: uploadedBy,
        })
        .select('id, file_type, file_name, file_url')
        .single()

      if (dbErr) {
        console.error('[upload] DB insert error:', dbErr)
        return NextResponse.json({ error: 'Erreur d\'enregistrement en base' }, { status: 500 })
      }
      dbRecord = row
    } else if (opportunityId && fileType) {
      // Deal-level file
      const { data: row, error: dbErr } = await supabaseServer
        .from('deal_files')
        .insert({
          opportunity_id: opportunityId,
          file_type: fileType,
          file_name: file.name,
          file_url: data.path,
          uploaded_by: uploadedBy,
        })
        .select('id, file_type, file_name, file_url')
        .single()

      if (dbErr) {
        console.error('[upload] DB insert error:', dbErr)
        return NextResponse.json({ error: 'Erreur d\'enregistrement en base' }, { status: 500 })
      }
      dbRecord = row
    }

    return NextResponse.json({ path: data.path, dbRecord })
  } catch (e: any) {
    console.error('[upload] Error:', e)
    return NextResponse.json({ error: 'Erreur interne upload' }, { status: 500 })
  }
}

/**
 * DELETE /api/upload
 * Server-side file deletion from Supabase Storage + optional DB record deletion.
 */
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const body = await req.json()
    const bucket  = body.bucket || 'deal-files'
    const paths   = body.paths as string[]
    const fileIds = body.fileIds as string[] | undefined

    // ─── Security: Validate bucket ─────────────────────────────
    if (!ALLOWED_BUCKETS.includes(bucket)) {
      return NextResponse.json({ error: 'Bucket non autorisé' }, { status: 400 })
    }

    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      return NextResponse.json({ error: 'Chemins manquants' }, { status: 400 })
    }

    // ─── Security: Limit number of files to delete ────────────────
    if (paths.length > 50) {
      return NextResponse.json({ error: 'Trop de fichiers à supprimer (max 50)' }, { status: 400 })
    }

    // ─── Security: Validate all paths ──────────────────────────
    for (const p of paths) {
      if (!isPathSafe(p)) {
        return NextResponse.json({ error: 'Chemin de fichier invalide' }, { status: 400 })
      }
    }

    // ─── Security: Validate fileIds format (UUID only) ─────────
    if (fileIds && Array.isArray(fileIds)) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      for (const id of fileIds) {
        if (!uuidRegex.test(id)) {
          return NextResponse.json({ error: 'ID de fichier invalide' }, { status: 400 })
        }
      }
    }

    // Delete from storage
    const { error } = await supabaseServer.storage
      .from(bucket)
      .remove(paths)

    if (error) {
      console.error('[upload] Delete error:', error)
      return NextResponse.json({ error: 'Erreur de suppression' }, { status: 500 })
    }

    // Delete DB records if fileIds provided
    if (fileIds && fileIds.length > 0) {
      const ALLOWED_TABLES = ['deal_files', 'account_files'] as const
      const dbTable = (body.dbTable as string) || 'deal_files'
      const table = ALLOWED_TABLES.includes(dbTable as any) ? dbTable : 'deal_files'
      await supabaseServer.from(table).delete().in('id', fileIds)
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[upload] Delete error:', e)
    return NextResponse.json({ error: 'Erreur interne suppression' }, { status: 500 })
  }
}
