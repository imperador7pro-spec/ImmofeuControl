'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';

export default function RolePage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-xl">
        <h1 className="text-2xl font-bold mb-6">Qui êtes-vous ?</h1>
        <div className="space-y-3">
          <Button onClick={() => router.push('/candidate/signup')} variant="primary" size="lg">
            Je cherche du travail
          </Button>
          <Button onClick={() => router.push('/employer/signup')} variant="secondary" size="lg">
            Je cherche des employés
          </Button>
        </div>
      </div>
    </div>
  );
}
