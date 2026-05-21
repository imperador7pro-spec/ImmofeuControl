import { createBrowserClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase =
  typeof window !== 'undefined'
    ? createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)
    : createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey);

export async function getUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getCandidate(userId: string) {
  const { data, error } = await supabase
    .from('candidates')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  return { data, error };
}

export async function getEmployer(userId: string) {
  const { data, error } = await supabase
    .from('employers')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  return { data, error };
}

export async function getMatchingCandidates(skill: string, location: string) {
  const { data, error } = await supabase
    .from('candidates')
    .select('*')
    .contains('skills', [skill])
    .eq('location', location)
    .eq('online', true);
  return { data, error };
}

export async function getJobWithApplications(jobId: string) {
  const { data, error } = await supabase
    .from('jobs')
    .select(`*, applications(*, candidates:candidate_id(*))`)
    .eq('id', jobId)
    .single();
  return { data, error };
}

export function subscribeToJobApplications(
  jobId: string,
  callback: (payload: unknown) => void,
) {
  return supabase
    .channel(`job-${jobId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'applications',
        filter: `job_id=eq.${jobId}`,
      },
      callback,
    )
    .subscribe();
}

export function subscribeToJobUpdates(
  jobId: string,
  callback: (payload: unknown) => void,
) {
  return supabase
    .channel(`job-update-${jobId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'jobs',
        filter: `id=eq.${jobId}`,
      },
      callback,
    )
    .subscribe();
}
