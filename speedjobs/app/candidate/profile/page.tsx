'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useUser } from '@/components/shared/SupabaseProvider';
import { supabase, getCandidate } from '@/lib/supabase';
import { updateCandidate } from '@/actions/candidate';
import { Header } from '@/components/shared/Header';
import { Button } from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';
import type { Candidate } from '@/types';

const SKILLS = [
  'Cuisinier',
  'Serveur',
  'Nettoyage',
  'Logistique',
  'Chauffeur',
  'Babysitter',
  'Construction',
];

export default function CandidateProfilePage() {
  const router = useRouter();
  const user = useUser();
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await getCandidate(user.id);
      if (data) {
        setCandidate(data);
        setName(data.name);
        setLocation(data.location);
        setSelectedSkills(data.skills);
      }
    })();
  }, [user]);

  const toggleSkill = (skill: string) =>
    setSelectedSkills((p) => (p.includes(skill) ? p.filter((s) => s !== skill) : [...p, skill]));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !candidate) return;
    setSaving(true);

    let photoUrl = candidate.photo_url;
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

    const { error } = await updateCandidate({
      name,
      location,
      skills: selectedSkills,
      photo_url: photoUrl,
    });
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success('Profil mis à jour');
    router.push('/candidate/home');
  };

  if (!candidate) return <PageSpinner />;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Mon profil" backHref="/candidate/home" />
      <main className="max-w-md mx-auto p-4">
        <form onSubmit={handleSave} className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
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
            <label className="block text-sm font-medium mb-2">Lieu</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Photo</label>
            {candidate.photo_url && (
              <img
                src={candidate.photo_url}
                alt="Profile"
                className="w-20 h-20 rounded-full object-cover mb-2"
              />
            )}
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
          <Button type="submit" variant="primary" size="lg" disabled={saving}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </form>
      </main>
    </div>
  );
}
