-- Seed de test pour SpeedJob's.
-- ATTENTION : à exécuter sur un projet Supabase de DEV uniquement.
-- Pré-requis : avoir créé 2 utilisateurs via /login (un candidat, un employeur)
-- puis remplacer les UUID ci-dessous par leurs ids auth.users.

-- Récupère les IDs :
--   select id, phone from auth.users;

-- ---------------------------------------------------------------------------
-- Remplacer ces variables AVANT d'exécuter :
-- ---------------------------------------------------------------------------
do $$
declare
  candidate_user_id uuid := '00000000-0000-0000-0000-000000000000'; -- TODO
  employer_user_id  uuid := '00000000-0000-0000-0000-000000000000'; -- TODO
  cand_id uuid;
  emp_id  uuid;
  job_id  uuid;
begin
  -- Candidat
  insert into public.candidates (user_id, phone, name, skills, location, online, rating, rating_count)
    values (candidate_user_id, '+41799999999', 'Alice', array['Cuisinier','Serveur'], 'Genève', true, 4.7, 12)
    on conflict (user_id) do update set name = excluded.name
    returning id into cand_id;

  -- Employeur
  insert into public.employers (user_id, company_name, phone, subscription_tier, posts_remaining)
    values (employer_user_id, 'Restaurant Test', '+41788888888', 'pro', 3)
    on conflict (user_id) do update set company_name = excluded.company_name
    returning id into emp_id;

  -- Job ouvert
  insert into public.jobs (employer_id, skill, location, tarif, start_time, end_time, details, status)
    values (
      emp_id,
      'Cuisinier',
      'Genève',
      35,
      now() + interval '2 hours',
      now() + interval '6 hours',
      'Service du soir, brigade complète',
      'open'
    )
    returning id into job_id;

  raise notice 'Seed OK : candidate=% employer=% job=%', cand_id, emp_id, job_id;
end $$;
