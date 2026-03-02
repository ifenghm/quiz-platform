-- ============================================================
-- Quiz Platform — Full Schema with Row Level Security
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ────────────────────────────────────────────────────────────
-- 1. USER ACCOUNTS (mirrors auth.users)
-- ────────────────────────────────────────────────────────────
CREATE TABLE user_accounts (
  id         UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email      TEXT UNIQUE NOT NULL,
  username   TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO user_accounts (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ────────────────────────────────────────────────────────────
-- 2. QUIZZES
-- ────────────────────────────────────────────────────────────
CREATE TABLE quizzes (
  id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title          TEXT NOT NULL,
  description    TEXT,
  creator_id     UUID REFERENCES user_accounts(id) ON DELETE CASCADE NOT NULL,

  -- PrivacySettings
  -- 'public'     → any authenticated user can take/read
  -- 'restricted' → only users explicitly granted permission
  -- 'private'    → creator only
  read_access    TEXT DEFAULT 'public'
                 CHECK (read_access IN ('public', 'restricted', 'private')),
  write_access   TEXT DEFAULT 'creator_only'
                 CHECK (write_access IN ('creator_only', 'restricted')),
  analyze_access TEXT DEFAULT 'creator_only'
                 CHECK (analyze_access IN ('creator_only', 'restricted', 'public')),

  -- Time / Date window
  open_at        TIMESTAMPTZ,
  close_at       TIMESTAMPTZ,

  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER quizzes_updated_at
  BEFORE UPDATE ON quizzes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 3. QUIZ PERMISSIONS  (PrivacySettings.reads / writes lists)
-- Maps individual users to explicit read | write | analyze grants
-- ────────────────────────────────────────────────────────────
CREATE TABLE quiz_permissions (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  quiz_id    UUID REFERENCES quizzes(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID REFERENCES user_accounts(id) ON DELETE CASCADE NOT NULL,
  permission TEXT NOT NULL CHECK (permission IN ('read', 'write', 'analyze')),
  UNIQUE (quiz_id, user_id, permission)
);

-- ────────────────────────────────────────────────────────────
-- 4. QUESTIONS  (Quiz.questions[])
-- ────────────────────────────────────────────────────────────
CREATE TABLE questions (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  quiz_id       UUID REFERENCES quizzes(id) ON DELETE CASCADE NOT NULL,
  question_text TEXT NOT NULL,
  -- Determines which Answer subtype is expected
  question_type TEXT NOT NULL
                CHECK (question_type IN ('binary', 'rank', 'scale', 'string')),
  order_index   INTEGER NOT NULL DEFAULT 0,
  -- Type-specific config stored as JSON:
  --   binary: { trueLabel: string, falseLabel: string }
  --   rank:   { min: number, max: number }          (discrete integer)
  --   scale:  { min: number, max: number, step: number, minLabel: string, maxLabel: string }
  --   string: { multiline: boolean, maxLength: number }
  config        JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- 5. ANSWERS  (Quiz.answers Map<Question, Answer>)
-- Polymorphic via nullable typed columns — only one is non-null.
-- ────────────────────────────────────────────────────────────
CREATE TABLE answers (
  id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  quiz_id      UUID REFERENCES quizzes(id) ON DELETE CASCADE NOT NULL,
  question_id  UUID REFERENCES questions(id) ON DELETE CASCADE NOT NULL,
  answerer_id  UUID REFERENCES user_accounts(id) ON DELETE CASCADE NOT NULL,

  answer_type  TEXT NOT NULL
               CHECK (answer_type IN ('binary', 'rank', 'scale', 'string')),

  -- BinaryAnswer  — proportion (true/false)
  binary_value BOOLEAN,
  -- RankAnswer    — discrete quantitative integer
  rank_value   INTEGER,
  -- ScaleAnswer   — continuous quantitative float
  scale_value  FLOAT,
  -- StringAnswer  — free text
  string_value TEXT,

  created_at   TIMESTAMPTZ DEFAULT NOW(),

  -- One answer per (question, answerer) — users can revise but not duplicate
  UNIQUE (question_id, answerer_id),

  CONSTRAINT answer_type_matches_value CHECK (
    (answer_type = 'binary'  AND binary_value IS NOT NULL) OR
    (answer_type = 'rank'    AND rank_value   IS NOT NULL) OR
    (answer_type = 'scale'   AND scale_value  IS NOT NULL) OR
    (answer_type = 'string'  AND string_value IS NOT NULL)
  )
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE user_accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE quizzes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_permissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers          ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────
-- user_accounts
-- ──────────────────────────────
CREATE POLICY "users_select_own"
  ON user_accounts FOR SELECT
  USING (true);  -- profiles are public (email shown to quiz creator etc.)

CREATE POLICY "users_update_own"
  ON user_accounts FOR UPDATE
  USING (id = auth.uid());

-- ──────────────────────────────
-- quizzes
-- ──────────────────────────────

-- Helper: can the current user READ this quiz?
CREATE OR REPLACE FUNCTION can_read_quiz(q quizzes)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    q.creator_id = auth.uid()
    OR q.read_access = 'public'
    OR (
      q.read_access = 'restricted'
      AND EXISTS (
        SELECT 1 FROM quiz_permissions
        WHERE quiz_id = q.id
          AND user_id = auth.uid()
          AND permission = 'read'
      )
    );
$$;

-- Helper: can the current user WRITE this quiz?
CREATE OR REPLACE FUNCTION can_write_quiz(q quizzes)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    q.creator_id = auth.uid()
    OR (
      q.write_access = 'restricted'
      AND EXISTS (
        SELECT 1 FROM quiz_permissions
        WHERE quiz_id = q.id
          AND user_id = auth.uid()
          AND permission = 'write'
      )
    );
$$;

-- Helper: can the current user ANALYZE this quiz?
CREATE OR REPLACE FUNCTION can_analyze_quiz(q quizzes)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    q.creator_id = auth.uid()
    OR q.analyze_access = 'public'
    OR (
      q.analyze_access = 'restricted'
      AND EXISTS (
        SELECT 1 FROM quiz_permissions
        WHERE quiz_id = q.id
          AND user_id = auth.uid()
          AND permission = 'analyze'
      )
    );
$$;

CREATE POLICY "quizzes_select"
  ON quizzes FOR SELECT
  USING (can_read_quiz(quizzes.*));

CREATE POLICY "quizzes_insert"
  ON quizzes FOR INSERT
  WITH CHECK (creator_id = auth.uid());

CREATE POLICY "quizzes_update"
  ON quizzes FOR UPDATE
  USING (can_write_quiz(quizzes.*));

CREATE POLICY "quizzes_delete"
  ON quizzes FOR DELETE
  USING (creator_id = auth.uid());

-- ──────────────────────────────
-- quiz_permissions
-- ──────────────────────────────
CREATE POLICY "permissions_select"
  ON quiz_permissions FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM quizzes
      WHERE id = quiz_permissions.quiz_id
        AND creator_id = auth.uid()
    )
  );

CREATE POLICY "permissions_insert"
  ON quiz_permissions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quizzes
      WHERE id = quiz_permissions.quiz_id
        AND creator_id = auth.uid()
    )
  );

CREATE POLICY "permissions_delete"
  ON quiz_permissions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM quizzes
      WHERE id = quiz_permissions.quiz_id
        AND creator_id = auth.uid()
    )
  );

-- ──────────────────────────────
-- questions  (follow quiz read/write access)
-- ──────────────────────────────
CREATE POLICY "questions_select"
  ON questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM quizzes q
      WHERE q.id = questions.quiz_id
        AND can_read_quiz(q.*)
    )
  );

CREATE POLICY "questions_insert"
  ON questions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quizzes q
      WHERE q.id = questions.quiz_id
        AND can_write_quiz(q.*)
    )
  );

CREATE POLICY "questions_update"
  ON questions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM quizzes q
      WHERE q.id = questions.quiz_id
        AND can_write_quiz(q.*)
    )
  );

CREATE POLICY "questions_delete"
  ON questions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM quizzes q
      WHERE q.id = questions.quiz_id
        AND can_write_quiz(q.*)
    )
  );

-- ──────────────────────────────
-- answers
-- ──────────────────────────────
CREATE POLICY "answers_select"
  ON answers FOR SELECT
  USING (
    answerer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM quizzes q
      WHERE q.id = answers.quiz_id
        AND can_analyze_quiz(q.*)
    )
  );

CREATE POLICY "answers_insert"
  ON answers FOR INSERT
  WITH CHECK (
    answerer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM quizzes q
      WHERE q.id = answers.quiz_id
        AND can_read_quiz(q.*)
        -- Respect time window
        AND (q.open_at  IS NULL OR q.open_at  <= NOW())
        AND (q.close_at IS NULL OR q.close_at >= NOW())
    )
  );

CREATE POLICY "answers_update"
  ON answers FOR UPDATE
  USING (answerer_id = auth.uid());

CREATE POLICY "answers_delete"
  ON answers FOR DELETE
  USING (answerer_id = auth.uid());

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_quizzes_creator     ON quizzes(creator_id);
CREATE INDEX idx_questions_quiz      ON questions(quiz_id, order_index);
CREATE INDEX idx_answers_quiz        ON answers(quiz_id);
CREATE INDEX idx_answers_question    ON answers(question_id);
CREATE INDEX idx_answers_answerer    ON answers(answerer_id);
CREATE INDEX idx_permissions_quiz    ON quiz_permissions(quiz_id);
CREATE INDEX idx_permissions_user    ON quiz_permissions(user_id);
