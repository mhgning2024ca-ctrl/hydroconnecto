-- HydroConnecto v2.2.2.2 — Rôles et permissions
-- À exécuter dans Supabase SQL Editor si la table role_permissions est absente ou incomplète.

create table if not exists role_permissions (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  permission text not null,
  created_at timestamptz default now(),
  unique(role, permission)
);

insert into role_permissions (role, permission) values
  ('super_administrateur','*'),

  ('administrateur','dashboard.view'),('administrateur','demandes_devis.*'),('administrateur','clients.*'),
  ('administrateur','engins.*'),('administrateur','produits.*'),('administrateur','services.*'),
  ('administrateur','interventions.*'),('administrateur','documents.*'),('administrateur','devis.*'),
  ('administrateur','factures.*'),('administrateur','paiements.*'),('administrateur','galerie.*'),
  ('administrateur','equipe.*'),('administrateur','journal.view'),('administrateur','users.*'),
  ('administrateur','exports.*'),('administrateur','entreprise.view'),

  ('directeur','dashboard.view'),('directeur','demandes_devis.*'),('directeur','clients.*'),
  ('directeur','engins.*'),('directeur','produits.*'),('directeur','services.*'),
  ('directeur','interventions.*'),('directeur','documents.*'),('directeur','devis.*'),
  ('directeur','factures.*'),('directeur','paiements.*'),('directeur','galerie.*'),
  ('directeur','equipe.*'),('directeur','journal.view'),('directeur','users.view'),
  ('directeur','users.create'),('directeur','users.approve'),('directeur','exports.*'),
  ('directeur','entreprise.view'),

  ('responsable','dashboard.view'),('responsable','demandes_devis.view'),('responsable','demandes_devis.update'),
  ('responsable','clients.*'),('responsable','engins.*'),('responsable','interventions.*'),
  ('responsable','devis.view'),('responsable','devis.create'),('responsable','devis.update'),
  ('responsable','galerie.view'),('responsable','entreprise.view'),

  ('comptable','dashboard.view'),('comptable','clients.view'),('comptable','documents.*'),
  ('comptable','devis.view'),('comptable','factures.*'),('comptable','paiements.*'),
  ('comptable','exports.*'),('comptable','entreprise.view'),

  ('chef_atelier','dashboard.view'),('chef_atelier','interventions.*'),('chef_atelier','engins.view'),
  ('chef_atelier','produits.view'),('chef_atelier','services.view'),('chef_atelier','equipe.view'),
  ('chef_atelier','entreprise.view'),

  ('technicien','dashboard.view'),('technicien','interventions.view'),('technicien','interventions.update'),
  ('technicien','interventions.update_status'),('technicien','engins.view'),('technicien','services.view'),
  ('technicien','entreprise.view'),

  ('magasinier_stock','dashboard.view'),('magasinier_stock','produits.*'),('magasinier_stock','services.view'),
  ('magasinier_stock','interventions.view'),('magasinier_stock','entreprise.view'),

  ('commercial','dashboard.view'),('commercial','demandes_devis.*'),('commercial','clients.view'),
  ('commercial','clients.create'),('commercial','devis.view'),('commercial','devis.create'),
  ('commercial','galerie.view'),('commercial','entreprise.view'),

  ('assistant_administratif','dashboard.view'),('assistant_administratif','demandes_devis.view'),
  ('assistant_administratif','clients.view'),('assistant_administratif','galerie.view'),
  ('assistant_administratif','equipe.view'),('assistant_administratif','entreprise.view'),

  ('lecture_seule','dashboard.view'),('lecture_seule','demandes_devis.view'),('lecture_seule','clients.view'),
  ('lecture_seule','engins.view'),('lecture_seule','produits.view'),('lecture_seule','services.view'),
  ('lecture_seule','interventions.view'),('lecture_seule','documents.view'),('lecture_seule','devis.view'),
  ('lecture_seule','factures.view'),('lecture_seule','paiements.view'),('lecture_seule','galerie.view'),
  ('lecture_seule','equipe.view'),('lecture_seule','entreprise.view')
on conflict (role, permission) do nothing;
