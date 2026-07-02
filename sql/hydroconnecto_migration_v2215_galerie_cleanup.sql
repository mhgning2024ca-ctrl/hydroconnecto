-- HydroConnecto v2.2.1.5 — nettoyage galerie + colonnes média
-- À exécuter dans Supabase SQL Editor après la migration v2.2.1.4.

alter table galerie add column if not exists visible boolean default true;
alter table galerie add column if not exists bucket text;
alter table galerie add column if not exists chemin_storage text;
alter table galerie add column if not exists mime_type text;
alter table galerie add column if not exists taille_fichier bigint;
alter table galerie add column if not exists statut text default 'visible';

-- Retire de la galerie les anciennes images de démonstration / services / background importées depuis v2.2.
-- Les vrais fichiers uploadés dans Supabase Storage ne sont pas supprimés par cette requête.
delete from galerie
where
  coalesce(url, '') ilike '/assets/services/%'
  or coalesce(url, '') ilike '/assets/images/hero-accueil%'
  or coalesce(url, '') ilike '/assets/banner-hydroconnecto%'
  or lower(coalesce(titre, '')) in (
    'diagnostic',
    'confection de flexible',
    'installation hydraulique',
    'installation pneumatique',
    'main-d’œuvre',
    'main-d''œuvre',
    'maintenance corrective',
    'maintenance préventive',
    'maintenance preventive',
    'réparation de pompe',
    'reparation de pompe'
  );

-- Harmonise les statuts restants.
update galerie
set statut = case when visible is false then 'archive' else 'visible' end
where statut is null or statut = '';
