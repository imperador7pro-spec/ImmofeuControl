'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  getJobWithApplications,
  subscribeToJobApplications,
} from '@/lib/supabase';
import { confirmCandidate, completeJob } from '@/actions/employer';
import { submitReview } from '@/actions/candidate';
import { Header } from '@/components/shared/Header';
import { Button } from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';
import { StarRating } from '@/components/ui/StarRating';
import { formatDateTime, formatDuration, getRatingColor, timeAgo } from '@/lib/utils';
import type { Job, ApplicationWithCandidate } from '@/types';

export default function EmployerJobPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [applications, setApplications] = useState<ApplicationWithCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  const load = useCallback(async () => {
    if (!params.id) return;
    const { data } = await getJobWithApplications(params.id);
    if (data) {
      const { applications: apps, ...rest } = data as Job & {
        applications: ApplicationWithCandidate[];
      };
      setJob(rest as Job);
      const sorted = [...(apps || [])].sort(
        (a, b) => new Date(a.accepted_at).getTime() - new Date(b.accepted_at).getTime(),
      );
      setApplications(sorted);
    }
    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    load();
    if (!params.id) return;
    const sub = subscribeToJobApplications(params.id, () => {
      toast.success('🚀 Nouveau candidat !');
      load();
    });
    return () => {
      sub.unsubscribe();
    };
  }, [params.id, load]);

  const handleConfirm = async (candidateId: string) => {
    if (!job) return;
    setActionLoading(true);
    const { error } = await confirmCandidate(job.id, candidateId);
    setActionLoading(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success('Candidat confirmé !');
    load();
  };

  const handleComplete = async () => {
    if (!job) return;
    setActionLoading(true);
    const { error } = await completeJob(job.id);
    setActionLoading(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success('Job terminé !');
    load();
  };

  const handleReview = async () => {
    if (!job) return;
    const confirmedApp = applications.find((a) => a.status === 'completed');
    if (!confirmedApp?.candidates?.user_id) return;
    setActionLoading(true);
    const { error } = await submitReview(
      job.id,
      confirmedApp.candidates.user_id,
      rating,
      comment,
    );
    setActionLoading(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success('Avis envoyé');
    router.push('/employer/dashboard');
  };

  if (loading) return <PageSpinner />;
  if (!job)
    return (
      <div className="min-h-screen flex items-center justify-center">Job introuvable</div>
    );

  const confirmed = applications.find((a) => a.status === 'confirmed');
  const completed = applications.find((a) => a.status === 'completed');

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Suivi de l'urgence" backHref="/employer/dashboard" />
      <main className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <h2 className="text-2xl font-bold">{job.skill}</h2>
            <span className="text-2xl font-bold text-green-600">{job.tarif} CHF/h</span>
          </div>
          <p className="text-gray-700">{job.location}</p>
          <p className="text-sm text-gray-500 mt-1">
            {formatDateTime(job.start_time)} → {formatDateTime(job.end_time)} (
            {formatDuration(job.start_time, job.end_time)})
          </p>
          <p className="text-sm mt-2">
            Statut :{' '}
            {job.status === 'open'
              ? '🔴 LIVE'
              : job.status === 'filled'
                ? '✅ POURVU'
                : '⏰ EXPIRÉ'}
          </p>
        </div>

        {job.status === 'open' && (
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold mb-3">
              Candidats acceptants en live ({applications.length})
            </h3>
            {applications.length === 0 ? (
              <p className="text-gray-500 text-sm">
                En attente de candidats... La notif a été envoyée.
              </p>
            ) : (
              <ul className="space-y-3">
                {applications.map((app, idx) => (
                  <li
                    key={app.id}
                    className="border rounded-lg p-3 flex items-center gap-3"
                  >
                    <div className="text-xs font-bold w-6 text-gray-500">#{idx + 1}</div>
                    {app.candidates?.photo_url ? (
                      <img
                        src={app.candidates.photo_url}
                        alt={app.candidates.name}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-gray-500">
                        ?
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="font-semibold">{app.candidates?.name}</p>
                      <p
                        className={`text-sm ${getRatingColor(app.candidates?.rating || 0)}`}
                      >
                        ⭐ {(app.candidates?.rating || 0).toFixed(1)} (
                        {app.candidates?.rating_count || 0})
                      </p>
                      <p className="text-xs text-gray-400">{timeAgo(app.accepted_at)}</p>
                    </div>
                    <Button
                      onClick={() =>
                        app.candidates && handleConfirm(app.candidates.id)
                      }
                      variant="primary"
                      size="sm"
                      fullWidth={false}
                      disabled={actionLoading}
                    >
                      Confirmer
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {confirmed && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
            <p className="font-semibold text-green-800 mb-2">
              ✅ {confirmed.candidates?.name} a été confirmé
            </p>
            <Button onClick={handleComplete} variant="primary" size="md" disabled={actionLoading}>
              Marquer le job terminé
            </Button>
          </div>
        )}

        {completed && (
          <div className="bg-white rounded-2xl p-6 shadow-sm space-y-3">
            <h3 className="font-semibold">Noter {completed.candidates?.name}</h3>
            <StarRating value={rating} onChange={setRating} size="lg" />
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Commentaire (optionnel)"
              rows={3}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <Button onClick={handleReview} variant="primary" size="md" disabled={actionLoading}>
              Envoyer l’avis
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
