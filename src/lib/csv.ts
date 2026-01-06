function esc(v: any) {
  const s = (v ?? '').toString()
  if (s.includes(';') || s.includes('\n') || s.includes('"')) return `"${s.replaceAll('"', '""')}"`
  return s
}

export function toCSV(rows: Record<string, any>[], headers: string[]) {
  const head = headers.map(esc).join(';')
  const body = rows.map(r => headers.map(h => esc(r[h])).join(';')).join('\n')
  return `${head}\n${body}\n`
}
