-- Requires the pg_cron extension (Supabase: Database → Extensions → pg_cron). Not applied in local tests.
create extension if not exists pg_cron;
select cron.schedule('lju-expire-holds', '* * * * *', $$select public.expire_holds()$$);
