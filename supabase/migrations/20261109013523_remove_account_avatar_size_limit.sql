-- Remove the profile-specific upload cap; the project's storage limit still applies.
update storage.buckets
set file_size_limit = null
where id = 'account-avatars';
