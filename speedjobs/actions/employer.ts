'use server';

import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server';
import { sendMultiplePushNotifications } from '@/lib/fcm';
import { revalidatePath } from 'next/cache';
import type { Database } from '@/types';

type EmployerInsert = Database['public']['Tables']['employers']['Insert'];
type EmployerUpdate = Database['public']['Tables']['employers']['Update'];
type JobInsert = Database['public']['Tables']['jobs']['Insert'];

export async function createEmployer(data: Omit<EmployerInsert, 'user_id'>) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const initialPosts =
    data.subscription_tier === 'pro' ? 3 : data.subscription_tier === 'business' ? 9999 : 1;

  const { error } = await supabase.from('employers').insert({
    ...data,
    phone: data.phone || user.phone || '',
    posts_remaining: data.posts_remaining ?? initialPosts,
    user_id: user.id,
  });
  revalidatePath('/employer/dashboard');
  return { error: error ? error.message : null };
}

export async function updateEmployer(data: EmployerUpdate) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const { error } = await supabase
    .from('employers')
    .update(data)
    .eq('user_id', user.id);
  revalidatePath('/employer/dashboard');
  return { error: error ? error.message : null };
}

export async function createJob(data: Omit<JobInsert, 'employer_id'>) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: employer, error: employerError } = await supabase
    .from('employers')
    .select('id, posts_remaining, subscription_tier')
    .eq('user_id', user.id)
    .single();
  if (employerError || !employer) return { error: 'Employer not found' };
  if (employer.posts_remaining <= 0) return { error: 'No posts remaining' };

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .insert({ ...data, employer_id: employer.id })
    .select()
    .single();
  if (jobError || !job) return { error: jobError?.message ?? 'Failed to create job' };

  if (employer.subscription_tier !== 'business') {
    await supabase
      .from('employers')
      .update({ posts_remaining: employer.posts_remaining - 1 })
      .eq('id', employer.id);
  }

  const admin = createSupabaseAdminClient();
  const { data: candidates } = await admin
    .from('candidates')
    .select('fcm_token')
    .contains('skills', [data.skill])
    .eq('location', data.location)
    .eq('online', true);

  const tokens = (candidates ?? [])
    .map((c) => c.fcm_token)
    .filter((t): t is string => !!t);

  if (tokens.length > 0) {
    await sendMultiplePushNotifications(
      tokens,
      `🚨 ${data.skill?.toUpperCase()}`,
      `${data.location} - ${data.tarif} CHF/h - TAP RAPIDE!`,
      { job_id: job.id },
    );
  }

  revalidatePath('/employer/dashboard');
  return { jobId: job.id, error: null };
}

export async function confirmCandidate(jobId: string, candidateId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error: jobError } = await supabase
    .from('jobs')
    .update({ status: 'filled', filled_by: candidateId })
    .eq('id', jobId);
  if (jobError) return { error: jobError.message };

  const { error: appError } = await supabase
    .from('applications')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
    .eq('job_id', jobId)
    .eq('candidate_id', candidateId);
  if (appError) return { error: appError.message };

  await supabase
    .from('applications')
    .update({ status: 'rejected' })
    .eq('job_id', jobId)
    .neq('candidate_id', candidateId)
    .eq('status', 'accepted');

  const admin = createSupabaseAdminClient();
  const { data: candidate } = await admin
    .from('candidates')
    .select('fcm_token, name')
    .eq('id', candidateId)
    .single();

  if (candidate?.fcm_token) {
    await sendMultiplePushNotifications(
      [candidate.fcm_token],
      '✅ Vous êtes confirmé !',
      'Le job est à vous. Préparez-vous !',
      { job_id: jobId },
    );
  }

  revalidatePath(`/employer/job/${jobId}`);
  revalidatePath(`/candidate/job/${jobId}`);
  return { error: null };
}

export async function completeJob(jobId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('applications')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('job_id', jobId)
    .eq('status', 'confirmed');
  revalidatePath(`/employer/job/${jobId}`);
  return { error: error ? error.message : null };
}
