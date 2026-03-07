import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

/**
 * POST /api/upload
 * Server-side file upload to Supabase Storage using service role key (bypasses RLS).
 * Expects multipart/form-data with fields:
 *   - file: the file blob
 *   - bucket: storage bucket name (default: 'deal-files')
 *   - path: destination path in the bucket
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file   = formData.get('file') as File | null
    const bucket = (formData.get('bucket') as string) || 'deal-files'
    const path   = formData.get('path') as string

    if (!file || !path) {
      return NextResponse.json({ error: 'Missing file or path' }, { status: 400 })
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

    return NextResponse.json({ path: data.path })
  } catch (e: any) {
    console.error('[upload] Error:', e)
    return NextResponse.json({ error: e?.message || 'Upload failed' }, { status: 500 })
  }
}

/**
 * DELETE /api/upload
 * Server-side file deletion from Supabase Storage.
 * Expects JSON body: { bucket, paths: string[] }
 */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json()
    const bucket = body.bucket || 'deal-files'
    const paths  = body.paths as string[]

    if (!paths || paths.length === 0) {
      return NextResponse.json({ error: 'Missing paths' }, { status: 400 })
    }

    const { error } = await supabaseServer.storage
      .from(bucket)
      .remove(paths)

    if (error) {
      console.error('[upload] Delete error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[upload] Delete error:', e)
    return NextResponse.json({ error: e?.message || 'Delete failed' }, { status: 500 })
  }
}
