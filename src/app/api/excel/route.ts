import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

export async function POST(req: NextRequest) {
  try {
    const spec = await req.json()
    const wb = new ExcelJS.Workbook()
    wb.creator = 'CRM Assistant'
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
        titleCell.font = { name: 'Arial', bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
        titleCell.alignment = { vertical: 'middle', horizontal: 'left' }
        ws.mergeCells(1, 1, 1, sheet.headers.length)

        // Subtitle with period
        const subRow = ws.addRow([`Généré le ${new Date().toLocaleDateString('fr-MA')} | Assistant CRM`])
        subRow.height = 20
        const subCell = subRow.getCell(1)
        subCell.font = { name: 'Arial', italic: true, size: 9, color: { argb: 'FF94A3B8' } }
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
        cell.font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
        cell.border = {
          bottom: { style: 'medium', color: { argb: 'FF3B82F6' } }
        }
      })

      // Data rows
      sheet.rows.forEach((row: any[], rowIndex: number) => {
        const dataRow = ws.addRow(row)
        dataRow.height = 20
        const isEven = rowIndex % 2 === 0
        dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const val = row[colNumber - 1]
          cell.font = { name: 'Arial', size: 9, color: { argb: 'FF374151' } }
          cell.fill = {
            type: 'pattern', pattern: 'solid',
            fgColor: { argb: isEven ? 'FFF8FAFC' : 'FFFFFFFF' }
          }
          cell.alignment = {
            vertical: 'middle',
            horizontal: typeof val === 'number' ? 'right' : 'left',
            wrapText: typeof val === 'string' && val.length > 30
          }
          cell.border = {
            top: { style: 'hair', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
            left: { style: 'hair', color: { argb: 'FFE2E8F0' } },
            right: { style: 'hair', color: { argb: 'FFE2E8F0' } },
          }
          if (typeof val === 'number' && val > 1000) {
            cell.numFmt = '#,##0'
          }
        })
      })

      // Totals row
      if (sheet.totalsRow) {
        const totalRow = ws.addRow(sheet.totalsRow)
        totalRow.height = 24
        totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const val = sheet.totalsRow[colNumber - 1]
          cell.font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FF1E293B' } }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }
          cell.alignment = {
            vertical: 'middle',
            horizontal: typeof val === 'number' ? 'right' : 'left'
          }
          cell.border = {
            top: { style: 'medium', color: { argb: 'FF3B82F6' } },
            bottom: { style: 'thin', color: { argb: 'FF3B82F6' } },
          }
          if (typeof val === 'number' && val > 1000) {
            cell.numFmt = '#,##0'
          }
        })
      }

      // Notes
      if (sheet.notes) {
        ws.addRow([])
        const noteRow = ws.addRow([`📌 ${sheet.notes}`])
        noteRow.getCell(1).font = { name: 'Arial', italic: true, size: 9, color: { argb: 'FF64748B' } }
      }

      // Auto column widths
      ws.columns.forEach((col, index) => {
        let maxLen = (sheet.headers[index] || '').length + 4
        sheet.rows.forEach((row: any[]) => {
          const cellLen = String(row[index] ?? '').length
          if (cellLen > maxLen) maxLen = cellLen
        })
        col.width = Math.min(Math.max(maxLen + 2, 10), 45)
      })

      // Freeze header
      const freezeRow = sheet.title ? rowOffset + 2 : 2
      ws.views = [{ state: 'frozen', ySplit: freezeRow, showGridLines: false }]

      // Auto filter on header row
      const headerRowNum = sheet.title ? 4 : 1
      ws.autoFilter = {
        from: { row: headerRowNum, column: 1 },
        to: { row: headerRowNum, column: sheet.headers.length }
      }
    }

    const buffer = await wb.xlsx.writeBuffer()

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${spec.filename || 'export.xlsx'}"`,
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
