-- Execute after 202610300001_pages.sql in the private Supabase SQL Editor.
-- Queue email accounts immediately, without granting approval or credits.
begin;

create or replace function viabil_private.profile_after_auth_signup()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  stamp bigint := floor(extract(epoch from clock_timestamp()) * 1000);
  profile_name text;
begin
  -- Phone-only/anonymous accounts are not part of this application's email flow.
  if new.email is null or btrim(new.email) = '' then return new; end if;
  profile_name := left(coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
                               nullif(split_part(new.email, '@', 1), ''), 'Usuário'), 100);
  insert into viabil_private.profiles
    (id, email, name, role, account_status, balance, created_at, updated_at, last_seen_at)
  values
    (new.id, new.email,
     rpad(profile_name, greatest(2, length(profile_name)), ' '),
     'user', 'pending', 0, stamp, stamp, 0)
  on conflict (id) do nothing;
  return new;
end $$;

revoke all on function viabil_private.profile_after_auth_signup()
  from public, anon, authenticated;

drop trigger if exists viabil_profile_after_auth_signup on auth.users;
create trigger viabil_profile_after_auth_signup
  after insert or update of email on auth.users
  for each row execute function viabil_private.profile_after_auth_signup();

-- Catch up existing accounts. Preserve every existing role, decision and balance.
with candidates as (
  select u.id, u.email,
         left(coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
                       nullif(split_part(u.email, '@', 1), ''), 'Usuário'), 100) as name
  from auth.users u where u.email is not null and btrim(u.email) <> ''
)
insert into viabil_private.profiles
  (id, email, name, role, account_status, balance, created_at, updated_at, last_seen_at)
select u.id, u.email, rpad(u.name, greatest(2, length(u.name)), ' '),
       'user', 'pending', 0,
       floor(extract(epoch from now()) * 1000),
       floor(extract(epoch from now()) * 1000), 0
from candidates u
on conflict (id) do nothing;

commit;

-- Expected: trigger_active=true and accounts_without_profile=0.
select exists (
  select 1 from pg_trigger
  where tgrelid = 'auth.users'::regclass
    and tgname = 'viabil_profile_after_auth_signup' and tgenabled = 'O'
) as trigger_active,
(select count(*) from auth.users u
 where u.email is not null and btrim(u.email) <> ''
   and not exists (select 1 from viabil_private.profiles p where p.id = u.id)
) as accounts_without_profile;
