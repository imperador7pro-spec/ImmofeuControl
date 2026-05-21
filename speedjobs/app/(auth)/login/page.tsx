'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { signInWithPhone } from '@/actions/auth';
import { Button } from '@/components/ui/Button';

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.startsWith('+')) {
      toast.error("Le numéro doit commencer par '+' (ex: +41799999999)");
      return;
    }
    setLoading(true);
    const { error } = await signInWithPhone(phone);
    setLoading(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success('Code SMS envoyé');
    router.push(`/verify?phone=${encodeURIComponent(phone)}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-xl">
        <h1 className="text-3xl font-bold mb-2 text-center">SpeedJob&apos;s</h1>
        <p className="text-gray-600 text-center mb-6">
          Emplois d&apos;urgence en temps réel
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Numéro de téléphone</label>
            <input
              type="tel"
              placeholder="+41799999999"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              required
              autoComplete="tel"
            />
          </div>
          <Button type="submit" variant="primary" size="lg" disabled={loading}>
            {loading ? 'Envoi...' : 'Envoyer code SMS'}
          </Button>
        </form>
      </div>
    </div>
  );
}
