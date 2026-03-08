import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { requireAuth } from '@/lib/apiAuth'

export const runtime = 'nodejs'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/csv',
  'application/octet-stream',
]

/**
 * POST /api/upload
 * Server-side file upload to Supabase Storage + optional DB record insert.
 * Uses service role key (bypasses RLS).
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
    const uploadedBy    = formData.get('uploaded_by') as string | null

    if (!file || !path) {
      return NextResponse.json({ error: 'Missing file or path' }, { status: 400 })
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `Fichier trop volumineux (max ${MAX_FILE_SIZE / 1024 / 1024} MB)` }, { status: 400 })
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: `Type de fichier non autorisé: ${file.type}` }, { status: 400 })
    }

    // Convert File to ArrayBuffer then Buffer for upload
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Upload using service role key (bypasses RLS)
    const { data, error } = await supabaseServer.storage
      .from(bucket)
      .upload(path, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      })

    if (error) {
      console.error('[upload] Storage error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // If opportunity_id provided, also insert into deal_files table (bypasses RLS)
    let dbRecord = null
    if (opportunityId && fileType) {
      const { data: row, error: dbErr } = await supabaseServer
        .from('deal_files')
        .insert({
          opportunity_id: opportunityId,
          file_type: fileType,
          file_name: file.name,
          file_url: data.path,
          uploaded_by: uploadedBy || 'unknown',
        })
        .select('id, file_type, file_name, file_url')
        .single()

      if (dbErr) {
        console.error('[upload] DB insert error:', dbErr)
        return NextResponse.json({ error: dbErr.message, path: data.path }, { status: 500 })
      }
      dbRecord = row
    }

    return NextResponse.json({ path: data.path, dbRecord })
  } catch (e: any) {
    console.error('[upload] Error:', e)
    return NextResponse.json({ error: e?.message || 'Upload failed' }, { status: 500 })
  }
}

/**
 * DELETE /api/upload
 * Server-side file deletion from Supabase Storage + optional DB record deletion.
 * Expects JSON body: { bucket, paths: string[], fileIds?: string[] }
 */
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const body = await req.json()
    const bucket  = body.bucket || 'deal-files'
    const paths   = body.paths as string[]
    const fileIds = body.fileIds as string[] | undefined

    if (!paths || paths.length === 0) {
      return NextResponse.json({ error: 'Missing paths' }, { status: 400 })
    }

    // Delete from storage
    const { error } = await supabaseServer.storage
      .from(bucket)
      .remove(paths)

    if (error) {
      console.error('[upload] Delete error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Delete DB records if fileIds provided
    if (fileIds && fileIds.length > 0) {
      await supabaseServer.from('deal_files').delete().in('id', fileIds)
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[upload] Delete error:', e)
    return NextResponse.json({ error: e?.message || 'Delete failed' }, { status: 500 })
  }
}
