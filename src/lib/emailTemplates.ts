/**
 * @file lib/emailTemplates.ts
 * Helpers pour générer des emails HTML professionnels depuis le CRM.
 * Chaque template retourne du HTML prêt à afficher dans un iframe ou copier.
 */

function esc(s: string | null | undefined): string {
  if (!s) return ''
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

const baseStyle = `
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 24px; color: #1e293b; line-height: 1.6; }
    .header { background: #0f172a; color: white; padding: 16px 24px; border-radius: 12px 12px 0 0; }
    .header h2 { margin: 0; font-size: 16px; font-weight: 600; }
    .header .sub { color: #94a3b8; font-size: 12px; margin-top: 4px; }
    .body { background: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; padding: 24px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th { background: #f1f5f9; text-align: left; padding: 8px 12px; font-size: 11px; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #e2e8f0; }
    td { padding: 8px 12px; font-size: 13px; border-bottom: 1px solid #e2e8f0; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }
    .badge-blue { background: #dbeafe; color: #1d4ed8; }
    .badge-green { background: #dcfce7; color: #15803d; }
    .badge-red { background: #fee2e2; color: #dc2626; }
    .badge-amber { background: #fef3c7; color: #b45309; }
    .total-row { font-weight: 700; background: #f1f5f9; }
    .footer { margin-top: 20px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; }
    .section-title { font-size: 13px; font-weight: 700; color: #334155; margin: 16px 0 8px; text-transform: uppercase; letter-spacing: 0.5px; }
  </style>
`

// ─── Supply email ────────────────────────────────────────────────────────────

type SupplyEmailData = {
  dealTitle: string
  accountName: string
  poNumber: string
  amount: number
  paymentTerms: string
  lines: Array<{
    ref: string; designation: string; qty: number
    pu_achat: number; fournisseur: string
    contact: string; email: string; tel: string
  }>
  frais: number
  notes: string
  senderName: string
}

export function buildSupplyEmail(data: SupplyEmailData): string {
  const numFmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Group lines by supplier
  const groups: Record<string, typeof data.lines> = {}
  for (const l of data.lines) {
    const key = l.fournisseur || 'Non spécifié'
    if (!groups[key]) groups[key] = []
    groups[key].push(l)
  }

  const totalAchat = data.lines.reduce((s, l) => s + l.qty * l.pu_achat, 0)

  let suppliersHtml = ''
  for (const [name, lines] of Object.entries(groups)) {
    const contact = lines[0]
    suppliersHtml += `
      <div class="section-title">${esc(name)}</div>
      <div style="font-size:12px;color:#64748b;margin-bottom:8px">
        ${contact.contact ? `👤 ${esc(contact.contact)}` : ''}
        ${contact.email ? `· 📧 ${esc(contact.email)}` : ''}
        ${contact.tel ? `· 📞 ${esc(contact.tel)}` : ''}
      </div>
      <table>
        <tr><th>Réf</th><th>Désignation</th><th>Qté</th><th>PU Achat</th><th>PT Achat</th></tr>
        ${lines.map(l => `<tr>
          <td>${esc(l.ref)}</td><td>${esc(l.designation)}</td><td style="text-align:center">${l.qty}</td>
          <td style="text-align:right">${numFmt(l.pu_achat)}</td><td style="text-align:right">${numFmt(l.qty * l.pu_achat)}</td>
        </tr>`).join('')}
      </table>
    `
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8">${baseStyle}</head><body>
    <div class="header">
      <h2>📦 Demande de commande — ${esc(data.dealTitle)}</h2>
      <div class="sub">Client : ${esc(data.accountName)} · BC : ${esc(data.poNumber)} · ${new Date().toLocaleDateString('fr-MA')}</div>
    </div>
    <div class="body">
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px">
        <div><span style="color:#64748b;font-size:11px">MONTANT DEAL</span><br><strong>${numFmt(data.amount)} MAD</strong></div>
        <div><span style="color:#64748b;font-size:11px">MODALITÉS PAIEMENT</span><br><strong>${esc(data.paymentTerms) || '—'}</strong></div>
        <div><span style="color:#64748b;font-size:11px">TOTAL ACHAT</span><br><strong>${numFmt(totalAchat)} MAD</strong></div>
      </div>
      ${suppliersHtml}
      ${data.frais ? `<div style="margin-top:12px;font-size:13px">💰 Frais d'engagement : <strong>${numFmt(data.frais)} MAD</strong></div>` : ''}
      ${data.notes ? `<div style="margin-top:8px;font-size:13px;color:#78350f;background:#fef3c7;padding:8px 12px;border-radius:8px">📝 ${esc(data.notes)}</div>` : ''}
      <div class="footer">Envoyé depuis CRM-PIPE par ${esc(data.senderName)}</div>
    </div>
  </body></html>`
}

// ─── Kader project email ─────────────────────────────────────────────────────

type KaderEmailData = {
  type: 'prescription' | 'deployment'
  dealTitle: string
  accountName: string
  amount: number
  bus: string[]
  presalesAssigned?: string
  services?: Array<{ title: string; assignedTo: string; status: string }>
  deliveryLines?: Array<{ designation: string; status: string; eta?: string }>
  notes?: string
  senderName: string
}

export function buildKaderEmail(data: KaderEmailData): string {
  const numFmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const isPrescription = data.type === 'prescription'

  let contentHtml = ''
  if (isPrescription) {
    contentHtml = `
      <p>Un nouveau dossier nécessite une <strong>qualification technique / prescription</strong> :</p>
      <table>
        <tr><td style="color:#64748b;width:140px">Deal</td><td><strong>${esc(data.dealTitle)}</strong></td></tr>
        <tr><td style="color:#64748b">Client</td><td>${esc(data.accountName)}</td></tr>
        <tr><td style="color:#64748b">Montant</td><td>${numFmt(data.amount)} MAD</td></tr>
        <tr><td style="color:#64748b">BU concernées</td><td>${data.bus.map(b => `<span class="badge badge-blue">${esc(b)}</span>`).join(' ')}</td></tr>
        ${data.presalesAssigned ? `<tr><td style="color:#64748b">Presales assigné</td><td>${esc(data.presalesAssigned)}</td></tr>` : ''}
      </table>
      ${data.notes ? `<div style="margin-top:12px;font-size:13px;color:#78350f;background:#fef3c7;padding:8px 12px;border-radius:8px">📝 ${esc(data.notes)}</div>` : ''}
    `
  } else {
    contentHtml = `
      <p>Voici le point d'avancement du projet <strong>${esc(data.dealTitle)}</strong> (${esc(data.accountName)}) :</p>
      ${data.deliveryLines?.length ? `
        <div class="section-title">📦 Lignes matériel</div>
        <table>
          <tr><th>Désignation</th><th>Statut</th><th>ETA</th></tr>
          ${data.deliveryLines.map(l => `<tr>
            <td>${esc(l.designation)}</td>
            <td><span class="badge badge-blue">${esc(l.status)}</span></td>
            <td>${l.eta || '—'}</td>
          </tr>`).join('')}
        </table>
      ` : ''}
      ${data.services?.length ? `
        <div class="section-title">🔧 Prestations</div>
        <table>
          <tr><th>Prestation</th><th>Ingénieur</th><th>Statut</th></tr>
          ${data.services.map(s => `<tr>
            <td>${esc(s.title)}</td>
            <td>${esc(s.assignedTo)}</td>
            <td><span class="badge badge-blue">${esc(s.status)}</span></td>
          </tr>`).join('')}
        </table>
      ` : ''}
      ${data.notes ? `<div style="margin-top:12px;font-size:13px;color:#78350f;background:#fef3c7;padding:8px 12px;border-radius:8px">📝 ${esc(data.notes)}</div>` : ''}
    `
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8">${baseStyle}</head><body>
    <div class="header">
      <h2>${isPrescription ? '🎯 Demande de prescription' : '🏗️ Suivi projet'} — ${esc(data.dealTitle)}</h2>
      <div class="sub">${esc(data.accountName)} · ${numFmt(data.amount)} MAD · ${new Date().toLocaleDateString('fr-MA')}</div>
    </div>
    <div class="body">
      ${contentHtml}
      <div class="footer">Envoyé depuis CRM-PIPE par ${esc(data.senderName)}</div>
    </div>
  </body></html>`
}

// ─── Invoice reminder email ──────────────────────────────────────────────────

type InvoiceEmailData = {
  invoiceNumber: string
  dealTitle: string
  accountName: string
  amount: number
  issueDate: string
  dueDate: string
  paymentTerms: string
  daysOverdue: number
  senderName: string
}

export function buildInvoiceReminderEmail(data: InvoiceEmailData): string {
  const numFmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return `<!DOCTYPE html><html><head><meta charset="utf-8">${baseStyle}</head><body>
    <div class="header">
      <h2>🔔 Relance facture — ${esc(data.invoiceNumber)}</h2>
      <div class="sub">${esc(data.accountName)} · ${new Date().toLocaleDateString('fr-MA')}</div>
    </div>
    <div class="body">
      <p>La facture ci-dessous est <strong style="color:#dc2626">échue depuis ${data.daysOverdue} jour(s)</strong> :</p>
      <table>
        <tr><td style="color:#64748b;width:160px">N° Facture</td><td><strong>${esc(data.invoiceNumber)}</strong></td></tr>
        <tr><td style="color:#64748b">Deal</td><td>${esc(data.dealTitle)}</td></tr>
        <tr><td style="color:#64748b">Client</td><td>${esc(data.accountName)}</td></tr>
        <tr><td style="color:#64748b">Montant</td><td><strong>${numFmt(data.amount)} MAD</strong></td></tr>
        <tr><td style="color:#64748b">Date émission</td><td>${esc(data.issueDate)}</td></tr>
        <tr><td style="color:#64748b">Date échéance</td><td><span style="color:#dc2626;font-weight:600">${esc(data.dueDate)}</span></td></tr>
        <tr><td style="color:#64748b">Modalités</td><td>${esc(data.paymentTerms)}</td></tr>
      </table>
      <p>Merci de relancer le client pour le règlement de cette facture.</p>
      <div class="footer">Envoyé depuis CRM-PIPE par ${esc(data.senderName)}</div>
    </div>
  </body></html>`
}

// ─── Expense report email (Hanane) ───────────────────────────────────────────

type ExpenseEmailData = {
  month: number; year: number
  lines: Array<{ date: string; description: string; amount: number }>
  total: number
  senderName: string
}

export function buildExpenseEmail(data: ExpenseEmailData): string {
  const numFmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const monthNames = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

  return `<!DOCTYPE html><html><head><meta charset="utf-8">${baseStyle}</head><body>
    <div class="header">
      <h2>💰 Note de frais — ${monthNames[data.month - 1]} ${data.year}</h2>
      <div class="sub">${esc(data.senderName)} · ${new Date().toLocaleDateString('fr-MA')}</div>
    </div>
    <div class="body">
      <table>
        <tr><th>Date</th><th>Détail dépense</th><th style="text-align:right">Montant TTC</th></tr>
        ${data.lines.map(l => `<tr>
          <td>${esc(l.date)}</td>
          <td>${esc(l.description)}</td>
          <td style="text-align:right">${numFmt(l.amount)} MAD</td>
        </tr>`).join('')}
        <tr class="total-row">
          <td colspan="2" style="text-align:right">TOTAL</td>
          <td style="text-align:right">${numFmt(data.total)} MAD</td>
        </tr>
      </table>
      <p style="font-size:13px;color:#64748b">Les pièces justificatives sont jointes à cette note.</p>
      <div class="footer">Envoyé depuis CRM-PIPE par ${esc(data.senderName)}</div>
    </div>
  </body></html>`
}

// ─── Support ticket email (Mernassi) ─────────────────────────────────────────

type SupportEmailData = {
  ticketTitle: string
  dealTitle: string
  accountName: string
  type: string
  priority: string
  description: string
  senderName: string
}

export function buildSupportEmail(data: SupportEmailData): string {
  const prioColor = data.priority === 'urgent' ? 'badge-red' : data.priority === 'haute' ? 'badge-amber' : 'badge-blue'

  return `<!DOCTYPE html><html><head><meta charset="utf-8">${baseStyle}</head><body>
    <div class="header">
      <h2>🛡️ Ticket Support — ${esc(data.ticketTitle)}</h2>
      <div class="sub">${esc(data.accountName)} · ${new Date().toLocaleDateString('fr-MA')}</div>
    </div>
    <div class="body">
      <table>
        <tr><td style="color:#64748b;width:140px">Ticket</td><td><strong>${esc(data.ticketTitle)}</strong></td></tr>
        <tr><td style="color:#64748b">Deal</td><td>${esc(data.dealTitle)}</td></tr>
        <tr><td style="color:#64748b">Client</td><td>${esc(data.accountName)}</td></tr>
        <tr><td style="color:#64748b">Type</td><td><span class="badge badge-blue">${esc(data.type)}</span></td></tr>
        <tr><td style="color:#64748b">Priorité</td><td><span class="badge ${prioColor}">${esc(data.priority)}</span></td></tr>
      </table>
      ${data.description ? `<div style="margin-top:16px"><div class="section-title">Description</div><p style="font-size:13px">${esc(data.description)}</p></div>` : ''}
      <div class="footer">Envoyé depuis CRM-PIPE par ${esc(data.senderName)}</div>
    </div>
  </body></html>`
}
