import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: advances } = await supabase.from('cash_advances').select('id, user_id, initial_amount, current_balance, status, purpose, created_at');
  const { data: profiles } = await supabase.from('profiles').select('id, full_name, email');
  const profMap = Object.fromEntries(profiles.map(p => [p.id, p.full_name]));

  console.log('--- ALL ADVANCES BY USER ---');
  for (const a of advances || []) {
    console.log(`${profMap[a.user_id] || a.user_id}: $${a.initial_amount} (${a.status}) - ${a.created_at.slice(0,10)} - ${a.purpose.slice(0,40)}`);
  }
}
run();
