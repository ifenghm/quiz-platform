ALTER TABLE questions ADD COLUMN correct_answer JSONB;
ALTER TABLE quizzes   ADD COLUMN reveal_correct_answers BOOLEAN NOT NULL DEFAULT FALSE;
