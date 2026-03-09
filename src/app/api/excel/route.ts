import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { requireAuth } from '@/lib/apiAuth'

// Status-based row color tinting
const STATUS_COLORS: Record<string, string> = {
  Won:  'FFE8F5E9',  // light green
  Lost: 'FFFCE4EC',  // light red
  Open: 'FFFFFFFF',  // white (default)
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const spec = await req.json()
    const wb = new ExcelJS.Workbook()
    wb.creator = 'CRM-PIPE'
    wb.created = new Date()

    for (const sheet of spec.sheets) {
      const ws = wb.addWorksheet(sheet.name.slice(0, 31), {
        views: [{ showGridLines: false }]
      })

      let rowOffset = 0

      // Title row
      if (sheet.title) {
        const titleRow = ws.addRow([sheet.title])
        titleRow.height = 32
        const titleCell = titleRow.getCell(1)
        titleCell.font = { name: 'Calibri', bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
        titleCell.alignment = { vertical: 'middle', horizontal: 'left' }
        ws.mergeCells(1, 1, 1, sheet.headers.length)

        // Subtitle with period
        const subRow = ws.addRow([`Généré le ${new Date().toLocaleDateString('fr-MA')} | CRM-PIPE · Compucom Maroc`])
        subRow.height = 20
        const subCell = subRow.getCell(1)
        subCell.font = { name: 'Calibri', italic: true, size: 9, color: { argb: 'FF94A3B8' } }
        subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
        ws.mergeCells(2, 1, 2, sheet.headers.length)

        // Empty separator
        const sepRow = ws.addRow([])
        sepRow.height = 8
        rowOffset = 3
      }

      // Header row
      const headerRow = ws.addRow(sheet.headers)
      headerRow.height = 28
      headerRow.eachCell((cell, colNumber) => {
        cell.value = sheet.headers[colNumber - 1]
        cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
        cell.border = {
          bottom: { style: 'medium', color: { argb: 'FF3B82F6' } }
        }
      })

      // Find status column index for conditional coloring
      const statusColIdx = sheet.headers.findIndex((h: string) =>
        h.toLowerCase() === 'statut' || h.toLowerCase() === 'status'
      )

      // Data rows
      sheet.rows.forEach((row: any[], rowIndex: number) => {
        const dataRow = ws.addRow(row)
        dataRow.height = 22
        const isEven = rowIndex % 2 === 0

        // Determine row tint from status
        let rowBgEven = 'FFF8FAFC'
        let rowBgOdd  = 'FFFFFFFF'
        if (statusColIdx >= 0) {
          const st = String(row[statusColIdx] || '')
          if (st === 'Won')  { rowBgEven = 'FFE8F5E9'; rowBgOdd = 'FFF1F8F2' }
          if (st === 'Lost') { rowBgEven = 'FFFCE4EC'; rowBgOdd = 'FFFEF0F3' }
        }

        dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const val = row[colNumber - 1]
          cell.font = { name: 'Calibri', size: 9, color: { argb: 'FF374151' } }
          cell.fill = {
            type: 'pattern', pattern: 'solid',
            fgColor: { argb: isEven ? rowBgEven : rowBgOdd }
          }
          cell.alignment = {
            vertical: 'middle',
            horizontal: typeof val === 'number' ? 'right' : 'left',
            wrapText: typeof val === 'string' && val.length > 30
          }
          cell.border = {
            top:    { style: 'hair', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
            left:   { style: 'hair', color: { argb: 'FFE2E8F0' } },
            right:  { style: 'hair', color: { argb: 'FFE2E8F0' } },
          }

          // Bold + colored status values
          if (statusColIdx >= 0 && colNumber - 1 === statusColIdx) {
            cell.font = {
              name: 'Calibri', bold: true, size: 9,
              color: { argb: val === 'Won' ? 'FF16A34A' : val === 'Lost' ? 'FFDC2626' : 'FF2563EB' }
            }
          }

          if (typeof val === 'number' && val > 1000) {
            cell.numFmt = '#,##0'
          }
        })
      })

      // Totals row
      if (sheet.totalsRow) {
        const totalRow = ws.addRow(sheet.totalsRow)
        totalRow.height = 26
        totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const val = sheet.totalsRow[colNumber - 1]
          cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FF1E293B' } }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }
          cell.alignment = {
            vertical: 'middle',
            horizontal: typeof val === 'number' ? 'right' : 'left'
          }
          cell.border = {
            top:    { style: 'medium', color: { argb: 'FF3B82F6' } },
            bottom: { style: 'thin',   color: { argb: 'FF3B82F6' } },
          }
          if (typeof val === 'number' && val > 1000) {
            cell.numFmt = '#,##0'
          }
        })
      }

      // Notes
      if (sheet.notes) {
        ws.addRow([])
        const noteRow = ws.addRow([sheet.notes])
        noteRow.getCell(1).font = { name: 'Calibri', italic: true, size: 9, color: { argb: 'FF64748B' } }
      }

      // Auto column widths
      ws.columns.forEach((col, index) => {
        let maxLen = (sheet.headers[index] || '').length + 4
        sheet.rows.forEach((row: any[]) => {
          const cellLen = String(row[index] ?? '').length
          if (cellLen > maxLen) maxLen = cellLen
        })
        col.width = Math.min(Math.max(maxLen + 2, 12), 45)
      })

      // Freeze panes
      const headerRowNum2 = sheet.title ? rowOffset + 1 : 1
      ws.views = [{ state: 'frozen', ySplit: headerRowNum2, showGridLines: false }]

      // Auto filter on header row
      const headerRowNum = sheet.title ? 4 : 1
      ws.autoFilter = {
        from: { row: headerRowNum, column: 1 },
        to:   { row: headerRowNum, column: sheet.headers.length }
      }
    }

    // ─── KPI Summary Sheet (optional) ────────────────────────────────────────
    if (spec.summary) {
      const s = spec.summary
      const ws = wb.addWorksheet('Résumé', { views: [{ showGridLines: false }] })

      // Title
      const titleRow = ws.addRow([s.title || 'Résumé'])
      titleRow.height = 36
      titleRow.getCell(1).font = { name: 'Calibri', bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
      titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
      titleRow.getCell(1).alignment = { vertical: 'middle' }
      ws.mergeCells(1, 1, 1, 4)
      // Also paint B1-D1
      for (let c = 2; c <= 4; c++) {
        titleRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
      }

      // Subtitle
      const subRow = ws.addRow([`Généré le ${new Date().toLocaleDateString('fr-MA')} | CRM-PIPE · Compucom Maroc`])
      subRow.height = 20
      subRow.getCell(1).font = { name: 'Calibri', italic: true, size: 9, color: { argb: 'FF94A3B8' } }
      subRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
      ws.mergeCells(2, 1, 2, 4)
      for (let c = 2; c <= 4; c++) {
        subRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
      }

      ws.addRow([]) // separator

      // KPI cards
      if (s.kpis && s.kpis.length > 0) {
        const kpiHeader = ws.addRow(['Indicateur', 'Valeur', '', 'Détail'])
        kpiHeader.height = 24
        kpiHeader.eachCell({ includeEmpty: true }, (cell) => {
          cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }
          cell.alignment = { vertical: 'middle' }
        })

        s.kpis.forEach((kpi: { label: string; value: string | number; detail?: string }, i: number) => {
          const kpiRow = ws.addRow([kpi.label, kpi.value, '', kpi.detail || ''])
          kpiRow.height = 26
          const bgColor = i % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF'
          kpiRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } }
            cell.alignment = { vertical: 'middle' }
            cell.border = {
              bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
            }
            if (colNum === 1) {
              cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FF1E293B' } }
            } else if (colNum === 2) {
              cell.font = { name: 'Calibri', bold: true, size: 12, color: { argb: 'FF3B82F6' } }
              if (typeof kpi.value === 'number' && kpi.value > 1000) cell.numFmt = '#,##0'
            } else {
              cell.font = { name: 'Calibri', size: 9, color: { argb: 'FF64748B' } }
            }
          })
        })
      }

      // Breakdown table
      if (s.breakdown && s.breakdown.length > 0) {
        ws.addRow([])
        ws.addRow([])

        const bdTitle = ws.addRow([s.breakdownTitle || 'Répartition'])
        bdTitle.height = 24
        bdTitle.getCell(1).font = { name: 'Calibri', bold: true, size: 12, color: { argb: 'FF1E293B' } }

        const bdHeaders = ws.addRow(s.breakdownHeaders || ['Catégorie', 'Montant', 'Nombre', '%'])
        bdHeaders.height = 24
        bdHeaders.eachCell({ includeEmpty: true }, (cell) => {
          cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
        })

        s.breakdown.forEach((row: any[], i: number) => {
          const bdRow = ws.addRow(row)
          bdRow.height = 22
          const bgColor = i % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF'
          bdRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } }
            cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF374151' } }
            cell.alignment = { vertical: 'middle', horizontal: typeof cell.value === 'number' ? 'right' : 'left' }
            cell.border = {
              bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
            }
            if (typeof cell.value === 'number' && (cell.value as number) > 1000) cell.numFmt = '#,##0'
          })
        })
      }

      ws.getColumn(1).width = 28
      ws.getColumn(2).width = 22
      ws.getColumn(3).width = 8
      ws.getColumn(4).width = 30
    }

    const buffer = await wb.xlsx.writeBuffer()

    // ─── Security: Sanitize filename (no path traversal, no special chars) ───
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
      }
    })
  } catch (err: any) {
    console.error('[excel] Error:', err)
    return NextResponse.json({ error: 'Erreur interne génération Excel' }, { status: 500 })
  }
}
