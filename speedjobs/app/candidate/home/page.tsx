'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useAuth } from '@/components/shared/SupabaseProvider';
import { supabase, getCandidate } from '@/lib/supabase';
import { toggleOnline } from '@/actions/candidate';
import { Header } from '@/components/shared/Header';
import { Footer } from '@/components/shared/Footer';
import { FcmRegistrar } from '@/components/shared/FcmRegistrar';
import { Button } from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';
import { getRatingColor, formatDateTime } from '@/lib/utils';
import type { Candidate, Job } from '@/types';

export default function CandidateHomePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const candidateRef = useRef<Candidate | null>(null);
  const [openJobs, setOpenJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    candidateRef.current = candidate;
  }, [candidate]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    (async () => {
      const { data } = await getCandidate(user.id);
      if (!data) {
        router.push('/candidate/signup');
        return;
      }
      setCandidate(data);
      candidateRef.current = data;
      setLoading(false);
      await refreshJobs(data);
    })();

    const channel = supabase
      .channel('jobs-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'jobs' },
        async () => {
          const c = candidateRef.current;
          if (c) await refreshJobs(c);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  const refreshJobs = async (c: Candidate) => {
    if (c.skills.length === 0) {
      setOpenJobs([]);
      return;
    }
    const { data } = await supabase
      .from('jobs')
      .select('*')
      .eq('status', 'open')
      .eq('location', c.location)
      .in('skill', c.skills)
      .order('published_at', { ascending: false })
      .limit(20);
    setOpenJobs(data || []);
  };

  const handleToggleOnline = async () => {
    if (!candidate) return;
    const newOnline = !candidate.online;
    const { error } = await toggleOnline(newOnline);
    if (error) {
      toast.error(error);
      return;
    }
    setCandidate({ ...candidate, online: newOnline });
    toast.success(newOnline ? '🟢 Vous êtes en ligne' : '⚪ Vous êtes hors ligne');
  };

  if (loading || !candidate) return <PageSpinner />;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header title="SpeedJob's" showSignOut />
      <FcmRegistrar enabled={candidate.online} />
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 space-y-4">
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Statut</h2>
            <button
              onClick={handleToggleOnline}
              className={`w-16 h-9 rounded-full flex items-center transition ${
                candidate.online ? 'bg-green-500' : 'bg-gray-300'
              }`}
              aria-label="Toggle online"
            >
              <div
                className={`w-7 h-7 rounded-full bg-white shadow transition ${
                  candidate.online ? 'translate-x-8' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {candidate.online ? (
            <p className="text-green-600 font-semibold">
              🟢 ONLINE — En attente d&apos;urgences...
            </p>
          ) : (
            <p className="text-gray-500">⚪ OFFLINE — Vous êtes hors ligne</p>
          )}
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-semibold mb-3">Mon profil</h2>
          <div className="text-sm space-y-1">
            <p>
              <strong>Nom :</strong> {candidate.name}
            </p>
            <p>
              <strong>Lieu :</strong> {candidate.location}
            </p>
            <p>
              <strong>Skills :</strong> {candidate.skills.join(', ')}
            </p>
            <p>
              <strong>Rating :</strong>{' '}
              <span className={getRatingColor(candidate.rating)}>
                ⭐ {candidate.rating.toFixed(1)} ({candidate.rating_count} avis)
              </span>
            </p>
          </div>
          <div className="mt-4">
            <Link href="/candidate/profile">
              <Button variant="secondary" size="md">
                Modifier mon profil
              </Button>
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-semibold mb-3">Urgences disponibles</h2>
          {openJobs.length === 0 ? (
            <p className="text-gray-500 text-sm">
              Aucune urgence pour le moment. Restez en ligne pour recevoir une notif !
            </p>
          ) : (
            <ul className="space-y-3">
              {openJobs.map((job) => (
                <li key={job.id}>
                  <Link href={`/candidate/job/${job.id}`}>
                    <div className="border rounded-lg p-3 hover:border-blue-600 transition">
                      <div className="flex justify-between">
                        <span className="font-bold">{job.skill}</span>
                        <span className="font-bold text-green-600">
                          {job.tarif} CHF/h
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">{job.location}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatDateTime(job.start_time)} → {formatDateTime(job.end_time)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
