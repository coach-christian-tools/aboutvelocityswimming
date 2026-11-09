-- Provision profiles independently of which page or sign-in method is used.
-- This private trigger runs with its owner's rights because the Auth service
-- cannot insert into the application's RLS-protected profile table itself.
create function private.create_account_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and (select auth.uid()) <> new.id then
    raise exception 'Account profile must belong to the signed-in user';
  end if;

  insert into public.account_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function private.create_account_profile() from public, anon, authenticated, service_role;

create trigger on_auth_user_account_profile
after insert or update of last_sign_in_at on auth.users
for each row execute function private.create_account_profile();

-- Existing sessions get a profile immediately, without needing to sign in again.
-- Keep every previously saved username, bio, and photo intact.
insert into public.account_profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;
