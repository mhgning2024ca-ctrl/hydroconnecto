-- HydroConnecto v2.2.2.1 — Supabase Storage pour médias persistants
-- À exécuter dans Supabase SQL Editor si les images/vidéos uploadées ne s’affichent pas après reconnexion.
-- Option professionnelle recommandée : utiliser SUPABASE_SERVICE_ROLE_KEY dans .env du serveur.

insert into storage.buckets (id, name, public)
values
  ('galerie', 'galerie', true),
  ('equipe', 'equipe', true),
  ('demandes-devis', 'demandes-devis', true),
  ('documents', 'documents', true),
  ('factures', 'factures', true),
  ('devis', 'devis', true),
  ('recus', 'recus', true)
on conflict (id) do update set public = true;

drop policy if exists "HydroConnecto public read storage" on storage.objects;
drop policy if exists "HydroConnecto insert storage" on storage.objects;
drop policy if exists "HydroConnecto update storage" on storage.objects;
drop policy if exists "HydroConnecto delete storage" on storage.objects;

create policy "HydroConnecto public read storage"
on storage.objects for select
using (bucket_id in ('galerie','equipe','demandes-devis','documents','factures','devis','recus'));

create policy "HydroConnecto insert storage"
on storage.objects for insert
with check (bucket_id in ('galerie','equipe','demandes-devis','documents','factures','devis','recus'));

create policy "HydroConnecto update storage"
on storage.objects for update
using (bucket_id in ('galerie','equipe','demandes-devis','documents','factures','devis','recus'))
with check (bucket_id in ('galerie','equipe','demandes-devis','documents','factures','devis','recus'));

create policy "HydroConnecto delete storage"
on storage.objects for delete
using (bucket_id in ('galerie','equipe','demandes-devis','documents','factures','devis','recus'));
