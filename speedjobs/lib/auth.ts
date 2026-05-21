import { createSupabaseServerClient } from './supabase-server';

export async function getServerUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function requireServerUser() {
  const user = await getServerUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  return user;
}

export async function getServerRole(): Promise<'candidate' | 'employer' | null> {
  const user = await getServerUser();
  if (!user) return null;
  const supabase = await createSupabaseServerClient();
  const { data: candidate } = await supabase
    .from('candidates')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (candidate) return 'candidate';
  const { data: employer } = await supabase
    .from('employers')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (employer) return 'employer';
  return null;
}
