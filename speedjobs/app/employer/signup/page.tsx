'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useUser } from '@/components/shared/SupabaseProvider';
import { createEmployer } from '@/actions/employer';
import { Button } from '@/components/ui/Button';

const PLANS = [
  { tier: 'starter', name: 'Starter', price: '19 CHF/mois', posts: '1 post/mois' },
  { tier: 'pro', name: 'Pro', price: '49 CHF/mois', posts: '3 posts/mois' },
  { tier: 'business', name: 'Business', price: '99 CHF/mois', posts: 'Illimité' },
] as const;

type Tier = (typeof PLANS)[number]['tier'];

export default function EmployerSignupPage() {
  const router = useRouter();
  const user = useUser();
  const [companyName, setCompanyName] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<Tier>('starter');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      router.push('/login');
      return;
    }
    setLoading(true);
    const { error } = await createEmployer({
      company_name: companyName,
      phone: user.phone || '',
      subscription_tier: selectedPlan,
    });
    if (error) {
      toast.error(error);
      setLoading(false);
      return;
    }
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: selectedPlan }),
    });
    if (res.ok) {
      const { url } = await res.json();
      if (url) {
        window.location.href = url;
        return;
      }
    }
    router.push('/employer/dashboard');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto mt-8">
        <h1 className="text-3xl font-bold mb-8 text-center">Choisir un plan</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {PLANS.map((plan) => (
            <button
              key={plan.tier}
              type="button"
              onClick={() => setSelectedPlan(plan.tier)}
              className={`p-6 rounded-2xl border-2 cursor-pointer transition text-left ${
                selectedPlan === plan.tier
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-blue-300'
              }`}
            >
              <h3 className="font-bold text-lg mb-2">{plan.name}</h3>
              <p className="text-2xl font-bold text-blue-600 mb-2">{plan.price}</p>
              <p className="text-sm text-gray-600">{plan.posts}</p>
            </button>
          ))}
        </div>
        <div className="bg-white rounded-2xl p-6 max-w-md mx-auto shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Nom de l&apos;entreprise
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                required
              />
            </div>
            <Button type="submit" variant="primary" size="lg" disabled={loading || !companyName}>
              {loading ? 'Création...' : 'Continuer vers paiement'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
