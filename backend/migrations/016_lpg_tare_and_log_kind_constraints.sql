-- Review and apply after 015_unified_maintenance_and_lpg_modes.sql.
-- Expands lpg_commands_action_check to permit 'set_tare_weight' and
-- machine_maintenance_logs_log_kind_check to permit 'gas_calibration' and 'set_tare_weight'.
-- Application access runs through FastAPI; browser roles receive no table grants.

begin;

do $$
declare
    r record;
begin
    for r in
        select conname
        from pg_constraint
        where conrelid = 'public.lpg_commands'::regclass
          and contype = 'c'
          and pg_get_constraintdef(oid) ilike '%action%'
    loop
        execute format('alter table public.lpg_commands drop constraint %I', r.conname);
    end loop;
end $$;

alter table public.lpg_commands
    add constraint lpg_commands_action_check
    check (action in (
        'start_tank_swap',
        'complete_tank_swap',
        'calibrate_gas_baseline',
        'set_tare_weight',
        'start_maintenance',
        'complete_maintenance'
    ));

do $$
declare
    r record;
begin
    for r in
        select conname
        from pg_constraint
        where conrelid = 'public.machine_maintenance_logs'::regclass
          and contype = 'c'
          and pg_get_constraintdef(oid) ilike '%log_kind%'
    loop
        execute format('alter table public.machine_maintenance_logs drop constraint %I', r.conname);
    end loop;
end $$;

alter table public.machine_maintenance_logs
    add constraint machine_maintenance_logs_log_kind_check
    check (log_kind in (
        'maintenance',
        'incident_resolution',
        'tank_swap',
        'inspection',
        'gas_calibration',
        'set_tare_weight'
    ));

commit;
