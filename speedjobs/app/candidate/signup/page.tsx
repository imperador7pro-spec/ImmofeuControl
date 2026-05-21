'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useUser } from '@/components/shared/SupabaseProvider';
import { supabase } from '@/lib/supabase';
import { createCandidate } from '@/actions/candidate';
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

export default function CandidateSignupPage() {
  const router = useRouter();
  const user = useUser();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const toggleSkill = (skill: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('Veuillez vous reconnecter');
      router.push('/login');
      return;
    }
    setLoading(true);

    let photoUrl: string | null = null;
    if (photo) {
      const path = `${user.id}/${Date.now()}-${photo.name}`;
      const { error: uploadError } = await supabase.storage
        .from('candidate-photos')
        .upload(path, photo, { upsert: true });
      if (!uploadError) {
        const {
          data: { publicUrl },
        } = supabase.storage.from('candidate-photos').getPublicUrl(path);
        photoUrl = publicUrl;
      }
    }

    const { error } = await createCandidate({
      name,
      phone: user.phone || '',
      location,
      skills: selectedSkills,
      photo_url: photoUrl,
    });

    setLoading(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success('Profil créé !');
    router.push('/candidate/home');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto mt-8 bg-white rounded-2xl p-6 shadow">
        <h1 className="text-2xl font-bold mb-6">Créer mon profil</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Prénom</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Lieu (Ville)</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Genève"
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Photo (optionnelle)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPhoto(e.target.files?.[0] || null)}
              className="w-full text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-3">Compétences</label>
            <div className="grid grid-cols-2 gap-2">
              {SKILLS.map((skill) => (
                <button
                  type="button"
                  key={skill}
                  onClick={() => toggleSkill(skill)}
                  className={`px-3 py-2 rounded-lg text-sm border transition ${
                    selectedSkills.includes(skill)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {skill}
                </button>
              ))}
            </div>
          </div>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={loading || !name || !location || selectedSkills.length === 0}
          >
            {loading ? 'Création...' : 'Créer mon profil'}
          </Button>
        </form>
      </div>
    </div>
  );
}
