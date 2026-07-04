-- HydroConnecto ERP Pro v2.2.2.7
-- Sécurité maximale, notifications WhatsApp, suivi paiements API.

create extension if not exists pgcrypto;

create table if not exists notification_logs (
  id uuid primary key default gen_random_uuid(),
  canal text not null default 'whatsapp',
  destinataire text,
  message text,
  statut text not null default 'ignore',
  meta jsonb default '{}'::jsonb,
  reponse jsonb,
  erreur text,
  created_at timestamptz default now()
);

create table if not exists payment_transactions (
  id uuid primary key default gen_random_uuid(),
  facture_id uuid references factures(id) on delete set null,
  paiement_id uuid references paiements(id) on delete set null,
  provider text not null default 'generic',
  external_reference text unique,
  montant numeric(14,2) not null default 0,
  devise text not null default 'FCFA',
  statut text not null default 'initie',
  request_payload jsonb default '{}'::jsonb,
  response_payload jsonb default '{}'::jsonb,
  webhook_payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_payment_transactions_facture on payment_transactions(facture_id);
create index if not exists idx_payment_transactions_reference on payment_transactions(external_reference);
create index if not exists idx_payment_transactions_statut on payment_transactions(statut);

create table if not exists payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'generic',
  external_reference text,
  event_type text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_payment_webhook_events_reference on payment_webhook_events(external_reference);

-- Stockage: seuls galerie/equipe/avatars restent publics.
-- Les vocaux de demandes et documents financiers doivent passer par le serveur authentifié.
insert into storage.buckets (id, name, public)
values
  ('galerie', 'galerie', true),
  ('equipe', 'equipe', true),
  ('avatars', 'avatars', true),
  ('demandes-devis', 'demandes-devis', false),
  ('documents', 'documents', false),
  ('factures', 'factures', false),
  ('devis', 'devis', false),
  ('recus', 'recus', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "HydroConnecto public read storage" on storage.objects;
drop policy if exists "HydroConnecto insert storage" on storage.objects;
drop policy if exists "HydroConnecto update storage" on storage.objects;
drop policy if exists "HydroConnecto delete storage" on storage.objects;
drop policy if exists "HydroConnecto public read avatars" on storage.objects;
drop policy if exists "HydroConnecto insert avatars" on storage.objects;
drop policy if exists "HydroConnecto update avatars" on storage.objects;

create policy "HydroConnecto public read safe media"
on storage.objects for select
using (bucket_id in ('galerie','equipe','avatars'));

create policy "HydroConnecto server insert storage"
on storage.objects for insert
with check (auth.role() = 'service_role' and bucket_id in ('galerie','equipe','avatars','demandes-devis','documents','factures','devis','recus'));

create policy "HydroConnecto server update storage"
on storage.objects for update
using (auth.role() = 'service_role' and bucket_id in ('galerie','equipe','avatars','demandes-devis','documents','factures','devis','recus'))
with check (auth.role() = 'service_role' and bucket_id in ('galerie','equipe','avatars','demandes-devis','documents','factures','devis','recus'));

create policy "HydroConnecto server delete storage"
on storage.objects for delete
using (auth.role() = 'service_role' and bucket_id in ('galerie','equipe','avatars','demandes-devis','documents','factures','devis','recus'));
