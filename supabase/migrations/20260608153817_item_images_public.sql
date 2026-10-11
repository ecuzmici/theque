-- Make item-images bucket public so cached covers are accessible without signed URLs.
-- Paths use user_id/item_id UUIDs making them effectively unguessable.
-- Write operations (INSERT, UPDATE, DELETE) retain user-scoped RLS.

update storage.buckets
set public = true
where id = 'item-images';

-- SELECT policy is no longer needed now that the bucket is public.
drop policy if exists item_images_read_own on storage.objects;
