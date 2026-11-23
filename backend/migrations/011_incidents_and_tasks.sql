-- Review and apply after 010_branch_images.sql.
-- Durable edge/cloud incidents, ordered incident audit events, maintenance task assignments,
-- and customer report incident linkage (PRD IM-01..IM-03, CR-02..CR-03).
-- Application access runs through FastAPI; browser roles receive no table grants.

begin;

create table if not exists public.incidents (
    id uuid primary key default gen_random_uuid(),
    reference_code varchar(32) not null unique,
    organization_id uuid not null references public.organizations(id) on delete cascade,
    branch_id uuid not null,
    device_id uuid not null,
    gateway_id uuid not null,
    source_id varchar(100) not null,
    asset_name varchar(120) not null,
    domain varchar(16) not null check (domain in ('machine', 'lpg')),
    condition_key varchar(64) not null,
    severity varchar(16) not null check (severity in ('warning', 'critical')),
    edge_condition_state varchar(16) not null check (edge_condition_state in ('active', 'cleared')),
    workflow_state varchar(24) not null default 'open' check (
        workflow_state in ('open', 'acknowledged', 'resolved')
    ),
    fault_code varchar(64) null,
    fault_name varchar(120) null,
    summary text not null,
    rule_version varchar(48) not null,
    edge_episode_id uuid null,
    revision int not null default 1 check (revision >= 1),
    evidence_snapshot jsonb not null default '{}'::jsonb,
    opened_at timestamptz not null,
    last_sample_at timestamptz not null,
    cleared_at timestamptz null,
    acknowledged_by uuid null references public.profiles(user_id) on delete set null,
    acknowledged_at timestamptz null,
    resolved_by uuid null references public.profiles(user_id) on delete set null,
    resolved_at timestamptz null,
    resolution_note text null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    foreign key (branch_id, organization_id)
        references public.branches(id, organization_id)
        on delete cascade,
    foreign key (device_id, gateway_id, branch_id, organization_id)
        references public.devices(id, gateway_id, branch_id, organization_id)
        on delete cascade,
    check (not (workflow_state = 'resolved' and edge_condition_state = 'active')),
    check (
        (workflow_state <> 'resolved')
        or (resolved_at is not null and resolution_note is not null and char_length(trim(resolution_note)) >= 3)
    )
);

create unique index if not exists idx_incidents_one_active_per_condition
    on public.incidents (device_id, condition_key)
    where edge_condition_state = 'active' or workflow_state <> 'resolved';

create unique index if not exists idx_incidents_edge_episode
    on public.incidents (device_id, edge_episode_id)
    where edge_episode_id is not null;

create index if not exists idx_incidents_branch_state
    on public.incidents (organization_id, branch_id, workflow_state, opened_at desc);

create index if not exists idx_incidents_device_recent
    on public.incidents (device_id, opened_at desc);

create table if not exists public.incident_events (
    id uuid primary key default gen_random_uuid(),
    incident_id uuid not null references public.incidents(id) on delete cascade,
    organization_id uuid not null references public.organizations(id) on delete cascade,
    branch_id uuid not null,
    event_type varchar(32) not null check (
        event_type in (
            'opened',
            'escalated',
            'updated',
            'cleared',
            'acknowledged',
            'assigned',
            'task_updated',
            'resolved',
            'linked_report'
        )
    ),
    actor_type varchar(24) not null check (actor_type in ('edge', 'operator', 'system')),
    actor_user_id uuid null references public.profiles(user_id) on delete set null,
    actor_role varchar(32) null,
    summary text not null,
    metadata jsonb not null default '{}'::jsonb,
    idempotency_key varchar(128) null,
    occurred_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    foreign key (branch_id, organization_id)
        references public.branches(id, organization_id)
        on delete cascade
);

create index if not exists idx_incident_events_timeline
    on public.incident_events (incident_id, occurred_at asc, created_at asc);

create unique index if not exists idx_incident_events_idempotency
    on public.incident_events (incident_id, idempotency_key)
    where idempotency_key is not null;

create table if not exists public.maintenance_tasks (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    branch_id uuid not null,
    incident_id uuid null references public.incidents(id) on delete cascade,
    report_id uuid null references public.customer_reports(id) on delete set null,
    domain varchar(16) not null check (domain in ('machine', 'lpg')),
    title varchar(160) not null,
    assigned_to_user_id uuid not null references public.profiles(user_id) on delete restrict,
    assigned_by_user_id uuid not null references public.profiles(user_id) on delete restrict,
    status varchar(24) not null default 'assigned' check (
        status in ('assigned', 'in_progress', 'completed')
    ),
    service_notes text null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    completed_at timestamptz null,
    foreign key (branch_id, organization_id)
        references public.branches(id, organization_id)
        on delete cascade,
    check (incident_id is not null or report_id is not null)
);

create index if not exists idx_maintenance_tasks_branch
    on public.maintenance_tasks (organization_id, branch_id, status, updated_at desc);

create index if not exists idx_maintenance_tasks_assignee
    on public.maintenance_tasks (assigned_to_user_id, status, updated_at desc);

create index if not exists idx_maintenance_tasks_incident
    on public.maintenance_tasks (incident_id)
    where incident_id is not null;

alter table public.customer_reports
    add column if not exists linked_incident_id uuid null references public.incidents(id) on delete set null;

create index if not exists idx_customer_reports_linked_incident
    on public.customer_reports (linked_incident_id)
    where linked_incident_id is not null;

alter table public.incidents enable row level security;
alter table public.incident_events enable row level security;
alter table public.maintenance_tasks enable row level security;

revoke all on public.incidents, public.incident_events, public.maintenance_tasks from anon, authenticated;

commit;
