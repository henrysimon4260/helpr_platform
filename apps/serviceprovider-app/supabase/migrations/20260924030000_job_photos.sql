-- HLP-28: job photos leave the device and land in Storage.
-- Apply this in the Supabase SQL editor before shipping the customer composers.
-- profile-pictures stays the avatar bucket; job media uses job-photos.

alter table public.service
  add column if not exists photo_urls jsonb not null default '[]'::jsonb;

comment on column public.service.photo_urls is
  'Public https URLs for job photos in the job-photos bucket. Customer composers write this. Never store file:// URIs.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-photos',
  'job-photos',
  true,
  26214400,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/quicktime'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "job photos public read" on storage.objects;
create policy "job photos public read"
on storage.objects for select
to public
using (bucket_id = 'job-photos');

drop policy if exists "job photos owner insert" on storage.objects;
create policy "job photos owner insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'job-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "job photos owner delete" on storage.objects;
create policy "job photos owner delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'job-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
