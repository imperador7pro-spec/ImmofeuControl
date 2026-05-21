'use server';

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';
import type { Database } from '@/types';

type CandidateInsert = Database['public']['Tables']['candidates']['Insert'];
type CandidateUpdate = Database['public']['Tables']['candidates']['Update'];

export async function createCandidate(data: Omit<CandidateInsert, 'user_id'>) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const phone = data.phone || user.phone || '';
  const { error } = await supabase
    .from('candidates')
    .insert({ ...data, phone, user_id: user.id });
  revalidatePath('/candidate/home');
  return { error: error ? error.message : null };
}

export async function updateCandidate(data: CandidateUpdate) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const { error } = await supabase
    .from('candidates')
    .update(data)
    .eq('user_id', user.id);
  revalidatePath('/candidate/home');
  revalidatePath('/candidate/profile');
  return { error: error ? error.message : null };
}

export async function toggleOnline(online: boolean) {
  return updateCandidate({ online });
}

export async function setFcmToken(token: string) {
  return updateCandidate({ fcm_token: token });
}

export async function acceptJob(jobId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: candidate, error: candidateError } = await supabase
    .from('candidates')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (candidateError || !candidate) return { error: 'Candidate not found' };

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id, status')
    .eq('id', jobId)
    .single();
  if (jobError || !job) return { error: 'Job not found' };
  if (job.status !== 'open') return { error: 'Job no longer available' };

  const { error } = await supabase.from('applications').insert({
    job_id: jobId,
    candidate_id: candidate.id,
    status: 'accepted',
  });
  revalidatePath(`/candidate/job/${jobId}`);
  return { error: error ? error.message : null };
}

export async function submitReview(
  jobId: string,
  toUserId: string,
  rating: number,
  comment?: string,
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase.from('reviews').insert({
    job_id: jobId,
    from_user_id: user.id,
    to_user_id: toUserId,
    rating,
    comment: comment ?? null,
  });
  return { error: error ? error.message : null };
}
