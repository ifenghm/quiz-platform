// ─── Domain types mirroring the Supabase schema ────────────────────────────

export type QuestionType = 'binary' | 'rank' | 'scale' | 'string' | 'multichoice'
export type AnswerType   = 'binary' | 'rank' | 'scale' | 'string' | 'multichoice'
export type MultiChoiceSubtype = 'multichoicesor' | 'multiplechoicesand'
export type ReadAccess    = 'public' | 'restricted' | 'private'
export type WriteAccess   = 'creator_only' | 'restricted'
export type AnalyzeAccess = 'creator_only' | 'restricted' | 'public'
export type PermissionType = 'read' | 'write' | 'analyze'

// ─── Question config union ───────────────────────────────────────────────────

export interface BinaryConfig {
  trueLabel:  string
  falseLabel: string
}

export interface RankConfig {
  min: number
  max: number
}

export interface ScaleConfig {
  min:      number
  max:      number
  step:     number
  minLabel: string
  maxLabel: string
}

export interface StringConfig {
  multiline:  boolean
  maxLength:  number
}

export interface MultiChoiceConfig {
  subtype:  MultiChoiceSubtype
  choices:  string[]
}

export type QuestionConfig =
  | BinaryConfig
  | RankConfig
  | ScaleConfig
  | StringConfig
  | MultiChoiceConfig

// ─── Row types ───────────────────────────────────────────────────────────────

export interface UserAccount {
  id:         string
  email:      string
  username:   string | null
  created_at: string
}

export interface Quiz {
  id:                      string
  title:                   string
  description:             string | null
  creator_id:              string
  read_access:             ReadAccess
  write_access:            WriteAccess
  analyze_access:          AnalyzeAccess
  open_at:                 string | null
  close_at:                string | null
  created_at:              string
  updated_at:              string
  reveal_correct_answers:  boolean
  user_can_change_answers: boolean
  // Joined
  creator?:                UserAccount
  questions?:              Question[]
}

export interface QuizPermission {
  id:         string
  quiz_id:    string
  user_id:    string
  permission: PermissionType
  // Joined
  user?:      UserAccount
}

export interface Question {
  id:             string
  quiz_id:        string
  question_text:  string
  question_type:  QuestionType
  order_index:    number
  config:         QuestionConfig
  created_at:     string
  correct_answer?: AnswerValue | null
  image_url?:     string | null
}

// ─── Answer subtypes ─────────────────────────────────────────────────────────

export interface BaseAnswer {
  id:          string
  quiz_id:     string
  question_id: string
  answerer_id: string
  created_at:  string
  updated_at:  string
  // Joined
  answerer?:   UserAccount
}

export interface BinaryAnswer extends BaseAnswer {
  answer_type:  'binary'
  binary_value: boolean
  rank_value:   null
  scale_value:  null
  string_value: null
}

export interface RankAnswer extends BaseAnswer {
  answer_type:  'rank'
  binary_value: null
  rank_value:   number
  scale_value:  null
  string_value: null
}

export interface ScaleAnswer extends BaseAnswer {
  answer_type:  'scale'
  binary_value: null
  rank_value:   null
  scale_value:  number
  string_value: null
}

export interface StringAnswer extends BaseAnswer {
  answer_type:  'string'
  binary_value: null
  rank_value:   null
  scale_value:  null
  string_value: string
}

export interface MultiChoiceAnswer extends BaseAnswer {
  answer_type:  'multichoice'
  binary_value: null
  rank_value:   null
  scale_value:  null
  string_value: string | null  // JSON: string for OR, string[] for AND
}

export type Answer = BinaryAnswer | RankAnswer | ScaleAnswer | StringAnswer | MultiChoiceAnswer

// ─── Form / UI state types ───────────────────────────────────────────────────

export interface QuestionDraft {
  id?:             string
  question_text:   string
  question_type:   QuestionType
  order_index:     number
  config:          QuestionConfig
  correct_answer?: AnswerValue | null
  image_url?:      string | null
}

export interface QuizDraft {
  title:                   string
  description:             string
  read_access:             ReadAccess
  write_access:            WriteAccess
  analyze_access:          AnalyzeAccess
  open_at:                 string
  close_at:                string
  reveal_correct_answers:  boolean
  user_can_change_answers: boolean
  questions:               QuestionDraft[]
}

export type AnswerValue = boolean | number | string | string[]

export interface AnswerDraft {
  question_id:  string
  answer_type:  AnswerType
  value:        AnswerValue
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export interface QuestionAnalytics {
  question:     Question
  total:        number
  // binary
  trueCount?:   number
  falseCount?:  number
  // rank / scale / multichoice
  distribution?: { label: string; count: number }[]
  mean?:        number
  // string
  strings?:     string[]
}
