-- Review and apply after 009_public_customer_portal.sql.
-- Schema and RLS for optional customer-visible branch gallery images stored in Supabase Storage ('branch-images').
-- Application access runs through FastAPI; browser roles receive no table grants.

begin;

create table if not exists public.branch_images (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    branch_id uuid not null,
    image_url text not null,
    storage_path text not null,
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    foreign key (branch_id, organization_id)
        references public.branches(id, organization_id)
        on delete cascade
);

create index if not exists idx_branch_images_branch_order
    on public.branch_images (branch_id, sort_order asc, created_at asc, id asc);

alter table public.branch_images enable row level security;

revoke all on public.branch_images from anon, authenticated;

commit;
