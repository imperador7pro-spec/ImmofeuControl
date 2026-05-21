'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { createJob } from '@/actions/employer';
import { Header } from '@/components/shared/Header';
import { Button } from '@/components/ui/Button';

const SKILLS = [
  'Cuisinier',
  'Serveur',
  'Nettoyage',
  'Logistique',
  'Chauffeur',
  'Babysitter',
  'Construction',
];

export default function CreateJobPage() {
  const router = useRouter();
  const [skill, setSkill] = useState('');
  const [location, setLocation] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [tarif, setTarif] = useState('');
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { jobId, error } = await createJob({
      skill,
      location,
      start_time: new Date(startTime).toISOString(),
      end_time: new Date(endTime).toISOString(),
      tarif: parseInt(tarif, 10),
      details: details || null,
    });
    setLoading(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success('Urgence publiée — candidats notifiés');
    if (jobId) router.push(`/employer/job/${jobId}`);
    else router.push('/employer/dashboard');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Nouvelle urgence" backHref="/employer/dashboard" />
      <main className="max-w-md mx-auto p-4">
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl p-6 shadow-sm space-y-4"
        >
          <div>
            <label className="block text-sm font-medium mb-2">Métier</label>
            <select
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              required
            >
              <option value="">Sélectionner...</option>
              {SKILLS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Lieu</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Genève"
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-2">Début</label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Fin</label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Tarif (CHF/h)</label>
            <input
              type="number"
              min={1}
              value={tarif}
              onChange={(e) => setTarif(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Détails</label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Détails du job..."
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              rows={3}
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={loading || !skill || !location || !startTime || !endTime || !tarif}
          >
            {loading ? 'Publication...' : 'Publier'}
          </Button>
        </form>
      </main>
    </div>
  );
}
