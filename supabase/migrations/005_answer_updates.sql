-- ─── Add updated_at to answers ───────────────────────────────────────────────

ALTER TABLE answers
  ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();

-- Reuse the existing set_updated_at() trigger function
CREATE TRIGGER answers_updated_at
  BEFORE UPDATE ON answers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Add user_can_change_answers to quizzes ───────────────────────────────────

ALTER TABLE quizzes
  ADD COLUMN user_can_change_answers BOOLEAN NOT NULL DEFAULT TRUE;

-- ─── Update answers_update RLS policy ────────────────────────────────────────
-- Block updates when the quiz creator has disabled answer changes.

DROP POLICY "answers_update" ON answers;

CREATE POLICY "answers_update"
  ON answers FOR UPDATE
  USING (
    answerer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM quizzes q
      WHERE q.id = answers.quiz_id
        AND q.user_can_change_answers = true
    )
  );
