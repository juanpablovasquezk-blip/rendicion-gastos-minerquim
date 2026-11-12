import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const userId = '709da4a7-c21b-487a-b465-5739cddc561a';
  
  // Profile
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single();
  console.log('Profile:', profile.full_name, profile.email);

  // Cash Advances
  const { data: advances } = await supabase.from('cash_advances').select('*').eq('user_id', userId).order('created_at', { ascending: true });
  console.log('\n=== CASH ADVANCES ===');
  for (const a of advances || []) {
    console.log(`[${a.id}] ${a.date_assigned || a.created_at.slice(0, 10)} | Inicial: $${a.initial_amount} | Saldo: $${a.current_balance} | Status: ${a.status}`);
    console.log(`   Motivo: ${a.purpose}`);
  }

  // Reports and Expenses
  const { data: reports } = await supabase.from('expense_reports')
    .select('id, title, report_type, status, total_amount, created_at, expenses(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  console.log('\n=== REPORTS & EXPENSES ===');
  for (const r of reports || []) {
    console.log(`\nReport: "${r.title}" (ID: ${r.id}) Type: ${r.report_type} Status: ${r.status} Total: $${r.total_amount}`);
    for (const e of r.expenses || []) {
      const glosa = e.justification || e.description || '(Sin glosa)';
      const prov = e.supplier_name || '(Sin proveedor)';
      const folio = e.invoice_number ? `Folio ${e.invoice_number}` : 'S/F';
      console.log(`   - ${e.date} | ${prov} | ${glosa} | ${folio} | $${Number(e.total_amount).toLocaleString('es-CL')} (IVA: $${Number(e.tax_amount || 0).toLocaleString('es-CL')})`);
    }
  }
}

run();
