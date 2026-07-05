-- HydroConnecto ERP Pro v2.2.2.8
-- Workflow intervention -> validation -> facture, acompte, espace client et cachet/signature.

create extension if not exists pgcrypto;

-- Prix par defaut demandes par le client.
update services
set prix_unitaire = 10000
where coalesce(prix_unitaire, 0) <> 10000;

update produits
set prix_unitaire = 15000
where coalesce(prix_unitaire, 0) <> 15000;

alter table interventions
  add column if not exists workflow_statut text default 'planifiee',
  add column if not exists lieu_intervention text,
  add column if not exists responsable_id uuid,
  add column if not exists rapport_responsable text,
  add column if not exists validation_admin_notes text,
  add column if not exists promotion_pourcentage numeric(6,2) default 0,
  add column if not exists date_debut_reelle timestamptz,
  add column if not exists date_fin_reelle timestamptz,
  add column if not exists valide_par text,
  add column if not exists valide_at timestamptz,
  add column if not exists facture_id uuid references factures(id) on delete set null;

create table if not exists intervention_work_steps (
  id uuid primary key default gen_random_uuid(),
  intervention_id uuid not null references interventions(id) on delete cascade,
  ordre integer not null default 1,
  service_id uuid references services(id) on delete set null,
  service_nom text not null,
  service_autre text,
  statut text not null default 'a_faire',
  produit_lignes jsonb not null default '[]'::jsonb,
  prix_service numeric(14,2) not null default 10000,
  remise_type text not null default 'montant',
  remise_valeur numeric(14,2) not null default 0,
  notes text,
  rapport text,
  photo_avant_url text,
  photo_avant_bucket text,
  photo_avant_path text,
  photo_apres_url text,
  photo_apres_bucket text,
  photo_apres_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_intervention_work_steps_intervention
  on intervention_work_steps(intervention_id, ordre);

create table if not exists erp_notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'info',
  cible_role text,
  cible_user_id uuid,
  cible_email text,
  cible_phone text,
  titre text not null,
  message text not null,
  data jsonb not null default '{}'::jsonb,
  lu boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_erp_notifications_role_read
  on erp_notifications(cible_role, lu, created_at desc);

create index if not exists idx_erp_notifications_user_read
  on erp_notifications(cible_user_id, lu, created_at desc);

create table if not exists client_portal_otps (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  telephone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_client_portal_otps_phone
  on client_portal_otps(telephone, created_at desc);

alter table factures
  add column if not exists date_limite_paiement date,
  add column if not exists acompte_initial numeric(14,2) default 0,
  add column if not exists lien_paiement text;

alter table paiements
  add column if not exists solde_apres_paiement numeric(14,2),
  add column if not exists origine text default 'admin';

alter table entreprises
  add column if not exists cachet_url text,
  add column if not exists cachet_bucket text,
  add column if not exists cachet_path text,
  add column if not exists signature_url text,
  add column if not exists signature_bucket text,
  add column if not exists signature_path text;

-- Permissions supplementaires liees au nouveau workflow.
insert into role_permissions (role, permission)
values
  ('administrateur','entreprise.update'),
  ('directeur','entreprise.update'),
  ('administrateur','notifications.view'),
  ('directeur','notifications.view'),
  ('responsable','notifications.view'),
  ('chef_atelier','notifications.view'),
  ('technicien','notifications.view'),
  ('comptable','notifications.view'),
  ('administrateur','interventions.validate'),
  ('directeur','interventions.validate'),
  ('responsable','interventions.validate'),
  ('comptable','interventions.generate_invoice'),
  ('administrateur','interventions.generate_invoice'),
  ('directeur','interventions.generate_invoice')
on conflict do nothing;
