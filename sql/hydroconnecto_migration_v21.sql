-- HydroConnecto ERP Pro v2.1 - Migration Supabase
-- À exécuter une seule fois dans Supabase > SQL Editor > New query > Run.

-- Coordonnées officielles B HydroConnecto
update entreprises
set
  slogan = 'Spécialiste hydraulique, pneumatique et réparation d’engins',
  telephone = '+221 77 743 61 53',
  whatsapp = '+221 77 743 61 53',
  email = 'hydroconnecto-mig@gmail.com',
  adresse = 'Route de Mboro / Route de Thiès',
  ville = 'Thiès',
  pays = 'Sénégal',
  devise = 'FCFA'
where nom = 'B HydroConnecto';

-- Taxe en pourcentage pour devis/factures. La colonne taxe garde le montant calculé.
alter table devis add column if not exists taxe_pourcentage numeric(6,2);
alter table factures add column if not exists taxe_pourcentage numeric(6,2);

-- Informations enrichies pour la page équipe publique.
alter table equipe_site add column if not exists statut text default 'actif';
alter table equipe_site add column if not exists telephone text;
alter table equipe_site add column if not exists email text;
alter table equipe_site add column if not exists specialites text;
alter table equipe_site add column if not exists informations_personnelles text;

-- Membre directeur par défaut si l’équipe est vide.
insert into equipe_site (nom_complet, fonction, description, ordre, visible, statut, telephone, email, specialites)
select
  'Moustapha Gning',
  'Directeur / Responsable',
  'Responsable de B HydroConnecto, spécialiste hydraulique, pneumatique et réparation d’engins.',
  1,
  true,
  'actif',
  '+221 77 743 61 53',
  'hydroconnecto-mig@gmail.com',
  'Hydraulique, pneumatique, flexibles, engins lourds'
where not exists (select 1 from equipe_site where nom_complet = 'Moustapha Gning');
