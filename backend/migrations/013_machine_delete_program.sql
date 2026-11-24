-- Review and apply after 012_machine_maintenance_logs.sql.
-- Allow delete_program in machine_commands_action_check for FM-06 custom program removal.
-- Application access runs through FastAPI; browser roles receive no table grants.

begin;

do $$
declare
    r record;
begin
    for r in
        select conname
        from pg_constraint
        where conrelid = 'public.machine_commands'::regclass
          and contype = 'c'
          and pg_get_constraintdef(oid) ilike '%action%'
    loop
        execute format('alter table public.machine_commands drop constraint %I', r.conname);
    end loop;
end $$;

alter table public.machine_commands
    add constraint machine_commands_action_check
    check (action in (
        'start',
        'pause',
        'resume',
        'stop',
        'set_settings',
        'delete_program',
        'inject_fault',
        'clear_fault',
        'start_maintenance'
    ));

commit;
