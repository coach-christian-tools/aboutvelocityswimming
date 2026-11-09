-- Account details are private to their owner; they never grant tool or staff access.
create table public.account_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null default '' check (username = '' or username ~ '^[A-Za-z0-9_.]{3,30}$'),
  bio text not null default '' check (char_length(bio) <= 280),
  avatar_path text check (avatar_path is null or (
    split_part(avatar_path, '/', 1) = user_id::text
    and avatar_path ~ '^[0-9a-f-]+/[0-9a-f-]+\.(jpg|png|webp)$'
  ))
);

alter table public.account_profiles enable row level security;
revoke all on public.account_profiles from anon, authenticated;
grant select, insert, update on public.account_profiles to authenticated;
grant all on public.account_profiles to service_role;

create policy "Read own account profile" on public.account_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Create own account profile" on public.account_profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own account profile" on public.account_profiles
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('account-avatars', 'account-avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

-- New uploads use unique names. Replacements never overwrite the saved photo.
create policy "Read own account avatar" on storage.objects
  for select to authenticated using (
    bucket_id = 'account-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Upload own account avatar" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'account-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Delete own account avatar" on storage.objects
  for delete to authenticated using (
    bucket_id = 'account-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
