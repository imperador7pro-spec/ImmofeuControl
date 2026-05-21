'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useUser } from '@/components/shared/SupabaseProvider';
import { supabase, getCandidate, subscribeToJobUpdates } from '@/lib/supabase';
import { acceptJob, submitReview } from '@/actions/candidate';
import { Header } from '@/components/shared/Header';
import { Button } from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';
import { StarRating } from '@/components/ui/StarRating';
import { formatDateTime, formatDuration } from '@/lib/utils';
import type { Job, Application, Candidate } from '@/types';

export default function CandidateJobPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const user = useUser();
  const [job, setJob] = useState<Job | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [myApp, setMyApp] = useState<Application | null>(null);
  const [employerUserId, setEmployerUserId] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !params.id) return;
    (async () => {
      const [{ data: jobData }, { data: candidateData }] = await Promise.all([
        supabase.from('jobs').select('*').eq('id', params.id).single(),
        getCandidate(user.id),
      ]);
      setJob(jobData);
      setCandidate(candidateData);
      if (jobData && candidateData) {
        const { data: appData } = await supabase
          .from('applications')
          .select('*')
          .eq('job_id', jobData.id)
          .eq('candidate_id', candidateData.id)
          .maybeSingle();
        setMyApp(appData);
        const { data: emp } = await supabase
          .from('employers')
          .select('user_id')
          .eq('id', jobData.employer_id)
          .single();
        setEmployerUserId(emp?.user_id ?? null);
      }
      setLoading(false);
    })();

    const sub = subscribeToJobUpdates(params.id, async () => {
      const { data: jobData } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', params.id)
        .single();
      setJob(jobData);
    });
    return () => {
      sub.unsubscribe();
    };
  }, [user, params.id]);

  const handleAccept = async () => {
    if (!job) return;
    setSubmitting(true);
    const { error } = await acceptJob(job.id);
    setSubmitting(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success('Candidature envoyée !');
    if (candidate) {
      const { data: appData } = await supabase
        .from('applications')
        .select('*')
        .eq('job_id', job.id)
        .eq('candidate_id', candidate.id)
        .maybeSingle();
      setMyApp(appData);
    }
  };

  const handleSubmitReview = async () => {
    if (!job || !employerUserId) return;
    setSubmitting(true);
    const { error } = await submitReview(job.id, employerUserId, rating, comment);
    setSubmitting(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success('Merci pour votre avis !');
    router.push('/candidate/home');
  };

  if (loading) return <PageSpinner />;
  if (!job)
    return (
      <div className="min-h-screen flex items-center justify-center">Job introuvable</div>
    );

  const isConfirmedForMe = myApp?.status === 'confirmed';
  const isRejected = myApp?.status === 'rejected';
  const isCompleted = myApp?.status === 'completed';

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Détails de l'urgence" backHref="/candidate/home" />
      <main className="max-w-md mx-auto p-4 space-y-4">
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <h2 className="text-2xl font-bold">{job.skill}</h2>
            <span className="text-2xl font-bold text-green-600">{job.tarif} CHF/h</span>
          </div>
          <p className="text-gray-700">{job.location}</p>
          <p className="text-sm text-gray-500 mt-2">
            {formatDateTime(job.start_time)} → {formatDateTime(job.end_time)}
          </p>
          <p className="text-sm text-gray-500">
            Durée : {formatDuration(job.start_time, job.end_time)}
          </p>
          {job.details && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-gray-700">{job.details}</p>
            </div>
          )}
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm">
              <strong>Statut :</strong>{' '}
              {job.status === 'open'
                ? '🔴 OUVERT'
                : job.status === 'filled'
                  ? '✅ POURVU'
                  : '⏰ EXPIRÉ'}
            </p>
          </div>
        </div>

        {!myApp && job.status === 'open' && (
          <Button onClick={handleAccept} variant="primary" size="lg" disabled={submitting}>
            {submitting ? 'Envoi...' : '⚡ ACCEPTER MAINTENANT'}
          </Button>
        )}

        {myApp?.status === 'accepted' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-center">
            ⏳ En attente de confirmation par l&apos;employeur...
          </div>
        )}

        {isConfirmedForMe && !isCompleted && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center font-semibold text-green-800">
            ✅ Vous êtes confirmé ! Préparez-vous.
          </div>
        )}

        {isRejected && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center text-red-700">
            Un autre candidat a été retenu. Bonne chance la prochaine fois !
          </div>
        )}

        {isCompleted && employerUserId && (
          <div className="bg-white rounded-2xl p-6 shadow-sm space-y-3">
            <h3 className="font-semibold">Noter l&apos;employeur</h3>
            <StarRating value={rating} onChange={setRating} size="lg" />
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Commentaire (optionnel)"
              rows={3}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <Button onClick={handleSubmitReview} variant="primary" size="md" disabled={submitting}>
              {submitting ? 'Envoi...' : 'Envoyer l’avis'}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
