import { createClient } from '@supabase/supabase-js';

// Anon key pública por design — a proteção real é Auth + RLS.
export const SUPABASE_URL = 'https://kzioedpnfslvnniznasr.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6aW9lZHBuZnNsdm5uaXpuYXNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0ODgxMTgsImV4cCI6MjA5ODA2NDExOH0.SOXjpwZgkEekS8oWUBptwB2f3QjiY0iJDY0RLR1i3UA';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export const PING_URL = `${SUPABASE_URL}/functions/v1/ping`;
