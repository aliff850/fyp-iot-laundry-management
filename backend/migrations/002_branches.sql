-- Review and apply after 001_onboarding.sql. Do not apply automatically.
-- Branch creation and the primary-manager assignment commit together in FastAPI.
alter table public.memberships add constraint memberships_org_user_unique unique (organization_id, user_id);
-- Personnel may become active only when a later assignment workflow provisions access.
alter table public.memberships drop constraint if exists memberships_check;
alter table public.memberships add constraint memberships_state_role_check
  check ((state = 'provisioning' and role = 'owner') or
         (state = 'active' and role in ('owner', 'branch_manager', 'machine_maintenance', 'lpg_maintenance')) or
         (state in ('pending', 'rejected') and role is null) or
         (state in ('approval_pending', 'approved_unassigned') and role in ('branch_manager', 'machine_maintenance', 'lpg_maintenance')) or
         state = 'deactivated');

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  create_request_id uuid not null unique,
  name text not null check (char_length(trim(name)) between 1 and 120),
  address text not null check (char_length(trim(address)) between 1 and 240),
  city text not null check (char_length(trim(city)) between 1 and 100),
  region text not null check (char_length(trim(region)) between 1 and 100),
  postal_code text not null check (char_length(trim(postal_code)) between 1 and 20),
  contact_phone text not null check (char_length(trim(contact_phone)) between 7 and 32),
  opening_hours text not null check (char_length(trim(opening_hours)) between 1 and 200),
  latitude double precision,
  longitude double precision,
  service_status text not null default 'closed' check (service_status in ('open', 'closed')),
  primary_manager_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (organization_id, primary_manager_user_id)
    references public.memberships(organization_id, user_id),
  check ((latitude is null) = (longitude is null)),
  check (latitude is null or (latitude between -90 and 90 and longitude between -180 and 180))
);
create unique index branches_org_name_unique on public.branches (organization_id, lower(name));
create index branches_org_idx on public.branches (organization_id, created_at);

create table public.branch_assignments (
  branch_id uuid not null,
  organization_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (branch_id, user_id),
  foreign key (branch_id, organization_id) references public.branches(id, organization_id),
  foreign key (organization_id, user_id) references public.memberships(organization_id, user_id)
);
create index branch_assignments_user_idx on public.branch_assignments(user_id, branch_id);

alter table public.branches enable row level security;
alter table public.branch_assignments enable row level security;
revoke all on public.branches, public.branch_assignments from anon, authenticated;
-- No direct browser policies: FastAPI verifies current membership and filters every query.
