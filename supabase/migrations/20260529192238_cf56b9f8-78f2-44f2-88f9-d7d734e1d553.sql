-- Resume upload bucket and applications columns

-- 1) Add metadata columns
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS resume_size integer,
  ADD COLUMN IF NOT EXISTS resume_mime text;

-- 2) Create private resumes bucket (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'resumes',
  'resumes',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3) Storage policies: anon + authenticated can upload only into pending/*
DROP POLICY IF EXISTS "Public can upload pending resumes" ON storage.objects;
CREATE POLICY "Public can upload pending resumes"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'resumes'
  AND (storage.foldername(name))[1] = 'pending'
);

-- No public SELECT policy — recruiters read via service-role signed URLs only.
