-- Review and apply after 002_branches.sql (and 003_personnel_roles.sql).
-- Schema and RLS for Gateways, Pairing Claims, Devices, Discoveries, and Telemetry Observations.

begin;

create table if not exists public.gateways (
    id uuid primary key,
    organization_id uuid not null references public.organizations(id) on delete cascade,
    branch_id uuid not null references public.branches(id) on delete cascade,
    credential_verifier varchar(128) not null,
    status varchar(32) not null check (status in ('awaiting_confirmation', 'active', 'replaced', 'revoked')),
    label varchar(120) not null default 'Pi 5 Gateway',
    firmware_version varchar(64) null,
    config_revision int not null default 1,
    last_contact_at timestamptz null,
    last_sync_at timestamptz null,
    revoked_at timestamptz null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists unique_active_gateway_per_branch
    on public.gateways (branch_id)
    where status = 'active';

create unique index if not exists unique_gateway_credential
    on public.gateways (credential_verifier);

create unique index if not exists unique_gateway_binding_key
    on public.gateways (id, branch_id, organization_id);

alter table public.gateways add constraint gateways_branch_organization_fk
    foreign key (branch_id, organization_id) references public.branches(id, organization_id);

create index if not exists idx_gateways_org_branch
    on public.gateways (organization_id, branch_id);

create table if not exists public.gateway_claims (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    branch_id uuid not null references public.branches(id) on delete cascade,
    code_hash varchar(128) not null,
    status varchar(32) not null check (status in ('issued', 'redeemed_pending', 'confirmed', 'expired', 'cancelled')),
    verification_fingerprint varchar(16) null,
    gateway_id uuid null references public.gateways(id) on delete set null,
    replace_gateway_id uuid null references public.gateways(id) on delete set null,
    issued_by uuid not null references public.profiles(user_id) on delete restrict,
    confirmed_by uuid null references public.profiles(user_id) on delete restrict,
    failed_attempts int not null default 0,
    expires_at timestamptz not null,
    confirmation_expires_at timestamptz null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists unique_unconfirmed_claim_per_branch
    on public.gateway_claims (branch_id)
    where status in ('issued', 'redeemed_pending');

create unique index if not exists unique_gateway_claim_code
    on public.gateway_claims (code_hash);

alter table public.gateway_claims add constraint gateway_claims_branch_organization_fk
    foreign key (branch_id, organization_id) references public.branches(id, organization_id);

create index if not exists idx_gateway_claims_lookup
    on public.gateway_claims (branch_id, status);

-- Shared rate limit for public pairing-code redemption across API workers.
create table if not exists public.gateway_claim_attempts (
    client_key varchar(64) primary key,
    attempts int not null default 0,
    window_started_at timestamptz not null default now(),
    last_attempt_at timestamptz not null default now()
);

create index if not exists idx_gateway_claim_attempts_last
    on public.gateway_claim_attempts (last_attempt_at);

create table if not exists public.devices (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    branch_id uuid not null references public.branches(id) on delete cascade,
    gateway_id uuid not null references public.gateways(id) on delete cascade,
    source_id varchar(100) not null,
    device_type varchar(32) not null check (device_type in ('lpg_edge_node', 'washer', 'dryer', 'washer_dryer')),
    source_kind varchar(32) not null check (source_kind in ('physical', 'simulated', 'vendor')),
    label varchar(120) not null,
    status varchar(32) not null default 'active' check (status in ('active', 'retired', 'maintenance')),
    capacity_kg numeric(5,2) null,
    capabilities jsonb not null default '{}'::jsonb,
    approved_by uuid not null references public.profiles(user_id) on delete restrict,
    approved_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists unique_active_device_per_branch
    on public.devices (branch_id, source_id)
    where status = 'active';

create unique index if not exists unique_device_binding_key
    on public.devices (id, gateway_id, branch_id, organization_id);

alter table public.devices add constraint devices_gateway_binding_fk
    foreign key (gateway_id, branch_id, organization_id)
    references public.gateways(id, branch_id, organization_id);

create index if not exists idx_devices_org_branch
    on public.devices (organization_id, branch_id);

create table if not exists public.device_discoveries (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    branch_id uuid not null references public.branches(id) on delete cascade,
    gateway_id uuid not null references public.gateways(id) on delete cascade,
    candidate_id uuid not null,
    source_id varchar(100) not null,
    proposed_type varchar(32) null,
    evidence_quality jsonb not null default '{}'::jsonb,
    first_seen_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    decision varchar(32) not null default 'pending' check (decision in ('pending', 'approved', 'rejected')),
    decided_by uuid null references public.profiles(user_id) on delete restrict,
    decided_at timestamptz null,
    device_id uuid null references public.devices(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists unique_pending_discovery_per_gateway
    on public.device_discoveries (gateway_id, source_id)
    where decision = 'pending';

create unique index if not exists unique_discovery_candidate_per_gateway
    on public.device_discoveries (gateway_id, candidate_id);

alter table public.device_discoveries add constraint discoveries_gateway_binding_fk
    foreign key (gateway_id, branch_id, organization_id)
    references public.gateways(id, branch_id, organization_id);

create index if not exists idx_device_discoveries_branch
    on public.device_discoveries (branch_id, decision);

create table if not exists public.telemetry_observations (
    id bigserial primary key,
    organization_id uuid not null references public.organizations(id) on delete cascade,
    branch_id uuid not null references public.branches(id) on delete cascade,
    gateway_id uuid not null references public.gateways(id) on delete cascade,
    record_id uuid not null,
    device_id uuid not null references public.devices(id) on delete cascade,
    source_id varchar(100) not null,
    source_kind varchar(32) not null,
    boot_id varchar(64) null,
    sequence bigint null,
    gateway_receipt_at timestamptz not null,
    source_recorded_at timestamptz null,
    cloud_received_at timestamptz not null default now(),
    payload jsonb not null,
    quality jsonb not null default '{}'::jsonb
);

create unique index if not exists unique_gateway_observation_record
    on public.telemetry_observations (gateway_id, record_id);

alter table public.telemetry_observations add constraint observations_device_binding_fk
    foreign key (device_id, gateway_id, branch_id, organization_id)
    references public.devices(id, gateway_id, branch_id, organization_id);

create index if not exists idx_telemetry_observations_lookup
    on public.telemetry_observations (branch_id, device_id, cloud_received_at desc);

-- Revoke all browser roles, enable RLS
alter table public.gateways enable row level security;
alter table public.gateway_claims enable row level security;
alter table public.gateway_claim_attempts enable row level security;
alter table public.devices enable row level security;
alter table public.device_discoveries enable row level security;
alter table public.telemetry_observations enable row level security;

revoke all on table public.gateways from anon, authenticated;
revoke all on table public.gateway_claims from anon, authenticated;
revoke all on table public.gateway_claim_attempts from anon, authenticated;
revoke all on table public.devices from anon, authenticated;
revoke all on table public.device_discoveries from anon, authenticated;
revoke all on table public.telemetry_observations from anon, authenticated;
revoke all on sequence public.telemetry_observations_id_seq from anon, authenticated;

commit;

