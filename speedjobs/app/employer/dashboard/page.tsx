'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { useAuth } from '@/components/shared/SupabaseProvider';
import { supabase, getEmployer } from '@/lib/supabase';
import { Header } from '@/components/shared/Header';
import { Footer } from '@/components/shared/Footer';
import { Button } from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';
import { formatDateTime } from '@/lib/utils';
import type { Employer, Job } from '@/types';

export default function EmployerDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [employer, setEmployer] = useState<Employer | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (searchParams.get('success')) toast.success('Paiement confirmé !');
  }, [searchParams]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    (async () => {
      const { data: employerData } = await getEmployer(user.id);
      if (!employerData) {
        router.push('/employer/signup');
        return;
      }
      setEmployer(employerData);
      const { data: jobsData } = await supabase
        .from('jobs')
        .select('*')
        .eq('employer_id', employerData.id)
        .order('published_at', { ascending: false });
      setJobs(jobsData || []);
      setLoading(false);
    })();
  }, [user, authLoading, router]);

  if (loading || !employer) return <PageSpinner />;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header title="SpeedJob's Employer" showSignOut />
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 space-y-4">
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-1">{employer.company_name}</h2>
          <p className="text-gray-600 mb-2">
            Abonnement : <strong>{employer.subscription_tier.toUpperCase()}</strong>
          </p>
          <p className="text-lg mb-4">
            Posts restants :{' '}
            <strong>
              {employer.subscription_tier === 'business' ? '∞' : employer.posts_remaining}
            </strong>
          </p>
          <Link href="/employer/create-job">
            <Button variant="primary" size="lg">
              + Créer une urgence
            </Button>
          </Link>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-4">Mes annonces</h2>
          {jobs.length === 0 ? (
            <p className="text-gray-500">Aucune annonce pour le moment</p>
          ) : (
            <ul className="space-y-3">
              {jobs.map((job) => (
                <li key={job.id}>
                  <Link href={`/employer/job/${job.id}`}>
                    <div className="border rounded-lg p-4 hover:border-blue-600 cursor-pointer transition">
                      <div className="flex justify-between">
                        <h3 className="font-bold">{job.skill}</h3>
                        <span className="text-sm">
                          {job.status === 'open'
                            ? '🔴 LIVE'
                            : job.status === 'filled'
                              ? '✅ POURVU'
                              : '⏰ EXPIRÉ'}
                        </span>
                      </div>
                      <p className="text-gray-600 text-sm">
                        {job.location} • {job.tarif} CHF/h
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatDateTime(job.start_time)}
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
