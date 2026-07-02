-- HydroConnecto ERP Pro v2.2 - Migration Supabase
-- À exécuter après le script initial et après la migration v2.1.
-- Supabase > SQL Editor > New query > Run

create extension if not exists "uuid-ossp";

-- 1) Nom et coordonnées officiels
update entreprises
set
  nom = 'HydroConnecto',
  slogan = 'Spécialiste hydraulique, pneumatique et réparation d’engins',
  telephone = '+221 77 743 61 53',
  whatsapp = '+221 77 743 61 53',
  email = 'hydroconnecto-mig@gmail.com',
  adresse = 'Route de Mboro / Route de Thiès',
  ville = 'Thiès',
  pays = 'Sénégal',
  devise = 'FCFA',
  logo_url = '/assets/logo-hydroconnecto.png'
where nom in ('B HydroConnecto', 'HydroConnecto');

insert into entreprises (nom, slogan, telephone, whatsapp, email, adresse, ville, pays, devise, logo_url)
select 'HydroConnecto', 'Spécialiste hydraulique, pneumatique et réparation d’engins', '+221 77 743 61 53', '+221 77 743 61 53', 'hydroconnecto-mig@gmail.com', 'Route de Mboro / Route de Thiès', 'Thiès', 'Sénégal', 'FCFA', '/assets/logo-hydroconnecto.png'
where not exists (select 1 from entreprises where nom = 'HydroConnecto');

-- 2) Statuts intervention enrichis pour la gestion opérationnelle
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'statut_intervention') THEN
    ALTER TYPE statut_intervention ADD VALUE IF NOT EXISTS 'planifiee';
    ALTER TYPE statut_intervention ADD VALUE IF NOT EXISTS 'assignee';
    ALTER TYPE statut_intervention ADD VALUE IF NOT EXISTS 'debut_intervention';
    ALTER TYPE statut_intervention ADD VALUE IF NOT EXISTS 'pause';
    ALTER TYPE statut_intervention ADD VALUE IF NOT EXISTS 'fin_intervention';
  END IF;
END $$;

-- 3) Demandes de devis publiques, avec texte + audio/vocal
create table if not exists demandes_devis (
  id uuid primary key default uuid_generate_v4(),
  entreprise_id uuid references entreprises(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  nom_complet text not null,
  telephone text not null,
  besoin text,
  audio_url text,
  statut text not null default 'nouvelle',
  notes_admin text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_demandes_devis_statut on demandes_devis(statut);
create index if not exists idx_demandes_devis_created_at on demandes_devis(created_at desc);

-- 4) Colonnes manquantes pour équipe publique/admin/intervenants
alter table equipe_site add column if not exists entreprise_id uuid references entreprises(id) on delete cascade;
alter table equipe_site add column if not exists statut text default 'actif';
alter table equipe_site add column if not exists telephone text;
alter table equipe_site add column if not exists email text;
alter table equipe_site add column if not exists specialites text;
alter table equipe_site add column if not exists informations_personnelles text;

update equipe_site
set entreprise_id = (select id from entreprises where nom = 'HydroConnecto' limit 1)
where entreprise_id is null;

insert into equipe_site (entreprise_id, nom_complet, fonction, description, ordre, visible, statut, telephone, email, specialites)
select
  (select id from entreprises where nom = 'HydroConnecto' limit 1),
  'Moustapha Gning',
  'Directeur',
  'Responsable de HydroConnecto, spécialiste hydraulique, pneumatique et réparation d’engins.',
  1,
  true,
  'actif',
  '+221 77 743 61 53',
  'hydroconnecto-mig@gmail.com',
  'Hydraulique, pneumatique, flexibles, engins lourds'
where not exists (select 1 from equipe_site where nom_complet = 'Moustapha Gning');

-- 5) Plusieurs intervenants par intervention
create table if not exists intervention_intervenants (
  id uuid primary key default uuid_generate_v4(),
  intervention_id uuid references interventions(id) on delete cascade,
  equipe_id uuid references equipe_site(id) on delete set null,
  role_intervention text,
  statut_intervention text default 'assigne',
  date_debut timestamptz,
  date_fin timestamptz,
  notes text,
  created_at timestamptz default now()
);
create index if not exists idx_intervention_intervenants_intervention on intervention_intervenants(intervention_id);
create index if not exists idx_intervention_intervenants_equipe on intervention_intervenants(equipe_id);

-- 6) Pièces/produits utilisés pendant une intervention + lien stock/facture
create table if not exists intervention_pieces (
  id uuid primary key default uuid_generate_v4(),
  intervention_id uuid references interventions(id) on delete cascade,
  produit_id uuid references produits(id) on delete set null,
  quantite numeric(12,2) not null default 1,
  prix_unitaire numeric(12,2) not null default 0,
  total numeric(12,2) generated always as (quantite * prix_unitaire) stored,
  notes text,
  created_at timestamptz default now()
);
create index if not exists idx_intervention_pieces_intervention on intervention_pieces(intervention_id);
create index if not exists idx_intervention_pieces_produit on intervention_pieces(produit_id);

-- 7) Taxe en pourcentage pour devis/factures
alter table devis add column if not exists taxe_pourcentage numeric(6,2);
alter table factures add column if not exists taxe_pourcentage numeric(6,2);

-- 8) Journal des actions enrichi
alter table journal_actions add column if not exists utilisateur_nom text;
alter table journal_actions add column if not exists utilisateur_role text;
alter table journal_actions add column if not exists utilisateur_email text;
create index if not exists idx_journal_actions_created_at on journal_actions(created_at desc);
create index if not exists idx_journal_actions_table on journal_actions(table_concernee);

-- 9) Colonnes de base utiles pour archivage/tri si absentes
alter table services add column if not exists actif boolean default true;
alter table produits add column if not exists actif boolean default true;
alter table clients add column if not exists actif boolean default true;
alter table engins add column if not exists actif boolean default true;

-- 10) Produits/articles utiles pour démarrage stock HydroConnecto
insert into categories_produits (entreprise_id, nom, description, actif)
select (select id from entreprises where nom='HydroConnecto' limit 1), 'Hydraulique', 'Flexibles, raccords, joints et accessoires hydrauliques', true
where not exists (select 1 from categories_produits where nom = 'Hydraulique');

insert into categories_produits (entreprise_id, nom, description, actif)
select (select id from entreprises where nom='HydroConnecto' limit 1), 'Pneumatique', 'Accessoires et composants pneumatiques', true
where not exists (select 1 from categories_produits where nom = 'Pneumatique');

insert into produits (entreprise_id, categorie_id, nom, description, unite, prix_unitaire, cout_achat, quantite_stock, stock_minimum, actif)
select (select id from entreprises where nom='HydroConnecto' limit 1), (select id from categories_produits where nom='Hydraulique' limit 1), x.nom, x.description, x.unite, 0, 0, 0, 0, true
from (values
  ('Flexible hydraulique 1/2', 'Flexible hydraulique diamètre 1/2', 'mètre'),
  ('Flexible hydraulique 3/4', 'Flexible hydraulique diamètre 3/4', 'mètre'),
  ('Flexible hydraulique 1"', 'Flexible hydraulique diamètre 1 pouce', 'mètre'),
  ('Raccord droit', 'Raccord hydraulique droit', 'unité'),
  ('Raccord coudé', 'Raccord hydraulique coudé', 'unité'),
  ('Adaptateur hydraulique', 'Adaptateur pour connexion hydraulique', 'unité'),
  ('Garniture', 'Garniture hydraulique', 'unité'),
  ('Joint hydraulique', 'Joint hydraulique', 'unité'),
  ('Huile hydraulique', 'Huile pour système hydraulique', 'litre'),
  ('Accessoire pneumatique', 'Accessoire pneumatique', 'unité'),
  ('Frein et disque', 'Disques/freins et éléments associés', 'unité')
) as x(nom, description, unite)
where not exists (select 1 from produits p where p.nom = x.nom);
