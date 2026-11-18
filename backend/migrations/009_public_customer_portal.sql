-- Review and apply after 008_lpg_tank_swap.sql.
-- Schema and RLS for organization branding, branch publication, structured weekly hours,
-- durable customer reports, history, and persistent public intake rate limiting.
-- Application access runs through FastAPI; browser roles receive no table grants.

begin;

alter table public.organizations
    add column if not exists logo_url text null,
    add column if not exists logo_path text null;

alter table public.branches
    add column if not exists is_published boolean not null default false,
    add column if not exists weekly_hours jsonb null;

create index if not exists idx_branches_published
    on public.branches (is_published, organization_id, name, id)
    where is_published = true;

create table if not exists public.customer_reports (
    id uuid primary key default gen_random_uuid(),
    reference_code varchar(32) not null unique,
    organization_id uuid not null references public.organizations(id) on delete cascade,
    branch_id uuid not null,
    device_id uuid not null,
    gateway_id uuid not null,
    source_id varchar(100) not null,
    asset_name varchar(120) not null,
    asset_type varchar(32) not null check (asset_type in ('washer', 'dryer', 'washer_dryer', 'facility')),
    request_id uuid not null,
    request_fingerprint varchar(64) not null,
    category varchar(32) not null check (
        category in (
            'payment_qr',
            'wont_start',
            'door_lock',
            'stopped_or_faulted',
            'wash_dry_result',
            'cleanliness',
            'other'
        )
    ),
    description text not null check (char_length(trim(description)) between 10 and 1000),
    reporter_name varchar(100) null,
    contact_type varchar(16) null check (contact_type in ('email', 'phone')),
    contact_value varchar(160) null,
    contact_consent boolean not null default false,
    status varchar(24) not null default 'received' check (
        status in ('received', 'investigating', 'resolved', 'dismissed')
    ),
    source_kind varchar(32) not null default 'customer' check (source_kind in ('customer', 'simulated')),
    investigation_notes text null,
    assigned_specialist_role varchar(32) null check (
        assigned_specialist_role in ('machine_maintenance', 'lpg_maintenance')
    ),
    resolution_reason text null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    foreign key (branch_id, organization_id)
        references public.branches(id, organization_id)
        on delete cascade,
    foreign key (device_id, gateway_id, branch_id, organization_id)
        references public.devices(id, gateway_id, branch_id, organization_id)
        on delete cascade,
    unique (branch_id, request_id),
    check (
        (contact_type is null and contact_value is null and not contact_consent)
        or (contact_type is not null and contact_value is not null and contact_consent)
    )
);

create index if not exists idx_customer_reports_branch_status
    on public.customer_reports (branch_id, status, created_at desc);

create table if not exists public.customer_report_history (
    id uuid primary key default gen_random_uuid(),
    report_id uuid not null references public.customer_reports(id) on delete cascade,
    action varchar(24) not null check (action in ('received', 'investigating', 'resolved', 'dismissed')),
    actor_role varchar(32) not null,
    actor_user_id uuid null references public.profiles(user_id) on delete set null,
    note text not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_customer_report_history_report
    on public.customer_report_history (report_id, created_at asc);

create table if not exists public.customer_report_rate_limits (
    client_key varchar(64) primary key,
    attempts int not null default 0,
    window_started_at timestamptz not null default now(),
    last_attempt_at timestamptz not null default now()
);

create index if not exists idx_customer_report_rate_limits_last
    on public.customer_report_rate_limits (last_attempt_at);

alter table public.customer_reports enable row level security;
alter table public.customer_report_history enable row level security;
alter table public.customer_report_rate_limits enable row level security;

revoke all on public.customer_reports, public.customer_report_history, public.customer_report_rate_limits from anon, authenticated;

commit;
