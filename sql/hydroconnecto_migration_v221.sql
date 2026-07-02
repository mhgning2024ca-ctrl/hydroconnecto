-- HydroConnecto ERP Pro v2.2.1
-- Correctifs : médias persistants Supabase Storage, utilisateurs/rôles/approbations, métadonnées fichiers, footer PDF, UI.

-- 1) Buckets Supabase Storage recommandés
insert into storage.buckets (id, name, public)
values
  ('galerie', 'galerie', true),
  ('interventions', 'interventions', true),
  ('demandes-devis', 'demandes-devis', true),
  ('equipe', 'equipe', true),
  ('documents', 'documents', true),
  ('factures', 'factures', true),
  ('devis', 'devis', true),
  ('recus', 'recus', true)
on conflict (id) do nothing;

-- 2) Métadonnées médias persistants
alter table if exists galerie add column if not exists bucket text;
alter table if exists galerie add column if not exists chemin_storage text;
alter table if exists galerie add column if not exists mime_type text;
alter table if exists galerie add column if not exists taille_fichier bigint;
alter table if exists galerie add column if not exists archive boolean default false;

alter table if exists demandes_devis add column if not exists audio_bucket text;
alter table if exists demandes_devis add column if not exists audio_path text;

alter table if exists equipe_site add column if not exists photo_bucket text;
alter table if exists equipe_site add column if not exists photo_path text;

alter table if exists medias_interventions add column if not exists bucket text;
alter table if exists medias_interventions add column if not exists chemin_storage text;
alter table if exists medias_interventions add column if not exists mime_type text;
alter table if exists medias_interventions add column if not exists taille_fichier bigint;

-- 3) Utilisateurs admin / rôles / approbation
create table if not exists utilisateurs_admin (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid references entreprises(id) on delete set null,
  nom_complet text not null,
  email text not null unique,
  role text not null default 'lecture_seule',
  statut text not null default 'en_attente',
  password_temp text,
  derniere_connexion timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint utilisateurs_admin_statut_check check (statut in ('en_attente','approuve','refuse','suspendu','desactive')),
  constraint utilisateurs_admin_role_check check (role in ('super_administrateur','administrateur','directeur','responsable','comptable','chef_atelier','technicien','magasinier_stock','commercial','assistant_administratif','lecture_seule'))
);

create table if not exists role_permissions (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  permission text not null,
  created_at timestamptz default now(),
  unique(role, permission)
);

insert into role_permissions (role, permission) values
  ('super_administrateur','*'),
  ('administrateur','clients.*'),('administrateur','engins.*'),('administrateur','produits.*'),('administrateur','services.*'),('administrateur','interventions.*'),('administrateur','documents.*'),('administrateur','galerie.*'),('administrateur','equipe.*'),('administrateur','journal.view'),('administrateur','users.approve'),
  ('directeur','clients.*'),('directeur','engins.*'),('directeur','produits.*'),('directeur','services.*'),('directeur','interventions.*'),('directeur','documents.*'),('directeur','galerie.*'),('directeur','equipe.*'),('directeur','journal.view'),
  ('responsable','clients.*'),('responsable','engins.*'),('responsable','interventions.*'),('responsable','devis.*'),('responsable','galerie.*'),
  ('comptable','documents.*'),('comptable','factures.*'),('comptable','recus.*'),('comptable','paiements.*'),('comptable','exports.*'),
  ('chef_atelier','interventions.*'),('chef_atelier','engins.view'),('chef_atelier','produits.view'),('chef_atelier','stock.view'),
  ('technicien','interventions.view'),('technicien','interventions.update_status'),('technicien','interventions.media'),('technicien','interventions.notes'),
  ('magasinier_stock','produits.*'),('magasinier_stock','stock.*'),('magasinier_stock','fournisseurs.*'),
  ('commercial','demandes_devis.*'),('commercial','clients.view'),('commercial','devis.create'),
  ('assistant_administratif','clients.view'),('assistant_administratif','demandes_devis.view'),('assistant_administratif','galerie.view'),
  ('lecture_seule','*.view')
on conflict (role, permission) do nothing;

-- 4) Journal plus complet
alter table if exists journal_actions add column if not exists utilisateur_email text;
alter table if exists journal_actions add column if not exists utilisateur_role text;
alter table if exists journal_actions add column if not exists ip text;
alter table if exists journal_actions add column if not exists user_agent text;

-- 5) Actions/archives cohérentes
alter table if exists clients add column if not exists actif boolean default true;
alter table if exists engins add column if not exists actif boolean default true;
alter table if exists services add column if not exists actif boolean default true;
alter table if exists produits add column if not exists actif boolean default true;

-- 6) Champs image des services si nécessaire
alter table if exists services add column if not exists image_url text;
alter table if exists services add column if not exists categorie text default 'Atelier / Terrain';
