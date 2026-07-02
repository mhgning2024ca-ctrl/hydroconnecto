-- HydroConnecto v2.2.1.6 — nettoyage galerie + colonnes nécessaires
-- Objectif : retirer les anciennes images de démonstration v2.2/v2.2.1 de la galerie.

alter table if exists galerie add column if not exists visible boolean default true;
alter table if exists galerie add column if not exists bucket text;
alter table if exists galerie add column if not exists chemin_storage text;
alter table if exists galerie add column if not exists mime_type text;
alter table if exists galerie add column if not exists taille_fichier bigint;

-- Suppression des anciens médias qui ne sont pas de vrais uploads galerie.
delete from galerie
where
  nullif(trim(coalesce(url, '')), '') is null
  or lower(coalesce(url, '')) like '%/assets/services/%'
  or lower(coalesce(url, '')) like '%/assets/images/hero-accueil%'
  or lower(coalesce(url, '')) like '%/assets/banner-hydroconnecto%'
  or lower(coalesce(url, '')) like '%banner-hydroconnecto%'
  or lower(coalesce(titre, '')) in (
    'diagnostic',
    'confection de flexible',
    'réparation de pompe',
    'reparation de pompe',
    'maintenance corrective',
    'maintenance préventive',
    'maintenance preventive',
    'main-d’œuvre',
    'main-d’oeuvre',
    'main-d''oeuvre',
    'installation hydraulique',
    'installation pneumatique',
    'a changer',
    'à changer'
  );

-- Les médias restants restent visibles sauf s'ils avaient déjà été archivés explicitement.
update galerie set visible = true where visible is null;
