/**
 * CLEANUP SCRIPT — Remove all TEST-xxx deals from AFMA
 * Run: node scripts/cleanup-test-deals.js
 */

const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  'https://cnrpaedvqjvepwtypbmw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucnBhZWR2cWp2ZXB3dHlwYm13Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzYxODYyOCwiZXhwIjoyMDgzMTk0NjI4fQ.VV5Kcnsx6FrGLi2dWiCSvnbxQlbkTdVcWqS_dcTYS8g'
);

async function cleanup() {
  console.log('\n🧹 Cleaning up TEST deals...\n');

  // 1. Find all TEST deals
  const { data: opps, error } = await sb.from('opportunities').select('id, title').like('title', 'TEST-%');
  if (error) { console.error('Error finding deals:', error.message); return; }
  if (!opps || opps.length === 0) { console.log('No TEST deals found.'); return; }

  const ids = opps.map(o => o.id);
  console.log(`Found ${ids.length} TEST deals to delete.\n`);

  // 2. Delete related data (cascading order)
  const tables = [
    'deal_registrations',
    'invoices',
    'support_tickets',
    'project_services',
    'deal_files',
    'supply_orders',
  ];

  for (const tbl of tables) {
    const { data, error: e } = await sb.from(tbl).delete().in('opportunity_id', ids).select('id');
    const count = data?.length || 0;
    if (count > 0) console.log(`  ✓ ${tbl}: ${count} deleted`);
    if (e) console.log(`  ⚠ ${tbl}: ${e.message}`);
  }

  // 3. Delete purchase_lines via purchase_info
  const { data: piIds } = await sb.from('purchase_info').select('id').in('opportunity_id', ids);
  if (piIds && piIds.length > 0) {
    const pids = piIds.map(p => p.id);
    const { data: pld } = await sb.from('purchase_lines').delete().in('purchase_info_id', pids).select('id');
    console.log(`  ✓ purchase_lines: ${pld?.length || 0} deleted`);
    const { data: pid } = await sb.from('purchase_info').delete().in('id', pids).select('id');
    console.log(`  ✓ purchase_info: ${pid?.length || 0} deleted`);
  }

  // 4. Delete the opportunities themselves
  const { data: od, error: oe } = await sb.from('opportunities').delete().in('id', ids).select('id');
  console.log(`  ✓ opportunities: ${od?.length || 0} deleted`);
  if (oe) console.log(`  ⚠ opportunities: ${oe.message}`);

  console.log(`\n✅ Cleanup complete — ${od?.length || 0} TEST deals removed.\n`);
}

cleanup().catch(e => { console.error('Fatal:', e); process.exit(1); });
