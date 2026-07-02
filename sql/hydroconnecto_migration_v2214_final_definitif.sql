-- HydroConnecto v2.2.1.4 FINAL DÉFINITIF
-- Migration complémentaire à exécuter dans Supabase SQL Editor.
-- Objectif : respecter les 8 images validées, les actions admin, l’archivage, le stockage durable et les corrections finales.

-- Colonnes d’archivage / statut / ordre / images
alter table if exists clients add column if not exists actif boolean default true;
alter table if exists clients add column if not exists statut text default 'actif';
alter table if exists engins add column if not exists actif boolean default true;
alter table if exists engins add column if not exists statut text default 'actif';
alter table if exists produits add column if not exists actif boolean default true;
alter table if exists produits add column if not exists statut text default 'actif';
alter table if exists services add column if not exists actif boolean default true;
alter table if exists services add column if not exists statut text default 'actif';
alter table if exists services add column if not exists image_url text;
alter table if exists services add column if not exists ordre integer default 0;
alter table if exists interventions add column if not exists statut text default 'planifiee';
alter table if exists galerie add column if not exists visible boolean default true;
alter table if exists galerie add column if not exists bucket text;
alter table if exists galerie add column if not exists chemin_storage text;
alter table if exists galerie add column if not exists mime_type text;
alter table if exists galerie add column if not exists taille_fichier bigint;
alter table if exists equipe_site add column if not exists statut text default 'actif';
alter table if exists equipe_site add column if not exists photo_bucket text;
alter table if exists equipe_site add column if not exists photo_path text;
alter table if exists demandes_devis add column if not exists statut text default 'nouvelle';
alter table if exists demandes_devis add column if not exists audio_url text;
alter table if exists demandes_devis add column if not exists audio_bucket text;
alter table if exists demandes_devis add column if not exists audio_path text;
alter table if exists demandes_devis add column if not exists updated_at timestamptz default now();

-- Interventions : plusieurs intervenants + pièces utilisées
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

-- Journal des actions
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

-- Utilisateurs / rôles / approbations
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
insert into role_permissions(role, permission) values
('super_administrateur','*'),
('administrateur','clients.view'),('administrateur','clients.create'),('administrateur','clients.update'),('administrateur','clients.archive'),('administrateur','clients.delete'),
('administrateur','engins.view'),('administrateur','engins.create'),('administrateur','engins.update'),('administrateur','engins.archive'),('administrateur','engins.delete'),
('administrateur','produits.view'),('administrateur','produits.create'),('administrateur','produits.update'),('administrateur','produits.archive'),('administrateur','produits.delete'),
('administrateur','services.view'),('administrateur','services.create'),('administrateur','services.update'),('administrateur','services.archive'),('administrateur','services.delete'),
('administrateur','galerie.view'),('administrateur','galerie.create'),('administrateur','galerie.update'),('administrateur','galerie.archive'),('administrateur','galerie.delete'),
('administrateur','demandes.view'),('administrateur','demandes.update'),('administrateur','demandes.archive'),('administrateur','demandes.delete'),
('administrateur','documents.view'),('administrateur','documents.update'),('administrateur','documents.archive'),('administrateur','documents.delete'),('administrateur','documents.pdf'),
('technicien','interventions.view'),('technicien','interventions.update'),('technicien','interventions.finish'),
('comptable','factures.view'),('comptable','factures.create'),('comptable','factures.update'),('comptable','factures.pdf'),('comptable','exports.view'),
('lecture_seule','clients.view'),('lecture_seule','interventions.view')
on conflict(role, permission) do nothing;

-- Métadonnées générales des fichiers uploadés
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

-- Buckets Supabase Storage durables
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

-- Fonction pour imposer les 8 services exacts et leurs images validées
create or replace function hydro_upsert_service(
  p_nom text,
  p_description text,
  p_image_url text,
  p_ordre integer
) returns void as $$
begin
  if exists (select 1 from services where lower(nom) = lower(p_nom)) then
    update services
    set description = p_description,
        unite = coalesce(unite, 'service'),
        prix_unitaire = coalesce(prix_unitaire, 0),
        actif = true,
        statut = 'actif',
        image_url = p_image_url,
        ordre = p_ordre
    where lower(nom) = lower(p_nom);
  else
    insert into services (nom, description, unite, prix_unitaire, actif, statut, image_url, ordre)
    values (p_nom, p_description, 'service', 0, true, 'actif', p_image_url, p_ordre);
  end if;
end;
$$ language plpgsql;

select hydro_upsert_service('Diagnostic','Diagnostic hydraulique ou pneumatique','/assets/services/diagnostic.png',1);
select hydro_upsert_service('Confection de flexible','Fabrication ou remplacement de flexible hydraulique','/assets/services/confection-flexible.png',2);
select hydro_upsert_service('Installation hydraulique','Installation de système hydraulique','/assets/services/installation-hydraulique.png',3);
select hydro_upsert_service('Installation pneumatique','Installation de système pneumatique','/assets/services/installation-pneumatique.png',4);
select hydro_upsert_service('Main-d’œuvre','Main-d’œuvre technicien','/assets/services/main-oeuvre.png',5);
select hydro_upsert_service('Maintenance corrective','Réparation après panne','/assets/services/maintenance-corrective.png',6);
select hydro_upsert_service('Maintenance préventive','Entretien périodique des engins et systèmes','/assets/services/maintenance-preventive.png',7);
select hydro_upsert_service('Réparation de pompe','Réparation de pompe hydraulique','/assets/services/reparation-pompe.png',8);

drop function if exists hydro_upsert_service(text, text, text, integer);
