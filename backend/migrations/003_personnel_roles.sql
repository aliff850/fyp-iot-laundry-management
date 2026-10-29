-- Review and apply after 002_branches.sql.
-- Relaxes check constraints to allow approved personnel without an immediate operational role.

alter table public.memberships drop constraint if exists memberships_state_role_check;
alter table public.memberships add constraint memberships_state_role_check
  check ((state = 'provisioning' and role = 'owner') or
         (state = 'active' and role in ('owner', 'branch_manager', 'machine_maintenance', 'lpg_maintenance')) or
         (state in ('pending', 'rejected') and role is null) or
         (state in ('approval_pending', 'approved_unassigned') and (role is null or role in ('branch_manager', 'machine_maintenance', 'lpg_maintenance'))) or
         state = 'deactivated');

alter table public.join_requests drop constraint if exists join_requests_check;
alter table public.join_requests drop constraint if exists join_requests_state_role_check;
alter table public.join_requests add constraint join_requests_state_role_check
  check ((state in ('pending', 'rejected') and decision_role is null) or
         (state in ('approval_pending', 'approved')));

alter table public.join_request_decisions drop constraint if exists join_request_decisions_check;
alter table public.join_request_decisions drop constraint if exists join_request_decisions_decision_role_check;
alter table public.join_request_decisions add constraint join_request_decisions_decision_role_check
  check ((decision = 'approve') or (decision = 'reject' and role is null));
