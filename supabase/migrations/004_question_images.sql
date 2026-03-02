-- Add image_url column to questions
ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Create storage bucket for question images (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('question-images', 'question-images', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can read images (public bucket)
CREATE POLICY "question_images_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'question-images');

-- Authenticated users can upload images
CREATE POLICY "question_images_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'question-images'
    AND auth.role() = 'authenticated'
  );

-- Any authenticated user can delete images.
-- Quiz write-access is enforced at the application layer (edit form is
-- only reachable by users with write permission), so restricting deletes
-- here to the original uploader would break the case where a different
-- editor removes an image someone else uploaded.
CREATE POLICY "question_images_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'question-images'
    AND auth.role() = 'authenticated'
  );
