-- Apply after 006. Web Push subscriptions, per-device transition baselines, and delivery attempts.
-- Application access runs through FastAPI; browser roles receive no table grants.
begin;

create table if not exists public.push_subscriptions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(user_id) on delete cascade,
    organization_id uuid not null references public.organizations(id) on delete cascade,
    endpoint text not null,
    p256dh text not null,
    auth text not null,
    user_agent varchar(255) null,
    created_at timestamptz not null default now(),
    last_used_at timestamptz null,
    revoked_at timestamptz null,
    unique (user_id, endpoint)
);

create index if not exists idx_push_subscriptions_active_org
    on public.push_subscriptions (organization_id, user_id)
    where revoked_at is null;

create table if not exists public.device_notification_states (
    device_id uuid primary key references public.devices(id) on delete cascade,
    organization_id uuid not null references public.organizations(id) on delete cascade,
    branch_id uuid not null references public.branches(id) on delete cascade,
    last_machine_state varchar(32) null,
    last_fault_code varchar(64) null,
    last_lpg_band varchar(16) null,
    last_gas_condition varchar(32) null,
    last_maintenance_mode boolean not null default false,
    last_sample_at timestamptz null,
    updated_at timestamptz not null default now()
);

create index if not exists idx_device_notification_states_branch
    on public.device_notification_states (organization_id, branch_id);

create table if not exists public.push_delivery_attempts (
    id uuid primary key default gen_random_uuid(),
    subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
    dedup_key varchar(255) not null,
    status varchar(24) not null check (status in ('sent', 'failed', 'pruned')),
    http_status integer null,
    error_detail varchar(255) null,
    attempted_at timestamptz not null default now(),
    unique (subscription_id, dedup_key)
);

create index if not exists idx_push_delivery_attempts_attempted
    on public.push_delivery_attempts (attempted_at desc);

alter table public.push_subscriptions enable row level security;
alter table public.device_notification_states enable row level security;
alter table public.push_delivery_attempts enable row level security;

revoke all on public.push_subscriptions, public.device_notification_states, public.push_delivery_attempts from anon, authenticated;

commit;
