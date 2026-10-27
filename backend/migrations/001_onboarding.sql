-- Prepare for review; do not run against the existing Supabase project automatically.
-- FastAPI uses a server-only PostgreSQL connection. Browser roles have no table grants.
create extension if not exists pgcrypto;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  business_timezone text not null default 'Asia/Kuala_Lumpur',
  state text not null check (state in ('provisioning', 'active', 'closed')),
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id),
  full_name text not null check (char_length(full_name) between 2 and 100),
  phone text not null check (char_length(phone) between 7 and 32),
  intent_kind text not null check (intent_kind in ('owner', 'personnel')),
  intent_value text not null,
  created_at timestamptz not null default now()
);

create table public.memberships (
  user_id uuid primary key references public.profiles(user_id),
  organization_id uuid not null references public.organizations(id),
  state text not null check (state in ('provisioning', 'active', 'pending', 'approval_pending', 'approved_unassigned', 'rejected', 'deactivated')),
  role text check (role in ('owner', 'branch_manager', 'machine_maintenance', 'lpg_maintenance')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((state in ('provisioning', 'active') and role = 'owner') or
         (state in ('pending', 'rejected') and role is null) or
         (state in ('approval_pending', 'approved_unassigned') and role in ('branch_manager', 'machine_maintenance', 'lpg_maintenance')) or
         state = 'deactivated')
);
create index memberships_organization_idx on public.memberships(organization_id);
create unique index memberships_one_active_owner_idx on public.memberships(organization_id)
  where role = 'owner' and active;

create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(user_id),
  organization_id uuid not null references public.organizations(id),
  state text not null check (state in ('pending', 'approval_pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_role text check (decision_role in ('branch_manager', 'machine_maintenance', 'lpg_maintenance')),
  check ((state in ('pending', 'rejected') and decision_role is null) or
         (state in ('approval_pending', 'approved') and decision_role is not null))
);
create index join_requests_org_state_idx on public.join_requests(organization_id, state);

create table public.join_request_decisions (
  request_id uuid primary key references public.join_requests(id),
  actor_id uuid not null references auth.users(id),
  decision text not null check (decision in ('approve', 'reject')),
  role text check (role in ('branch_manager', 'machine_maintenance', 'lpg_maintenance')),
  decided_at timestamptz not null default now(),
  check ((decision = 'approve' and role is not null) or (decision = 'reject' and role is null))
);

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.join_requests enable row level security;
alter table public.join_request_decisions enable row level security;
revoke all on public.organizations, public.profiles, public.memberships,
  public.join_requests, public.join_request_decisions from anon, authenticated;
-- No browser policies: all reads/writes use FastAPI's current-record authorization.
