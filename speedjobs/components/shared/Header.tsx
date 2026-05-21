'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut } from '@/actions/auth';

interface HeaderProps {
  title?: string;
  backHref?: string;
  showSignOut?: boolean;
}

export function Header({ title = "SpeedJob's", backHref, showSignOut = false }: HeaderProps) {
  const router = useRouter();
  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };
  return (
    <header className="bg-white border-b sticky top-0 z-10">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {backHref && (
            <Link href={backHref} className="text-blue-600 text-xl">
              ←
            </Link>
          )}
          <h1 className="font-bold text-lg">{title}</h1>
        </div>
        {showSignOut && (
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Déconnexion
          </button>
        )}
      </div>
    </header>
  );
}
