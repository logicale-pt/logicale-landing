import { createClient, type PostgrestError } from '@supabase/supabase-js';

// Anon key pública por design — a proteção real é Auth + RLS.
export const SUPABASE_URL = 'https://kzioedpnfslvnniznasr.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6aW9lZHBuZnNsdm5uaXpuYXNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0ODgxMTgsImV4cCI6MjA5ODA2NDExOH0.SOXjpwZgkEekS8oWUBptwB2f3QjiY0iJDY0RLR1i3UA';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export const PING_URL = `${SUPABASE_URL}/functions/v1/ping`;

/** A tabela/view ainda não existe (migração SQL por aplicar)? */
export function tabelaEmFalta(error: PostgrestError | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST205' || error.code === '42P01' || /does not exist|schema cache/i.test(error.message);
}
