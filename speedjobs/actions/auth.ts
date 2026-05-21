'use server';

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';

export async function signInWithPhone(phone: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: true },
  });
  return { error: error ? error.message : null };
}

export async function verifyOtp(phone: string, token: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: 'sms',
  });
  if (error || !data.user) {
    return { userId: null, role: null, error: error?.message ?? 'Invalid code' };
  }
  const { data: candidate } = await supabase
    .from('candidates')
    .select('id')
    .eq('user_id', data.user.id)
    .maybeSingle();
  if (candidate) {
    return { userId: data.user.id, role: 'candidate' as const, error: null };
  }
  const { data: employer } = await supabase
    .from('employers')
    .select('id')
    .eq('user_id', data.user.id)
    .maybeSingle();
  if (employer) {
    return { userId: data.user.id, role: 'employer' as const, error: null };
  }
  return { userId: data.user.id, role: null, error: null };
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath('/');
}
