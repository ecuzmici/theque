-- A Vercel Function refuses a request body above 4.5 MB. The browser therefore
-- sends a book file to this bucket through a signed upload URL. The file route
-- then reads the file, sends it to Google Drive and deletes it from the bucket.
--
-- The bucket is private and has no user policies. Only the service role reads
-- and deletes objects. The size limit is MAX_BOOK_FILE_BYTES (30 MB).

insert into storage.buckets (id, name, public, file_size_limit)
values ('book-uploads', 'book-uploads', false, 31457280)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;
