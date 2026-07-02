-- HydroConnecto ERP Pro v2.2.2.4
-- Workflow, accès supplémentaires par utilisateur, profil, fournisseurs et commandes fournisseurs.
-- À exécuter dans Supabase SQL Editor avant les tests complets.

create extension if not exists pgcrypto;

alter table if exists utilisateurs_admin
  add column if not exists telephone text,
  add column if not exists adresse text,
  add column if not exists photo_url text,
  add column if not exists photo_bucket text,
  add column if not exists photo_path text,
  add column if not exists permissions_extra jsonb default '[]'::jsonb,
  add column if not exists must_change_password boolean default true,
  add column if not exists derniere_connexion timestamptz;

create table if not exists utilisateur_permissions_extra (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references utilisateurs_admin(id) on delete cascade,
  module text,
  permission text not null,
  motif text,
  date_debut timestamptz,
  date_fin timestamptz,
  actif boolean default true,
  ajoute_par text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_utilisateur_permissions_extra_user on utilisateur_permissions_extra(user_id);
create index if not exists idx_utilisateur_permissions_extra_permission on utilisateur_permissions_extra(permission);

create table if not exists fournisseurs (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  contact text,
  telephone text,
  email text,
  adresse text,
  statut text default 'actif',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists commandes_fournisseurs (
  id uuid primary key default gen_random_uuid(),
  numero text unique,
  fournisseur_id uuid references fournisseurs(id) on delete set null,
  statut text default 'brouillon',
  date_commande date default current_date,
  date_livraison_prevue date,
  date_livraison_reelle date,
  lignes jsonb default '[]'::jsonb,
  total numeric default 0,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

insert into role_permissions (role, permission) values
  ('super_administrateur','*'),

  ('administrateur','fournisseurs.*'),
  ('administrateur','commandes_fournisseurs.*'),
  ('administrateur','dashboard.finance'),
  ('administrateur','dashboard.stock'),
  ('administrateur','dashboard.demandes'),
  ('administrateur','dashboard.interventions'),
  ('administrateur','profile.*'),

  ('directeur','fournisseurs.*'),
  ('directeur','commandes_fournisseurs.*'),
  ('directeur','dashboard.finance'),
  ('directeur','dashboard.stock'),
  ('directeur','dashboard.demandes'),
  ('directeur','dashboard.interventions'),
  ('directeur','profile.*'),

  ('comptable','dashboard.finance'),
  ('comptable','fournisseurs.view'),
  ('comptable','commandes_fournisseurs.view'),
  ('comptable','profile.*'),

  ('chef_atelier','dashboard.interventions'),
  ('chef_atelier','dashboard.stock'),
  ('chef_atelier','profile.*'),

  ('technicien','dashboard.interventions'),
  ('technicien','interventions.view_assigned'),
  ('technicien','interventions.add_report'),
  ('technicien','profile.*'),

  ('magasinier_stock','dashboard.stock'),
  ('magasinier_stock','fournisseurs.view'),
  ('magasinier_stock','commandes_fournisseurs.view'),
  ('magasinier_stock','commandes_fournisseurs.receive'),
  ('magasinier_stock','profile.*'),

  ('assistant_administratif','dashboard.demandes'),
  ('assistant_administratif','profile.*'),

  ('commercial','dashboard.demandes'),
  ('commercial','profile.*'),

  ('lecture_seule','profile.view')
on conflict (role, permission) do nothing;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "HydroConnecto public read avatars" on storage.objects;
drop policy if exists "HydroConnecto insert avatars" on storage.objects;
drop policy if exists "HydroConnecto update avatars" on storage.objects;

create policy "HydroConnecto public read avatars"
on storage.objects for select
using (bucket_id = 'avatars');

create policy "HydroConnecto insert avatars"
on storage.objects for insert
with check (bucket_id = 'avatars');

create policy "HydroConnecto update avatars"
on storage.objects for update
using (bucket_id = 'avatars')
with check (bucket_id = 'avatars');
