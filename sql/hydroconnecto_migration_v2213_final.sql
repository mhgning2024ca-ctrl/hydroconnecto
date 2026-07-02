-- HydroConnecto v2.2.1.3 FINAL - migration complémentaire
-- À exécuter dans Supabase SQL Editor après les migrations v2.1, v2.2 et v2.2.1 si nécessaire.

-- 1) Archivage / statut sur modules principaux
alter table if exists clients add column if not exists actif boolean default true;
alter table if exists clients add column if not exists statut text default 'actif';
alter table if exists engins add column if not exists actif boolean default true;
alter table if exists engins add column if not exists statut text default 'actif';
alter table if exists produits add column if not exists actif boolean default true;
alter table if exists produits add column if not exists statut text default 'actif';
alter table if exists services add column if not exists actif boolean default true;
alter table if exists services add column if not exists statut text default 'actif';
alter table if exists interventions add column if not exists statut text default 'planifiee';
alter table if exists galerie add column if not exists visible boolean default true;
alter table if exists galerie add column if not exists bucket text;
alter table if exists galerie add column if not exists chemin_storage text;
alter table if exists galerie add column if not exists mime_type text;
alter table if exists galerie add column if not exists taille_fichier bigint;
alter table if exists equipe_site add column if not exists statut text default 'actif';
alter table if exists equipe_site add column if not exists photo_bucket text;
alter table if exists equipe_site add column if not exists photo_path text;

-- 2) Demandes de devis : audio durable + statut
alter table if exists demandes_devis add column if not exists statut text default 'nouvelle';
alter table if exists demandes_devis add column if not exists audio_url text;
alter table if exists demandes_devis add column if not exists audio_bucket text;
alter table if exists demandes_devis add column if not exists audio_path text;
alter table if exists demandes_devis add column if not exists updated_at timestamptz default now();

-- 3) Interventions : plusieurs intervenants + pièces utilisées
create table if not exists intervention_intervenants (
  id uuid primary key default gen_random_uuid(),
  intervention_id uuid references interventions(id) on delete cascade,
  employe_id uuid references equipe_site(id) on delete set null,
  role_intervention text,
  statut_intervention text default 'assigne',
  date_debut timestamptz,
  date_fin timestamptz,
  notes text,
  created_at timestamptz default now()
);

create table if not exists intervention_pieces (
  id uuid primary key default gen_random_uuid(),
  intervention_id uuid references interventions(id) on delete cascade,
  produit_id uuid references produits(id) on delete set null,
  quantite numeric(12,2) default 0,
  prix_unitaire numeric(12,2) default 0,
  notes text,
  created_at timestamptz default now()
);

-- 4) Journal des actions
create table if not exists journal_actions (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid,
  utilisateur_nom text,
  utilisateur_role text,
  utilisateur_email text,
  action text not null,
  table_concernee text,
  enregistrement_id uuid,
  details jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- 5) Utilisateurs / rôles / approbations
create table if not exists utilisateurs_admin (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid,
  nom_complet text not null,
  email text unique not null,
  role text default 'lecture_seule',
  statut text default 'en_attente',
  password_temp text,
  derniere_connexion timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists role_permissions (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  permission text not null,
  created_at timestamptz default now(),
  unique(role, permission)
);

-- Permissions de base utiles
insert into role_permissions(role, permission) values
('super_administrateur','*'),
('administrateur','clients.view'),('administrateur','clients.create'),('administrateur','clients.update'),('administrateur','clients.archive'),('administrateur','clients.delete'),
('administrateur','engins.view'),('administrateur','engins.create'),('administrateur','engins.update'),('administrateur','engins.archive'),('administrateur','engins.delete'),
('administrateur','services.view'),('administrateur','services.create'),('administrateur','services.update'),('administrateur','services.archive'),('administrateur','services.delete'),
('administrateur','galerie.view'),('administrateur','galerie.create'),('administrateur','galerie.update'),('administrateur','galerie.archive'),('administrateur','galerie.delete'),
('technicien','interventions.view'),('technicien','interventions.update'),('technicien','interventions.finish'),
('comptable','factures.view'),('comptable','factures.create'),('comptable','factures.pdf'),('comptable','exports.view'),
('lecture_seule','clients.view'),('lecture_seule','interventions.view')
on conflict(role, permission) do nothing;

-- 6) Métadonnées générales des fichiers uploadés
create table if not exists fichiers_uploades (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid,
  module text,
  module_id uuid,
  titre text,
  type_fichier text,
  bucket text,
  chemin_storage text,
  url text,
  mime_type text,
  taille_fichier bigint,
  visible boolean default true,
  archive boolean default false,
  created_at timestamptz default now()
);

-- 7) Buckets Supabase Storage recommandés
insert into storage.buckets (id, name, public) values
('galerie','galerie', true),
('interventions','interventions', true),
('demandes-devis','demandes-devis', true),
('equipe','equipe', true),
('documents','documents', true),
('factures','factures', true),
('devis','devis', true),
('recus','recus', true)
on conflict (id) do nothing;

-- 8) Services exacts publics, pour garder l'ordre souhaité dans la base aussi
alter table if exists services add column if not exists image_url text;
alter table if exists services add column if not exists ordre integer default 0;

insert into services (nom, description, unite, prix_unitaire, actif, statut, image_url, ordre)
values
('Diagnostic','Diagnostic hydraulique ou pneumatique','service',0,true,'actif','/assets/services/diagnostic.png',1),
('Confection de flexible','Fabrication ou remplacement de flexible hydraulique','service',0,true,'actif','/assets/services/confection-flexible.png',2),
('Réparation de pompe','Réparation de pompe hydraulique','service',0,true,'actif','/assets/services/reparation-pompe.png',3),
('Maintenance corrective','Réparation après panne','service',0,true,'actif','/assets/services/maintenance-corrective.png',4),
('Maintenance préventive','Entretien périodique des engins et systèmes','service',0,true,'actif','/assets/services/maintenance-preventive.png',5),
('Main-d’œuvre','Main-d’œuvre technicien','service',0,true,'actif','/assets/services/main-oeuvre.png',6),
('Installation hydraulique','Installation de système hydraulique','service',0,true,'actif','/assets/services/installation-hydraulique.png',7),
('Installation pneumatique','Installation de système pneumatique','service',0,true,'actif','/assets/services/installation-pneumatique.png',8)
on conflict do nothing;
