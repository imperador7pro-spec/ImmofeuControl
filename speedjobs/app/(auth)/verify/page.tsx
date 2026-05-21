'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { verifyOtp } from '@/actions/auth';
import { Button } from '@/components/ui/Button';

function VerifyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const phone = searchParams.get('phone') || '';
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { userId, role, error } = await verifyOtp(phone, code);
    setLoading(false);
    if (error || !userId) {
      toast.error(error || 'Code invalide');
      return;
    }
    if (role === 'candidate') router.push('/candidate/home');
    else if (role === 'employer') router.push('/employer/dashboard');
    else router.push('/role');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-xl">
        <h1 className="text-2xl font-bold mb-2 text-center">Vérifier le code</h1>
        <p className="text-center text-gray-600 mb-6 text-sm">
          Code envoyé au <strong>{phone}</strong>
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Code SMS (6 chiffres)</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              maxLength={6}
              className="w-full px-4 py-3 border rounded-lg text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-600"
              required
              autoComplete="one-time-code"
            />
          </div>
          <Button type="submit" variant="primary" size="lg" disabled={loading || code.length < 6}>
            {loading ? 'Vérification...' : 'Vérifier'}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <VerifyForm />
    </Suspense>
  );
}
