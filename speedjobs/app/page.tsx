import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 text-white">
      <div className="max-w-4xl mx-auto px-4 py-20">
        <h1 className="text-5xl md:text-6xl font-bold mb-4 text-center">SpeedJob&apos;s</h1>
        <p className="text-xl text-center text-blue-100 mb-8">
          Emplois d&apos;urgence en temps réel. Premier arrivé, premier servi.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12">
          <div className="bg-white/10 backdrop-blur p-8 rounded-2xl">
            <h2 className="text-2xl font-bold mb-4">Pour les candidats</h2>
            <p className="mb-6 text-blue-50">
              Trouvez des emplois urgents en 24-48h. Acceptez avec un simple tap.
              Gagnez de l&apos;argent rapide.
            </p>
            <Link href="/login">
              <Button variant="primary" size="lg">
                Je cherche du travail
              </Button>
            </Link>
          </div>
          <div className="bg-white/10 backdrop-blur p-8 rounded-2xl">
            <h2 className="text-2xl font-bold mb-4">Pour les employeurs</h2>
            <p className="mb-6 text-blue-50">
              Trouvez des remplaçants en minutes. Pas d&apos;urgence, pas de temps à perdre.
            </p>
            <Link href="/login">
              <Button variant="primary" size="lg">
                Je cherche des employés
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
