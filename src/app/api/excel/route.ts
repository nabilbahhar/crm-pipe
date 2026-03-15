import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { requireAuth } from '@/lib/apiAuth'
import { fileLimiter } from '@/lib/rateLimit'

// ─── Brand colors ────────────────────────────────────────────────────────────
const C = {
  dark:     'FF0F172A',
  slate900: 'FF1E293B',
  slate700: 'FF334155',
  slate600: 'FF475569',
  slate400: 'FF94A3B8',
  slate200: 'FFE2E8F0',
  slate50:  'FFF8FAFC',
  white:    'FFFFFFFF',
  blue600:  'FF2563EB',
  blue500:  'FF3B82F6',
  blue100:  'FFDBEAFE',
  blue50:   'FFEFF6FF',
  green700: 'FF15803D',
  green600: 'FF16A34A',
  greenBg:  'FFE8F5E9',
  greenBg2: 'FFF1F8F2',
  red600:   'FFDC2626',
  redBg:    'FFFCE4EC',
  redBg2:   'FFFEF0F3',
  gray700:  'FF374151',
  gray500:  'FF64748B',
}

// ─── Helper: paint all cells in a merged row ─────────────────────────────────
function fillRow(row: ExcelJS.Row, colCount: number, fill: ExcelJS.Fill) {
  for (let c = 1; c <= colCount; c++) {
    row.getCell(c).fill = fill
  }
}

// ─── Helper: build a data sheet ──────────────────────────────────────────────
function buildDataSheet(wb: ExcelJS.Workbook, sheet: any) {
  const ws = wb.addWorksheet((sheet.name || 'Data').slice(0, 31), {
    views: [{ showGridLines: false }],
    properties: { defaultRowHeight: 20 },
  })

  const colCount = sheet.headers.length
  let rowOffset = 0

  // ── Title banner ──
  if (sheet.title) {
    const titleRow = ws.addRow([sheet.title])
    titleRow.height = 34
    const tc = titleRow.getCell(1)
    tc.font = { name: 'Calibri', bold: true, size: 14, color: { argb: C.white } }
    tc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.slate900 } }
    tc.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    ws.mergeCells(1, 1, 1, colCount)
    fillRow(titleRow, colCount, { type: 'pattern', pattern: 'solid', fgColor: { argb: C.slate900 } })

    const subRow = ws.addRow([`Généré le ${new Date().toLocaleDateString('fr-MA')} | CRM-PIPE · Compucom Maroc`])
    subRow.height = 22
    const sc = subRow.getCell(1)
    sc.font = { name: 'Calibri', italic: true, size: 9, color: { argb: C.slate400 } }
    sc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.dark } }
    sc.alignment = { vertical: 'middle', indent: 1 }
    ws.mergeCells(2, 1, 2, colCount)
    fillRow(subRow, colCount, { type: 'pattern', pattern: 'solid', fgColor: { argb: C.dark } })

    const sepRow = ws.addRow([])
    sepRow.height = 6
    rowOffset = 3
  }

  // ── Column headers ──
  const headerRow = ws.addRow(sheet.headers)
  headerRow.height = 30
  headerRow.eachCell((cell, colNumber) => {
    cell.value = sheet.headers[colNumber - 1]
    cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: C.white } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.slate700 } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = {
      bottom: { style: 'medium', color: { argb: C.blue500 } },
      left:   { style: 'thin', color: { argb: C.slate600 } },
      right:  { style: 'thin', color: { argb: C.slate600 } },
    }
  })

  // ── Status column detection ──
  const statusColIdx = sheet.headers.findIndex((h: string) =>
    h.toLowerCase() === 'statut' || h.toLowerCase() === 'status'
  )

  // ── Amount columns detection (for number formatting) ──
  const amountColIdxs = sheet.headers.reduce((acc: number[], h: string, i: number) => {
    if (/montant|total|prix|amount|ca |revenue|pipeline/i.test(h)) acc.push(i)
    return acc
  }, [])

  // ── Data rows ──
  sheet.rows.forEach((row: any[], rowIndex: number) => {
    const dataRow = ws.addRow(row)
    dataRow.height = 22
    const isEven = rowIndex % 2 === 0

    let rowBgEven = C.slate50
    let rowBgOdd  = C.white
    if (statusColIdx >= 0) {
      const st = String(row[statusColIdx] || '')
      if (st === 'Won')  { rowBgEven = C.greenBg; rowBgOdd = C.greenBg2 }
      if (st === 'Lost') { rowBgEven = C.redBg;   rowBgOdd = C.redBg2 }
    }

    dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const val = row[colNumber - 1]
      cell.font = { name: 'Calibri', size: 9.5, color: { argb: C.gray700 } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? rowBgEven : rowBgOdd } }
      cell.alignment = {
        vertical: 'middle',
        horizontal: typeof val === 'number' ? 'right' : 'left',
        wrapText: typeof val === 'string' && val.length > 35,
        indent: typeof val === 'number' ? 0 : 1,
      }
      cell.border = {
        top:    { style: 'hair', color: { argb: C.slate200 } },
        bottom: { style: 'hair', color: { argb: C.slate200 } },
        left:   { style: 'hair', color: { argb: C.slate200 } },
        right:  { style: 'hair', color: { argb: C.slate200 } },
      }

      // Bold + colored status
      if (statusColIdx >= 0 && colNumber - 1 === statusColIdx) {
        cell.font = {
          name: 'Calibri', bold: true, size: 9.5,
          color: { argb: val === 'Won' ? C.green600 : val === 'Lost' ? C.red600 : C.blue600 }
        }
        cell.alignment = { ...cell.alignment, horizontal: 'center' }
      }

      // Number formatting
      if (typeof val === 'number') {
        if (amountColIdxs.includes(colNumber - 1) || val >= 1000) {
          cell.numFmt = '#,##0'
        }
      }
    })
  })

  // ── Totals row ──
  if (sheet.totalsRow) {
    const totalRow = ws.addRow(sheet.totalsRow)
    totalRow.height = 28
    totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const val = sheet.totalsRow[colNumber - 1]
      cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: C.slate900 } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.blue100 } }
      cell.alignment = {
        vertical: 'middle',
        horizontal: typeof val === 'number' ? 'right' : 'left',
        indent: 1,
      }
      cell.border = {
        top:    { style: 'medium', color: { argb: C.blue500 } },
        bottom: { style: 'medium', color: { argb: C.blue500 } },
        left:   { style: 'hair',   color: { argb: C.blue500 } },
        right:  { style: 'hair',   color: { argb: C.blue500 } },
      }
      if (typeof val === 'number' && val >= 1000) cell.numFmt = '#,##0'
    })
  }

  // ── Notes ──
  if (sheet.notes) {
    ws.addRow([])
    const noteRow = ws.addRow([sheet.notes])
    noteRow.getCell(1).font = { name: 'Calibri', italic: true, size: 9, color: { argb: C.gray500 } }
    noteRow.getCell(1).alignment = { indent: 1 }
  }

  // ── Auto column widths ──
  ws.columns.forEach((col, index) => {
    let maxLen = (sheet.headers[index] || '').length + 4
    sheet.rows.forEach((row: any[]) => {
      const cellLen = String(row[index] ?? '').length
      if (cellLen > maxLen) maxLen = cellLen
    })
    col.width = Math.min(Math.max(maxLen + 3, 13), 48)
  })

  // ── Freeze panes on header row ──
  const headerRowNum = sheet.title ? rowOffset + 1 : 1
  ws.views = [{ state: 'frozen', ySplit: headerRowNum, showGridLines: false }]

  // ── Auto filter ──
  const headerRowNumAbs = sheet.title ? 4 : 1
  ws.autoFilter = {
    from: { row: headerRowNumAbs, column: 1 },
    to:   { row: headerRowNumAbs, column: colCount },
  }

  // ── Print setup ──
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }

  return ws
}

// ─── Helper: build summary sheet ─────────────────────────────────────────────
function buildSummarySheet(wb: ExcelJS.Workbook, s: any) {
  const ws = wb.addWorksheet('Résumé', { views: [{ showGridLines: false }] })

  // ── Title banner ──
  const titleRow = ws.addRow([s.title || 'Résumé Analytique'])
  titleRow.height = 40
  const tc = titleRow.getCell(1)
  tc.font = { name: 'Calibri', bold: true, size: 16, color: { argb: C.white } }
  tc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.slate900 } }
  tc.alignment = { vertical: 'middle', indent: 1 }
  ws.mergeCells(1, 1, 1, 4)
  fillRow(titleRow, 4, { type: 'pattern', pattern: 'solid', fgColor: { argb: C.slate900 } })

  const subRow = ws.addRow([`Généré le ${new Date().toLocaleDateString('fr-MA')} | CRM-PIPE · Compucom Maroc`])
  subRow.height = 22
  subRow.getCell(1).font = { name: 'Calibri', italic: true, size: 9, color: { argb: C.slate400 } }
  subRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.dark } }
  subRow.getCell(1).alignment = { vertical: 'middle', indent: 1 }
  ws.mergeCells(2, 1, 2, 4)
  fillRow(subRow, 4, { type: 'pattern', pattern: 'solid', fgColor: { argb: C.dark } })

  ws.addRow([]).height = 10 // separator

  // ── KPI section ──
  if (s.kpis && s.kpis.length > 0) {
    const sectionTitle = ws.addRow(['  INDICATEURS CLÉS'])
    sectionTitle.height = 28
    sectionTitle.getCell(1).font = { name: 'Calibri', bold: true, size: 11, color: { argb: C.slate900 } }
    ws.mergeCells(sectionTitle.number, 1, sectionTitle.number, 4)

    const kpiHeader = ws.addRow(['Indicateur', 'Valeur', '', 'Détail'])
    kpiHeader.height = 26
    kpiHeader.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: C.white } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.slate700 } }
      cell.alignment = { vertical: 'middle', indent: 1 }
      cell.border = {
        bottom: { style: 'medium', color: { argb: C.blue500 } },
      }
    })

    s.kpis.forEach((kpi: { label: string; value: string | number; detail?: string }, i: number) => {
      const kpiRow = ws.addRow([kpi.label, kpi.value, '', kpi.detail || ''])
      kpiRow.height = 28
      const bgColor = i % 2 === 0 ? C.blue50 : C.white
      kpiRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } }
        cell.alignment = { vertical: 'middle', indent: 1 }
        cell.border = {
          bottom: { style: 'hair', color: { argb: C.slate200 } },
          left:   { style: 'hair', color: { argb: C.slate200 } },
          right:  { style: 'hair', color: { argb: C.slate200 } },
        }
        if (colNum === 1) {
          cell.font = { name: 'Calibri', bold: true, size: 10.5, color: { argb: C.slate900 } }
        } else if (colNum === 2) {
          cell.font = { name: 'Calibri', bold: true, size: 13, color: { argb: C.blue600 } }
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
          if (typeof kpi.value === 'number' && kpi.value >= 1000) cell.numFmt = '#,##0'
        } else {
          cell.font = { name: 'Calibri', size: 9, color: { argb: C.gray500 } }
        }
      })
    })
  }

  // ── Breakdown section ──
  if (s.breakdown && s.breakdown.length > 0) {
    ws.addRow([]).height = 8
    ws.addRow([]).height = 8

    const bdSectionTitle = ws.addRow([`  ${(s.breakdownTitle || 'Répartition').toUpperCase()}`])
    bdSectionTitle.height = 28
    bdSectionTitle.getCell(1).font = { name: 'Calibri', bold: true, size: 11, color: { argb: C.slate900 } }
    ws.mergeCells(bdSectionTitle.number, 1, bdSectionTitle.number, 4)

    const bdHeaders = ws.addRow(s.breakdownHeaders || ['Catégorie', 'Montant', 'Nombre', '%'])
    bdHeaders.height = 26
    bdHeaders.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: C.white } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.slate700 } }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
      cell.border = {
        bottom: { style: 'medium', color: { argb: C.blue500 } },
      }
    })

    s.breakdown.forEach((row: any[], i: number) => {
      const bdRow = ws.addRow(row)
      bdRow.height = 24
      const bgColor = i % 2 === 0 ? C.slate50 : C.white
      bdRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } }
        cell.alignment = { vertical: 'middle', horizontal: typeof cell.value === 'number' ? 'right' : (colNum === 1 ? 'left' : 'center'), indent: colNum === 1 ? 1 : 0 }
        cell.border = {
          bottom: { style: 'hair', color: { argb: C.slate200 } },
          left:   { style: 'hair', color: { argb: C.slate200 } },
          right:  { style: 'hair', color: { argb: C.slate200 } },
        }
        if (colNum === 1) {
          cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: C.slate900 } }
        } else {
          cell.font = { name: 'Calibri', size: 10, color: { argb: C.gray700 } }
        }
        if (typeof cell.value === 'number' && (cell.value as number) >= 1000) cell.numFmt = '#,##0'
      })
    })

    // Breakdown total row
    if (s.breakdownTotal) {
      const btRow = ws.addRow(s.breakdownTotal)
      btRow.height = 26
      btRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: C.slate900 } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.blue100 } }
        cell.alignment = { vertical: 'middle', horizontal: typeof cell.value === 'number' ? 'right' : 'center' }
        cell.border = { top: { style: 'medium', color: { argb: C.blue500 } }, bottom: { style: 'medium', color: { argb: C.blue500 } } }
        if (typeof cell.value === 'number' && (cell.value as number) >= 1000) cell.numFmt = '#,##0'
      })
    }
  }

  // ── Footer ──
  ws.addRow([]).height = 14
  const footerRow = ws.addRow(['CRM-PIPE · Compucom Maroc · Confidentiel'])
  footerRow.getCell(1).font = { name: 'Calibri', italic: true, size: 8, color: { argb: C.slate400 } }
  footerRow.getCell(1).alignment = { indent: 1 }

  // ── Column widths ──
  ws.getColumn(1).width = 30
  ws.getColumn(2).width = 22
  ws.getColumn(3).width = 8
  ws.getColumn(4).width = 34

  // ── Print setup ──
  ws.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1 }

  return ws
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST handler
// ═══════════════════════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    // ─── Rate limiting ───
    const rl = fileLimiter.check(auth.user.email || auth.user.id)
    if (!rl.ok) return NextResponse.json({ error: rl.error }, { status: 429 })

    // ─── Security: body size ───
    const MAX_BODY_SIZE = 5 * 1024 * 1024
    const rawText = await req.text()
    if (rawText.length > MAX_BODY_SIZE) {
      return NextResponse.json({ error: 'Requête trop volumineuse' }, { status: 413 })
    }
    const spec = JSON.parse(rawText)

    // ─── Security: limits ───
    if (Array.isArray(spec.sheets) && spec.sheets.length > 20) {
      return NextResponse.json({ error: 'Trop de feuilles (max 20)' }, { status: 400 })
    }
    const MAX_ROWS = 10_000
    for (const s of (spec.sheets || [])) {
      if (Array.isArray(s.rows) && s.rows.length > MAX_ROWS) {
        return NextResponse.json({ error: `Trop de lignes par feuille (max ${MAX_ROWS})` }, { status: 400 })
      }
    }

    const wb = new ExcelJS.Workbook()
    wb.creator = 'CRM-PIPE'
    wb.created = new Date()

    // ── Summary sheet FIRST (so it's the first tab) ──
    if (spec.summary) {
      buildSummarySheet(wb, spec.summary)
    }

    // ── Data sheets ──
    for (const sheet of spec.sheets) {
      buildDataSheet(wb, sheet)
    }

    const buffer = await wb.xlsx.writeBuffer()

    // ─── Sanitize filename ───
    const rawFilename = spec.filename || 'export.xlsx'
    const safeFilename = rawFilename
      .replace(/[^a-zA-Z0-9_\-. àâäéèêëïîôùûüÿçÀÂÄÉÈÊËÏÎÔÙÛÜŸÇ]/g, '_')
      .replace(/\.{2,}/g, '_')
      .slice(0, 200)

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
      },
    })
  } catch (err: any) {
    console.error('[excel] Error:', err)
    return NextResponse.json({ error: 'Erreur interne génération Excel' }, { status: 500 })
  }
}
