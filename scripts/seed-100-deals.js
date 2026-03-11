/**
 * SEED SCRIPT — 100 TEST DEALS for AFMA
 * Each deal tests a different scenario across the full CRM workflow.
 *
 * Distribution:
 *  - Deals 1-8:   Lead stage (Open)
 *  - Deals 9-16:  Discovery stage (Open)
 *  - Deals 17-24: Qualified stage (Open)
 *  - Deals 25-30: Solutioning stage (Open)
 *  - Deals 31-36: Proposal Sent stage (Open)
 *  - Deals 37-42: Negotiation stage (Open)
 *  - Deals 43-48: Commit stage (Open)
 *  - Deals 49-70: Won + supply workflow (various supply stages)
 *  - Deals 71-85: Won + invoices (various invoice statuses)
 *  - Deals 86-92: Lost / No decision
 *  - Deals 93-100: Edge cases (multi-BU, DR, warranties, licenses, 0 amount, etc.)
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://cnrpaedvqjvepwtypbmw.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucnBhZWR2cWp2ZXB3dHlwYm13Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzYxODYyOCwiZXhwIjoyMDgzMTk0NjI4fQ.VV5Kcnsx6FrGLi2dWiCSvnbxQlbkTdVcWqS_dcTYS8g';

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const AFMA_ID = 'ee4966d5-6e31-41a0-9b45-753f9d69ff87';
const NABIL_EMAIL = 'nabil.imdh@gmail.com';
const SALIM_EMAIL = 's.chitachny@compucom.ma';

const SUPPLIERS = [
  { id: 'a833d571-7988-4991-b676-722acff9e341', name: 'Arrow Electronics', contact: 'Jean Dupont', email: 'jean@arrow.com', tel: '+212600000001' },
  { id: '8baecdc3-e163-414d-ad50-471f497d119a', name: 'V-Valley Africa', contact: 'Ahmed Tazi', email: 'ahmed@vvalley.com', tel: '+212600000002' },
  { id: '68be3f62-d808-4a3e-872f-c6c5a8f411f2', name: 'Exclusive Networks', contact: 'Sara Idrissi', email: 'sara@exclusive.com', tel: '+212600000003' },
];

const VENDORS = ['Dell', 'HPE', 'Cisco', 'Fortinet', 'Lenovo', 'Palo Alto', 'Juniper', 'Aruba', 'VMware', 'Microsoft'];
const BUS = ['CSG', 'HCI', 'Network', 'Cyber', 'Storage', 'Service'];
const PAYMENT_TERMS = ['a_la_livraison', '30j', '60j', '90j'];

function randomBetween(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function uuid() { return crypto.randomUUID(); }

function bookingMonth(yearOffset = 0, monthOffset = 0) {
  const d = new Date();
  d.setFullYear(d.getFullYear() + yearOffset);
  d.setMonth(d.getMonth() + monthOffset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function dateStr(daysOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split('T')[0];
}

function isoNow(daysOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString();
}

// ── Build the 100 deals ──────────────────────────────────────────────────────

function buildDeals() {
  const deals = [];
  let n = 0;

  // Default next_step by stage
  const NEXT_STEP_DEFAULTS = {
    'Lead': 'Premier contact',
    'Discovery': 'Qualification besoin',
    'Qualified': 'Préparation offre',
    'Solutioning': 'Design technique',
    'Proposal Sent': 'Relance offre',
    'Negotiation': 'Négociation finale',
    'Commit': 'Attente BC',
    'Won': 'Suivi livraison',
    'Lost / No decision': 'Archivé',
  };

  // Helper to create a deal
  function deal(title, stage, status, opts = {}) {
    n++;
    const amount = opts.amount ?? randomBetween(50000, 2000000);
    const prob = opts.prob ?? (stage === 'Won' ? 100 : stage === 'Lost / No decision' ? 0 : randomBetween(10, 90));
    // next_step is REQUIRED by DB constraint
    const nextStep = opts.next_step !== undefined ? (opts.next_step || NEXT_STEP_DEFAULTS[stage] || 'À définir') : NEXT_STEP_DEFAULTS[stage] || 'À définir';
    return {
      num: n,
      opp: {
        account_id: AFMA_ID,
        title: `TEST-${String(n).padStart(3, '0')} ${title}`,
        bu: opts.bu || randomFrom(BUS),
        stage,
        status,
        amount,
        prob,
        vendor: opts.vendor || randomFrom(VENDORS),
        owner_email: opts.owner || (n % 3 === 0 ? SALIM_EMAIL : NABIL_EMAIL),
        booking_month: opts.booking_month || bookingMonth(0, randomBetween(-2, 6)),
        notes: opts.notes || `Deal test #${n} — ${title}`,
        next_step: nextStep,
        next_step_due: opts.next_step_due || dateStr(randomBetween(1, 30)),
        multi_bu: opts.multi_bu || false,
        bu_lines: opts.bu_lines || null,
        po_number: opts.po_number || null,
        po_date: opts.po_date || null,
        margin_pct: opts.margin_pct ?? randomBetween(8, 35),
      },
      purchase: opts.purchase || null,
      supply: opts.supply || null,
      invoice: opts.invoice || null,
      dr: opts.dr || null,
      files: opts.files || null,
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 1-8: LEAD STAGE (Open)
  // ════════════════════════════════════════════════════════════════════════════
  deals.push(deal('Lead basic CSG', 'Lead', 'Open', { bu: 'CSG', vendor: 'Dell', next_step: 'Appel découverte', next_step_due: dateStr(3) }));
  deals.push(deal('Lead HCI sans montant', 'Lead', 'Open', { bu: 'HCI', amount: 0, prob: 5 }));
  deals.push(deal('Lead Network gros montant', 'Lead', 'Open', { bu: 'Network', amount: 5000000, vendor: 'Cisco' }));
  deals.push(deal('Lead Cyber cold', 'Lead', 'Open', { bu: 'Cyber', vendor: 'Fortinet', prob: 5 }));
  deals.push(deal('Lead Storage Salim', 'Lead', 'Open', { bu: 'Storage', owner: SALIM_EMAIL, vendor: 'HPE' }));
  deals.push(deal('Lead Service presta', 'Lead', 'Open', { bu: 'Service', vendor: 'VMware', amount: 80000 }));
  deals.push(deal('Lead sans next_step', 'Lead', 'Open', { bu: 'CSG', next_step: null }));
  deals.push(deal('Lead booking lointain', 'Lead', 'Open', { bu: 'Network', booking_month: bookingMonth(0, 11) }));

  // ════════════════════════════════════════════════════════════════════════════
  // 9-16: DISCOVERY STAGE
  // ════════════════════════════════════════════════════════════════════════════
  deals.push(deal('Discovery RDV planifié', 'Discovery', 'Open', { next_step: 'RDV technique', next_step_due: dateStr(5) }));
  deals.push(deal('Discovery relance urgente', 'Discovery', 'Open', { next_step: 'Relance client', next_step_due: dateStr(-3) }));
  deals.push(deal('Discovery Cisco Network', 'Discovery', 'Open', { bu: 'Network', vendor: 'Cisco', amount: 350000 }));
  deals.push(deal('Discovery Fortinet Cyber', 'Discovery', 'Open', { bu: 'Cyber', vendor: 'Fortinet', prob: 25 }));
  deals.push(deal('Discovery gros deal Lenovo', 'Discovery', 'Open', { bu: 'CSG', vendor: 'Lenovo', amount: 3000000 }));
  deals.push(deal('Discovery marge faible', 'Discovery', 'Open', { margin_pct: 3 }));
  deals.push(deal('Discovery Salim HPE', 'Discovery', 'Open', { owner: SALIM_EMAIL, vendor: 'HPE', bu: 'HCI' }));
  deals.push(deal('Discovery multi-vendeur', 'Discovery', 'Open', { vendor: 'Dell', notes: 'Potentiel multi-vendeur Dell+Cisco' }));

  // ════════════════════════════════════════════════════════════════════════════
  // 17-24: QUALIFIED
  // ════════════════════════════════════════════════════════════════════════════
  deals.push(deal('Qualifié standard', 'Qualified', 'Open', { prob: 40 }));
  deals.push(deal('Qualifié budget confirmé', 'Qualified', 'Open', { prob: 50, next_step: 'Envoi offre technique' }));
  deals.push(deal('Qualifié marché public', 'Qualified', 'Open', { notes: 'Marché public - procédure AO', amount: 1500000 }));
  deals.push(deal('Qualifié Palo Alto firewall', 'Qualified', 'Open', { bu: 'Cyber', vendor: 'Palo Alto', amount: 800000 }));
  deals.push(deal('Qualifié Aruba réseau campus', 'Qualified', 'Open', { bu: 'Network', vendor: 'Aruba', amount: 600000 }));
  deals.push(deal('Qualifié VMware datacenter', 'Qualified', 'Open', { bu: 'HCI', vendor: 'VMware', amount: 450000 }));
  deals.push(deal('Qualifié proba haute', 'Qualified', 'Open', { prob: 70 }));
  deals.push(deal('Qualifié Salim Storage', 'Qualified', 'Open', { owner: SALIM_EMAIL, bu: 'Storage', vendor: 'HPE' }));

  // ════════════════════════════════════════════════════════════════════════════
  // 25-30: SOLUTIONING
  // ════════════════════════════════════════════════════════════════════════════
  deals.push(deal('Solutioning POC en cours', 'Solutioning', 'Open', { next_step: 'POC lab', prob: 50 }));
  deals.push(deal('Solutioning presales Kader', 'Solutioning', 'Open', { notes: 'Presales assigné: Kader', bu: 'HCI' }));
  deals.push(deal('Solutioning design réseau', 'Solutioning', 'Open', { bu: 'Network', vendor: 'Cisco', amount: 900000 }));
  deals.push(deal('Solutioning Cyber assessment', 'Solutioning', 'Open', { bu: 'Cyber', vendor: 'Fortinet' }));
  deals.push(deal('Solutioning Dell servers', 'Solutioning', 'Open', { bu: 'HCI', vendor: 'Dell', amount: 1200000 }));
  deals.push(deal('Solutioning Service formation', 'Solutioning', 'Open', { bu: 'Service', amount: 120000 }));

  // ════════════════════════════════════════════════════════════════════════════
  // 31-36: PROPOSAL SENT
  // ════════════════════════════════════════════════════════════════════════════
  deals.push(deal('Offre envoyée Dell laptops', 'Proposal Sent', 'Open', { bu: 'CSG', vendor: 'Dell', prob: 60 }));
  deals.push(deal('Offre envoyée Cisco switches', 'Proposal Sent', 'Open', { bu: 'Network', vendor: 'Cisco', prob: 55 }));
  deals.push(deal('Offre envoyée HPE stockage', 'Proposal Sent', 'Open', { bu: 'Storage', vendor: 'HPE', amount: 700000 }));
  deals.push(deal('Offre envoyée relance nécessaire', 'Proposal Sent', 'Open', { next_step: 'Relance offre', next_step_due: dateStr(-5) }));
  deals.push(deal('Offre envoyée gros montant', 'Proposal Sent', 'Open', { amount: 4000000, prob: 45 }));
  deals.push(deal('Offre envoyée marge excellente', 'Proposal Sent', 'Open', { margin_pct: 28, amount: 250000 }));

  // ════════════════════════════════════════════════════════════════════════════
  // 37-42: NEGOTIATION
  // ════════════════════════════════════════════════════════════════════════════
  deals.push(deal('Négociation prix final', 'Negotiation', 'Open', { prob: 70, next_step: 'Négo prix final' }));
  deals.push(deal('Négociation remise demandée', 'Negotiation', 'Open', { prob: 65, notes: 'Client demande 15% remise' }));
  deals.push(deal('Négociation conditions paiement', 'Negotiation', 'Open', { prob: 75, notes: 'Discussion 90j vs 60j' }));
  deals.push(deal('Négociation concurrence Oracle', 'Negotiation', 'Open', { prob: 50, notes: 'Concurrent: Oracle' }));
  deals.push(deal('Négociation Lenovo serveurs', 'Negotiation', 'Open', { bu: 'HCI', vendor: 'Lenovo', prob: 60 }));
  deals.push(deal('Négociation close ce mois', 'Negotiation', 'Open', { prob: 80, booking_month: bookingMonth(0, 0) }));

  // ════════════════════════════════════════════════════════════════════════════
  // 43-48: COMMIT
  // ════════════════════════════════════════════════════════════════════════════
  deals.push(deal('Commit BC attendu', 'Commit', 'Open', { prob: 90, next_step: 'Attente BC client' }));
  deals.push(deal('Commit signature imminente', 'Commit', 'Open', { prob: 95, booking_month: bookingMonth(0, 0) }));
  deals.push(deal('Commit Dell gros volume', 'Commit', 'Open', { bu: 'CSG', vendor: 'Dell', amount: 2500000, prob: 90 }));
  deals.push(deal('Commit Fortinet renewal', 'Commit', 'Open', { bu: 'Cyber', vendor: 'Fortinet', prob: 85 }));
  deals.push(deal('Commit Cisco campus', 'Commit', 'Open', { bu: 'Network', vendor: 'Cisco', amount: 1800000, prob: 92 }));
  deals.push(deal('Commit HPE + Service', 'Commit', 'Open', { bu: 'HCI', vendor: 'HPE', prob: 88 }));

  // ════════════════════════════════════════════════════════════════════════════
  // 49-70: WON + Supply workflow variations
  // ════════════════════════════════════════════════════════════════════════════
  const supplyStages = [
    // 49-52: a_commander (just won, not placed yet)
    { supply: 'a_commander', title: 'Won supply à commander', po: 'PO-TEST-049' },
    { supply: 'a_commander', title: 'Won à commander Dell laptops', po: 'PO-TEST-050', bu: 'CSG', vendor: 'Dell' },
    { supply: 'a_commander', title: 'Won à commander Cisco', po: 'PO-TEST-051', bu: 'Network', vendor: 'Cisco' },
    { supply: 'a_commander', title: 'Won à commander multi-ligne', po: 'PO-TEST-052', multiLine: true },

    // 53-56: placé
    { supply: 'place', title: 'Won supply placé', po: 'PO-TEST-053' },
    { supply: 'place', title: 'Won placé HPE serveur', po: 'PO-TEST-054', bu: 'HCI', vendor: 'HPE' },
    { supply: 'place', title: 'Won placé avec ETA', po: 'PO-TEST-055', withEta: true },
    { supply: 'place', title: 'Won placé multi-fournisseur', po: 'PO-TEST-056', multiSupplier: true },

    // 57-60: commandé
    { supply: 'commande', title: 'Won commandé fournisseur', po: 'PO-TEST-057' },
    { supply: 'commande', title: 'Won commandé sous-douane', po: 'PO-TEST-058', lineStatus: 'sous_douane' },
    { supply: 'commande', title: 'Won commandé Fortinet', po: 'PO-TEST-059', bu: 'Cyber', vendor: 'Fortinet' },
    { supply: 'commande', title: 'Won commandé en retard', po: 'PO-TEST-060', etaRetard: true },

    // 61-64: en_stock
    { supply: 'en_stock', title: 'Won en stock prêt livraison', po: 'PO-TEST-061' },
    { supply: 'en_stock', title: 'Won en stock partiel', po: 'PO-TEST-062', partialStock: true },
    { supply: 'en_stock', title: 'Won en stock Dell monitors', po: 'PO-TEST-063', bu: 'CSG', vendor: 'Dell' },
    { supply: 'en_stock', title: 'Won en stock + garantie', po: 'PO-TEST-064', withWarranty: true },

    // 65-68: livré
    { supply: 'livre', title: 'Won livré client', po: 'PO-TEST-065' },
    { supply: 'livre', title: 'Won livré + licence', po: 'PO-TEST-066', withLicense: true },
    { supply: 'livre', title: 'Won livré Palo Alto', po: 'PO-TEST-067', bu: 'Cyber', vendor: 'Palo Alto' },
    { supply: 'livre', title: 'Won livré garantie 36m', po: 'PO-TEST-068', warranty36: true },

    // 69-70: facturé (supply complete)
    { supply: 'facture', title: 'Won facturé complet', po: 'PO-TEST-069' },
    { supply: 'facture', title: 'Won facturé Juniper réseau', po: 'PO-TEST-070', bu: 'Network', vendor: 'Juniper' },
  ];

  for (const s of supplyStages) {
    const sup = randomFrom(SUPPLIERS);
    const amount = randomBetween(100000, 3000000);
    const margin = randomBetween(10, 30);
    const lines = [];
    const numLines = s.multiLine ? 5 : s.multiSupplier ? 3 : s.partialStock ? 4 : randomBetween(1, 3);

    for (let i = 0; i < numLines; i++) {
      const qty = randomBetween(1, 50);
      const puVente = randomBetween(5000, 100000);
      const puAchat = Math.round(puVente * (1 - margin / 100));
      const selectedSup = s.multiSupplier ? SUPPLIERS[i % SUPPLIERS.length] : sup;
      const lineStatus = s.lineStatus ? s.lineStatus :
        s.partialStock && i < 2 ? 'en_stock' :
        s.partialStock && i >= 2 ? 'commande' :
        s.supply === 'a_commander' ? 'pending' :
        s.supply === 'place' || s.supply === 'commande' ? 'commande' :
        s.supply === 'en_stock' ? 'en_stock' :
        'livre';

      lines.push({
        ref: `REF-${String(n + 1).padStart(3, '0')}-L${i + 1}`,
        designation: `Produit test ${s.title.split(' ').slice(-2).join(' ')} L${i + 1}`,
        qty, pu_vente: puVente, pt_vente: qty * puVente, pu_achat: puAchat,
        fournisseur: selectedSup.name,
        fournisseur_id: selectedSup.id,
        contact_fournisseur: selectedSup.contact,
        email_fournisseur: selectedSup.email,
        tel_fournisseur: selectedSup.tel,
        sort_order: i,
        line_status: lineStatus,
        eta: s.withEta || s.etaRetard ? dateStr(s.etaRetard ? -10 : 14) : null,
        warranty_months: s.withWarranty ? 24 : s.warranty36 ? 36 : (i === 0 ? 12 : null),
        license_months: s.withLicense ? 36 : null,
      });
    }

    deals.push(deal(s.title, 'Won', 'Won', {
      bu: s.bu || randomFrom(BUS),
      vendor: s.vendor || randomFrom(VENDORS),
      amount, margin_pct: margin, prob: 100,
      po_number: s.po,
      po_date: dateStr(randomBetween(-90, -5)),
      booking_month: bookingMonth(0, randomBetween(-3, 0)),
      purchase: {
        frais_engagement: randomBetween(0, 5000),
        payment_terms: randomFrom(PAYMENT_TERMS),
        notes: `Commande test #${n + 1}`,
        lines,
      },
      supply: {
        status: s.supply,
        supply_notes: `Supply test — statut ${s.supply}`,
        placed_at: ['place', 'commande', 'en_stock', 'livre', 'facture'].includes(s.supply) ? isoNow(-60) : null,
        ordered_at: ['commande', 'en_stock', 'livre', 'facture'].includes(s.supply) ? isoNow(-45) : null,
        received_at: ['en_stock', 'livre', 'facture'].includes(s.supply) ? isoNow(-20) : null,
        delivered_at: ['livre', 'facture'].includes(s.supply) ? isoNow(-10) : null,
        invoiced_at: s.supply === 'facture' ? isoNow(-3) : null,
      },
    }));
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 71-85: WON + Invoices at various statuses
  // ════════════════════════════════════════════════════════════════════════════
  const invoiceScenarios = [
    { title: 'Won facture émise', invStatus: 'emise', dueOffset: 30 },
    { title: 'Won facture émise Dell', invStatus: 'emise', dueOffset: 60, bu: 'CSG', vendor: 'Dell' },
    { title: 'Won facture émise 90j', invStatus: 'emise', dueOffset: 90, payTerms: '90j' },
    { title: 'Won facture échue 10j', invStatus: 'echue', dueOffset: -10 },
    { title: 'Won facture échue 30j', invStatus: 'echue', dueOffset: -30 },
    { title: 'Won facture échue critique', invStatus: 'echue', dueOffset: -60, amount: 2500000 },
    { title: 'Won facture relancée 1x', invStatus: 'relancee', dueOffset: -20 },
    { title: 'Won facture relancée 2x', invStatus: 'relancee', dueOffset: -45, notes: 'Relancée 2 fois' },
    { title: 'Won facture relancée Cisco', invStatus: 'relancee', dueOffset: -15, bu: 'Network', vendor: 'Cisco' },
    { title: 'Won facture payée', invStatus: 'payee', dueOffset: -5 },
    { title: 'Won facture payée Dell', invStatus: 'payee', dueOffset: -10, bu: 'CSG', vendor: 'Dell' },
    { title: 'Won facture payée gros', invStatus: 'payee', dueOffset: -20, amount: 4000000 },
    { title: 'Won double facture', invStatus: 'emise', dueOffset: 30, doubleFact: true },
    { title: 'Won facture + supply livre', invStatus: 'emise', dueOffset: 45, withSupply: true },
    { title: 'Won facture payée rapide', invStatus: 'payee', dueOffset: 0, payTerms: 'a_la_livraison' },
  ];

  for (const inv of invoiceScenarios) {
    const amount = inv.amount || randomBetween(200000, 2000000);
    const sup = randomFrom(SUPPLIERS);
    const lines = [{
      ref: `REF-${String(n + 1).padStart(3, '0')}-L1`,
      designation: `Produit facture test ${inv.title.split(' ').slice(-2).join(' ')}`,
      qty: randomBetween(1, 20), pu_vente: Math.round(amount / 5),
      pt_vente: amount, pu_achat: Math.round(amount * 0.8 / 5),
      fournisseur: sup.name, fournisseur_id: sup.id,
      contact_fournisseur: sup.contact, email_fournisseur: sup.email, tel_fournisseur: sup.tel,
      sort_order: 0, line_status: 'livre', eta: null,
      warranty_months: 12, license_months: null,
    }];

    deals.push(deal(inv.title, 'Won', 'Won', {
      bu: inv.bu || randomFrom(BUS),
      vendor: inv.vendor || randomFrom(VENDORS),
      amount, margin_pct: randomBetween(10, 25), prob: 100,
      po_number: `PO-TEST-${String(n + 1).padStart(3, '0')}`,
      po_date: dateStr(-90),
      booking_month: bookingMonth(0, randomBetween(-3, -1)),
      purchase: {
        frais_engagement: randomBetween(0, 3000),
        payment_terms: inv.payTerms || '30j',
        notes: `Facture test — ${inv.invStatus}`,
        lines,
      },
      supply: inv.withSupply ? {
        status: 'livre',
        placed_at: isoNow(-80), ordered_at: isoNow(-70),
        received_at: isoNow(-30), delivered_at: isoNow(-15), invoiced_at: null,
      } : {
        status: 'facture',
        placed_at: isoNow(-80), ordered_at: isoNow(-70),
        received_at: isoNow(-30), delivered_at: isoNow(-15), invoiced_at: isoNow(-5),
      },
      invoice: {
        invoice_number: `FAC-TEST-${String(n + 1).padStart(3, '0')}`,
        amount,
        issue_date: dateStr(-30),
        due_date: dateStr(inv.dueOffset),
        status: inv.invStatus,
        payment_terms: inv.payTerms || '30j',
        notes: inv.notes || null,
        doubleFact: inv.doubleFact || false,
      },
    }));
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 86-92: LOST / NO DECISION
  // ════════════════════════════════════════════════════════════════════════════
  deals.push(deal('Lost prix trop élevé', 'Lost / No decision', 'Lost', { prob: 0, notes: 'Perdu: prix trop élevé vs concurrent' }));
  deals.push(deal('Lost budget annulé', 'Lost / No decision', 'Lost', { prob: 0, notes: 'Client a annulé le budget' }));
  deals.push(deal('Lost concurrent Oracle', 'Lost / No decision', 'Lost', { prob: 0, notes: 'Perdu face à Oracle' }));
  deals.push(deal('Lost no decision gelé', 'Lost / No decision', 'Lost', { prob: 0, notes: 'Projet gelé indéfiniment' }));
  deals.push(deal('Lost délai trop long', 'Lost / No decision', 'Lost', { prob: 0, notes: 'Perdu: délais livraison non respectés' }));
  deals.push(deal('Lost technique inadapté', 'Lost / No decision', 'Lost', { prob: 0, notes: 'Solution technique ne correspond pas' }));
  deals.push(deal('Lost changement direction', 'Lost / No decision', 'Lost', { prob: 0, notes: 'Changement de direction chez client' }));

  // ════════════════════════════════════════════════════════════════════════════
  // 93-100: EDGE CASES
  // ════════════════════════════════════════════════════════════════════════════

  // 93: Multi-BU deal
  deals.push(deal('Multi-BU CSG+Cyber+Network', 'Negotiation', 'Open', {
    multi_bu: true,
    bu: 'CSG',
    bu_lines: [
      { bu: 'CSG', card: 'Dell Laptops', amount: 500000 },
      { bu: 'Cyber', card: 'Fortinet Firewall', amount: 300000 },
      { bu: 'Network', card: 'Cisco Switches', amount: 200000 },
    ],
    amount: 1000000,
    prob: 65,
  }));

  // 94: Won multi-BU with DR
  deals.push(deal('Won Multi-BU + DR Dell+Cisco', 'Won', 'Won', {
    multi_bu: true,
    bu: 'HCI',
    bu_lines: [
      { bu: 'HCI', card: 'Dell Servers', amount: 800000 },
      { bu: 'Network', card: 'Cisco Catalyst', amount: 400000 },
    ],
    amount: 1200000, prob: 100,
    po_number: 'PO-TEST-094', po_date: dateStr(-30),
    dr: [
      { bu: 'HCI', card: 'Dell Servers', platform: 'Dell Partner Portal', dr_number: 'DR-DELL-2026-001', expiry_date: dateStr(60) },
      { bu: 'Network', card: 'Cisco Catalyst', platform: 'Cisco CCW', dr_number: 'DR-CISCO-2026-001', expiry_date: dateStr(15) },
    ],
    purchase: {
      frais_engagement: 2000, payment_terms: '60j', notes: 'Multi-BU DR test',
      lines: [
        { ref: 'REF-094-L1', designation: 'Dell PowerEdge R760', qty: 4, pu_vente: 200000, pt_vente: 800000, pu_achat: 160000, fournisseur: 'Arrow Electronics', sort_order: 0, line_status: 'livre', warranty_months: 36, license_months: null },
        { ref: 'REF-094-L2', designation: 'Cisco Catalyst 9300', qty: 10, pu_vente: 40000, pt_vente: 400000, pu_achat: 32000, fournisseur: 'V-Valley Africa', sort_order: 1, line_status: 'livre', warranty_months: 12, license_months: 36 },
      ],
    },
    supply: { status: 'livre', placed_at: isoNow(-25), ordered_at: isoNow(-20), received_at: isoNow(-10), delivered_at: isoNow(-5) },
  }));

  // 95: Won with warranty expiring soon (< 30j)
  deals.push(deal('Won garantie expire bientôt', 'Won', 'Won', {
    bu: 'HCI', vendor: 'HPE', amount: 600000, prob: 100,
    po_number: 'PO-TEST-095', po_date: dateStr(-350),
    purchase: {
      frais_engagement: 1000, payment_terms: '30j', notes: 'Garantie expire dans 15j',
      lines: [{ ref: 'REF-095-L1', designation: 'HPE ProLiant DL380', qty: 2, pu_vente: 300000, pt_vente: 600000, pu_achat: 240000, fournisseur: 'Arrow Electronics', sort_order: 0, line_status: 'livre', warranty_months: 12, license_months: null }],
    },
    supply: { status: 'facture', placed_at: isoNow(-340), ordered_at: isoNow(-330), received_at: isoNow(-320), delivered_at: isoNow(-310), invoiced_at: isoNow(-300) },
  }));

  // 96: Won with license expiring soon
  deals.push(deal('Won licence expire bientôt', 'Won', 'Won', {
    bu: 'Cyber', vendor: 'Fortinet', amount: 400000, prob: 100,
    po_number: 'PO-TEST-096', po_date: dateStr(-330),
    purchase: {
      frais_engagement: 500, payment_terms: 'a_la_livraison', notes: 'Licence FortiGate expire dans 35j',
      lines: [{ ref: 'REF-096-L1', designation: 'FortiGate 100F + FortiCare', qty: 1, pu_vente: 400000, pt_vente: 400000, pu_achat: 320000, fournisseur: 'Exclusive Networks', sort_order: 0, line_status: 'livre', warranty_months: 12, license_months: 12 }],
    },
    supply: { status: 'facture', placed_at: isoNow(-320), ordered_at: isoNow(-310), received_at: isoNow(-300), delivered_at: isoNow(-290), invoiced_at: isoNow(-280) },
  }));

  // 97: Deal with 0 amount (data quality test)
  deals.push(deal('Won montant zéro erreur', 'Won', 'Won', {
    amount: 0, prob: 100, po_number: 'PO-TEST-097', po_date: dateStr(-10),
    notes: 'Deal test montant zéro — alerte qualité données',
    purchase: {
      frais_engagement: 0, payment_terms: '30j', notes: 'Montant zéro test',
      lines: [{ ref: 'REF-097-L1', designation: 'Produit test zero', qty: 1, pu_vente: 0, pt_vente: 0, pu_achat: 0, fournisseur: 'Arrow Electronics', sort_order: 0, line_status: 'pending', warranty_months: null, license_months: null }],
    },
    supply: { status: 'a_commander' },
  }));

  // 98: Deal with DR expiring today
  deals.push(deal('Commit DR expire aujourd\'hui', 'Commit', 'Open', {
    bu: 'Cyber', vendor: 'Palo Alto', amount: 900000, prob: 90,
    dr: [{ bu: 'Cyber', card: 'Palo Alto NGFW', platform: 'Palo Alto Partner Portal', dr_number: 'DR-PA-2026-URGENT', expiry_date: dateStr(0) }],
  }));

  // 99: Won fully complete (supply facturé + invoice payée + warranty + license + DR)
  deals.push(deal('Won COMPLET tout validé', 'Won', 'Won', {
    bu: 'HCI', vendor: 'Dell', amount: 2000000, prob: 100,
    po_number: 'PO-TEST-099', po_date: dateStr(-120),
    multi_bu: true,
    bu_lines: [
      { bu: 'HCI', card: 'Dell PowerEdge', amount: 1500000 },
      { bu: 'Service', card: 'Installation', amount: 500000 },
    ],
    dr: [{ bu: 'HCI', card: 'Dell PowerEdge', platform: 'Dell Partner Direct', dr_number: 'DR-DELL-FULL-001', expiry_date: dateStr(180) }],
    purchase: {
      frais_engagement: 5000, payment_terms: '60j', notes: 'Deal complet — workflow terminé',
      lines: [
        { ref: 'REF-099-L1', designation: 'Dell PowerEdge R760 Cluster', qty: 8, pu_vente: 187500, pt_vente: 1500000, pu_achat: 150000, fournisseur: 'Arrow Electronics', sort_order: 0, line_status: 'livre', warranty_months: 36, license_months: 60 },
        { ref: 'REF-099-L2', designation: 'Service déploiement + formation', qty: 1, pu_vente: 500000, pt_vente: 500000, pu_achat: 350000, fournisseur: 'Arrow Electronics', sort_order: 1, line_status: 'livre', warranty_months: null, license_months: null },
      ],
    },
    supply: { status: 'facture', placed_at: isoNow(-110), ordered_at: isoNow(-100), received_at: isoNow(-60), delivered_at: isoNow(-40), invoiced_at: isoNow(-20) },
    invoice: {
      invoice_number: 'FAC-TEST-099', amount: 2000000, issue_date: dateStr(-20), due_date: dateStr(-5),
      status: 'payee', payment_terms: '60j', notes: 'Paiement reçu — deal complet',
    },
  }));

  // 100: Mega deal stress test (edge case with minimal data)
  deals.push(deal('STRESS TEST alertes multiples', 'Won', 'Won', {
    bu: 'Network', vendor: 'Cisco', amount: 1000, prob: 100,
    margin_pct: 1, po_number: 'PO-TEST-100', po_date: dateStr(-5),
    notes: 'Deal stress test — marge faible, montant minimal',
    purchase: {
      frais_engagement: 0, payment_terms: null, notes: 'Stress test',
      lines: [{ ref: 'REF-100-L1', designation: 'Stress test produit', qty: 1, pu_vente: 1000, pt_vente: 1000, pu_achat: 990, fournisseur: null, sort_order: 0, line_status: 'pending', warranty_months: null, license_months: null }],
    },
    supply: { status: 'a_commander' },
    invoice: {
      invoice_number: 'FAC-TEST-100', amount: 1000, issue_date: dateStr(-90), due_date: dateStr(-90),
      status: 'echue', payment_terms: null, notes: 'Stress test — facture échue depuis longtemps',
    },
  }));

  return deals;
}

// ── Insert into Supabase ─────────────────────────────────────────────────────

async function run() {
  const deals = buildDeals();
  console.log(`\n🚀 Inserting ${deals.length} test deals for AFMA...\n`);

  let ok = 0, fail = 0;

  for (const d of deals) {
    try {
      // 1) Insert opportunity
      const { data: opp, error: oppErr } = await sb
        .from('opportunities')
        .insert(d.opp)
        .select('id')
        .single();

      if (oppErr) throw new Error(`Opp: ${oppErr.message}`);
      const oppId = opp.id;

      // 2) Insert purchase_info + lines
      if (d.purchase) {
        const { data: pi, error: piErr } = await sb
          .from('purchase_info')
          .insert({
            opportunity_id: oppId,
            frais_engagement: d.purchase.frais_engagement,
            payment_terms: d.purchase.payment_terms,
            notes: d.purchase.notes || '',
            filled_by: d.opp.owner_email,
          })
          .select('id')
          .single();

        if (piErr) throw new Error(`PurchaseInfo: ${piErr.message}`);

        if (d.purchase.lines && d.purchase.lines.length > 0) {
          const lines = d.purchase.lines.map(l => ({
            purchase_info_id: pi.id,
            ref: l.ref, designation: l.designation,
            qty: l.qty, pu_vente: l.pu_vente, pt_vente: l.pt_vente, pu_achat: l.pu_achat,
            fournisseur: l.fournisseur,
            // fournisseur_id not in DB schema
            contact_fournisseur: l.contact_fournisseur || null,
            email_fournisseur: l.email_fournisseur || null,
            tel_fournisseur: l.tel_fournisseur || null,
            sort_order: l.sort_order,
            line_status: l.line_status || 'pending',
            eta: l.eta, warranty_months: l.warranty_months, license_months: l.license_months,
          }));

          const { error: plErr } = await sb.from('purchase_lines').insert(lines);
          if (plErr) throw new Error(`PurchaseLines: ${plErr.message}`);
        }
      }

      // 3) Insert supply_order
      if (d.supply) {
        const { error: soErr } = await sb.from('supply_orders').insert({
          opportunity_id: oppId,
          status: d.supply.status,
          supply_notes: d.supply.supply_notes || null,
          placed_at: d.supply.placed_at || null,
          ordered_at: d.supply.ordered_at || null,
          received_at: d.supply.received_at || null,
          delivered_at: d.supply.delivered_at || null,
          invoiced_at: d.supply.invoiced_at || null,
        });
        if (soErr) throw new Error(`SupplyOrder: ${soErr.message}`);
      }

      // 4) Insert invoice(s)
      if (d.invoice) {
        const invBase = {
          opportunity_id: oppId,
          invoice_number: d.invoice.invoice_number,
          amount: d.invoice.amount,
          issue_date: d.invoice.issue_date,
          due_date: d.invoice.due_date,
          status: d.invoice.status,
          payment_terms: d.invoice.payment_terms,
          notes: d.invoice.notes,
          created_by: d.opp.owner_email,
        };

        const { error: invErr } = await sb.from('invoices').insert(invBase);
        if (invErr) throw new Error(`Invoice: ${invErr.message}`);

        // Double facture case
        if (d.invoice.doubleFact) {
          const { error: inv2Err } = await sb.from('invoices').insert({
            ...invBase,
            invoice_number: (d.invoice.invoice_number || 'FAC') + '-B',
            amount: Math.round(d.invoice.amount * 0.3),
            notes: 'Deuxième facture partielle',
          });
          if (inv2Err) console.log(`  ⚠️ Double invoice: ${inv2Err.message}`);
        }
      }

      // 5) Insert deal_registrations
      if (d.dr && d.dr.length > 0) {
        for (const dr of d.dr) {
          const { error: drErr } = await sb.from('deal_registrations').insert({
            opportunity_id: oppId,
            bu: dr.bu, card: dr.card, platform: dr.platform,
            dr_number: dr.dr_number, expiry_date: dr.expiry_date,
            status: 'active',
          });
          if (drErr) console.log(`  ⚠️ DR: ${drErr.message}`);
        }
      }

      ok++;
      const icon = d.opp.status === 'Won' ? '🏆' : d.opp.status === 'Lost' ? '❌' : '📋';
      process.stdout.write(`${icon} ${d.num}. ${d.opp.title} [${d.opp.stage}]${d.supply ? ' → supply:' + d.supply.status : ''}${d.invoice ? ' → inv:' + d.invoice.status : ''}\n`);

    } catch (err) {
      fail++;
      console.error(`❌ ${d.num}. ${d.opp.title}: ${err.message}`);
    }
  }

  console.log(`\n✅ Done: ${ok} inserted, ${fail} failed out of ${deals.length} deals.\n`);
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
