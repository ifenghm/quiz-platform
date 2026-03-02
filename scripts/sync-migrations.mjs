#!/usr/bin/env node
/**
 * scripts/sync-migrations.mjs
 *
 * Reads src/types/index.ts, diffs it against supabase/migrations/*.sql,
 * and writes a new migration file with the necessary schema changes.
 *
 * What it detects:
 *   • Union type values added/removed  → CHECK constraint changes
 *   • Interface fields added           → ADD COLUMN (with type inference)
 *   • Interface fields removed         → commented-out DROP COLUMN (needs manual review)
 *   • answer_type_matches_value        → rebuilt automatically from AnswerType
 *
 * Usage:
 *   node scripts/sync-migrations.mjs            # write migration
 *   node scripts/sync-migrations.mjs --dry-run  # print to stdout only
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT  = join(__dir, '..')

const TYPES_FILE     = join(ROOT, 'src/types/index.ts')
const MIGRATIONS_DIR = join(ROOT, 'supabase/migrations')
const DRY_RUN        = process.argv.includes('--dry-run')

// ─── Schema mappings ──────────────────────────────────────────────────────────

/**
 * Union types that control a single-column CHECK (...IN...) constraint.
 * constraintName is the name PostgreSQL auto-assigns to inline CHECK constraints
 * (pattern: {table}_{column}_check).
 */
const ENUM_MAPPINGS = [
  { tsType: 'QuestionType',   table: 'questions',        column: 'question_type',  constraintName: 'questions_question_type_check'         },
  { tsType: 'AnswerType',     table: 'answers',           column: 'answer_type',    constraintName: 'answers_answer_type_check'             },
  { tsType: 'ReadAccess',     table: 'quizzes',           column: 'read_access',    constraintName: 'quizzes_read_access_check'             },
  { tsType: 'WriteAccess',    table: 'quizzes',           column: 'write_access',   constraintName: 'quizzes_write_access_check'            },
  { tsType: 'AnalyzeAccess',  table: 'quizzes',           column: 'analyze_access', constraintName: 'quizzes_analyze_access_check'          },
  { tsType: 'PermissionType', table: 'quiz_permissions',  column: 'permission',     constraintName: 'quiz_permissions_permission_check'     },
]

/**
 * TypeScript interfaces that correspond to DB tables.
 * joinedFields: TS-only fields that are query joins, not real columns.
 *
 * All interfaces mapping to the same table are unioned when checking for
 * "orphaned" SQL columns, so subtype interfaces (BinaryAnswer, etc.) must
 * be listed here even though they extend BaseAnswer.
 */
const INTERFACE_MAPPINGS = [
  { tsInterface: 'UserAccount',       table: 'user_accounts',   joinedFields: ['creator', 'user', 'answerer'] },
  { tsInterface: 'Quiz',              table: 'quizzes',          joinedFields: ['creator', 'questions']        },
  { tsInterface: 'QuizPermission',    table: 'quiz_permissions', joinedFields: ['user']                        },
  { tsInterface: 'Question',          table: 'questions',        joinedFields: []                              },
  // answers: BaseAnswer holds shared columns; subtypes hold answer_type + value columns
  { tsInterface: 'BaseAnswer',        table: 'answers',          joinedFields: ['answerer']                    },
  { tsInterface: 'BinaryAnswer',      table: 'answers',          joinedFields: ['answerer']                    },
  { tsInterface: 'RankAnswer',        table: 'answers',          joinedFields: ['answerer']                    },
  { tsInterface: 'ScaleAnswer',       table: 'answers',          joinedFields: ['answerer']                    },
  { tsInterface: 'StringAnswer',      table: 'answers',          joinedFields: ['answerer']                    },
  { tsInterface: 'MultiChoiceAnswer', table: 'answers',          joinedFields: ['answerer']                    },
]

/** TypeScript type string → SQL column type */
const TS_TO_SQL_TYPE = {
  'string':         'TEXT',
  'number':         'FLOAT',
  'boolean':        'BOOLEAN',
  'string | null':  'TEXT',
  'number | null':  'FLOAT',
  'boolean | null': 'BOOLEAN',
}

/**
 * For the compound answer_type_matches_value constraint:
 * maps each answer_type value → the column that must be NOT NULL.
 * Add entries here when new answer types are introduced.
 */
const ANSWER_TYPE_TO_COLUMN = {
  binary:      'binary_value',
  rank:        'rank_value',
  scale:       'scale_value',
  string:      'string_value',
  multichoice: 'string_value',
}

// ─── TypeScript parser ────────────────────────────────────────────────────────

function parseTypes(src) {
  const enums      = {}
  const interfaces = {}

  // export type Name = 'a' | 'b' | 'c'
  const unionRe = /export\s+type\s+(\w+)\s*=\s*((?:'[^']+'\s*\|?\s*)+)/g
  let m
  while ((m = unionRe.exec(src)) !== null) {
    enums[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map(x => x[1])
  }

  // export interface Name [extends Base] { ... }
  const ifaceRe = /export\s+interface\s+(\w+)(?:\s+extends\s+(\w+))?\s*\{([^}]+)\}/gs
  while ((m = ifaceRe.exec(src)) !== null) {
    const [, name, , body] = m
    const fields = {}
    const fieldRe = /^\s*(\w+)(\?)?\s*:\s*(.+?)\s*$/gm
    let fm
    while ((fm = fieldRe.exec(body)) !== null) {
      fields[fm[1]] = { type: fm[3], optional: !!fm[2] }
    }
    interfaces[name] = fields
  }

  return { enums, interfaces }
}

// ─── SQL parser ───────────────────────────────────────────────────────────────

/**
 * Read all *.sql files in migrations dir and build a model of the current schema,
 * replaying ALTER statements in order.
 */
function parseMigrations(dir) {
  const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
  let combined = ''
  for (const f of files) combined += readFileSync(join(dir, f), 'utf8') + '\n'
  return parseSchema(combined)
}

function parseSchema(sql) {
  const tables = {}

  // ── CREATE TABLE (depth-aware to handle nested parens) ──────────────────────
  const createRe = /CREATE\s+TABLE\s+(\w+)\s*\(/gi
  let m
  while ((m = createRe.exec(sql)) !== null) {
    const tname    = m[1].toLowerCase()
    const bodyStart = m.index + m[0].length
    const body      = extractParenBody(sql, bodyStart)
    if (body !== null) tables[tname] = parseTableBody(body)
  }

  // ── ALTER TABLE ADD COLUMN ───────────────────────────────────────────────────
  const addColRe = /ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+(\w+)\s+([\w\[\]]+)([^;]*);/gi
  while ((m = addColRe.exec(sql)) !== null) {
    const tname = m[1].toLowerCase()
    const cname = m[2].toLowerCase()
    if (tables[tname]) {
      tables[tname].columns[cname] = {
        type:     m[3].toUpperCase(),
        nullable: !/NOT\s+NULL/i.test(m[4]),
        checkValues: extractInlineCheckValues(m[4], cname),
      }
    }
  }

  // ── ALTER TABLE DROP COLUMN ──────────────────────────────────────────────────
  const dropColRe = /ALTER\s+TABLE\s+(\w+)\s+DROP\s+COLUMN\s+(\w+)/gi
  while ((m = dropColRe.exec(sql)) !== null) {
    const tname = m[1].toLowerCase()
    const cname = m[2].toLowerCase()
    if (tables[tname]) delete tables[tname].columns[cname]
  }

  // ── ALTER TABLE ADD CONSTRAINT ───────────────────────────────────────────────
  const addConRe = /ALTER\s+TABLE\s+(\w+)\s+ADD\s+CONSTRAINT\s+(\w+)\s+CHECK\s*\(/gi
  while ((m = addConRe.exec(sql)) !== null) {
    const tname  = m[1].toLowerCase()
    const cname  = m[2]
    const body   = extractParenBody(sql, m.index + m[0].length)
    if (body !== null && tables[tname]) {
      tables[tname].namedConstraints = (tables[tname].namedConstraints ?? [])
        .filter(c => c.name !== cname)
      tables[tname].namedConstraints.push({ name: cname, body: body.trim() })
      // Also update inline checkValues if it's a simple IN constraint
      const inM = body.match(/\s*(\w+)\s+IN\s*\(([^)]+)\)/i)
      if (inM) {
        const col = inM[1].toLowerCase()
        if (tables[tname].columns[col]) {
          tables[tname].columns[col].checkValues =
            [...inM[2].matchAll(/'([^']+)'/g)].map(x => x[1])
        }
      }
    }
  }

  // ── ALTER TABLE DROP CONSTRAINT ──────────────────────────────────────────────
  const dropConRe = /ALTER\s+TABLE\s+(\w+)\s+DROP\s+CONSTRAINT(?:\s+IF\s+EXISTS)?\s+(\w+)/gi
  while ((m = dropConRe.exec(sql)) !== null) {
    const tname = m[1].toLowerCase()
    const cname = m[2]
    if (tables[tname]) {
      tables[tname].namedConstraints = (tables[tname].namedConstraints ?? [])
        .filter(c => c.name !== cname)
      for (const col of Object.values(tables[tname].columns)) {
        if (col.constraintName === cname) { col.checkValues = null; col.constraintName = null }
      }
    }
  }

  return tables
}

/** Extract the content between the opening paren (already consumed) and its matching close. */
function extractParenBody(sql, startAfterOpen) {
  let depth = 1
  let i     = startAfterOpen
  while (i < sql.length && depth > 0) {
    if (sql[i] === '(') depth++
    else if (sql[i] === ')') depth--
    i++
  }
  if (depth !== 0) return null
  return sql.slice(startAfterOpen, i - 1)
}

function extractInlineCheckValues(rest, colName) {
  const re = new RegExp(String.raw`CHECK\s*\(\s*${colName}\s+IN\s*\(([^)]+)\)`, 'i')
  const m  = rest.match(re)
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : null
}

function parseTableBody(body) {
  const columns          = {}
  const namedConstraints = []

  // ── Named constraints (possibly multi-line) ─────────────────────────────────
  // Use extractParenBody so multi-line CHECK (...) is captured correctly.
  const conRe = /CONSTRAINT\s+(\w+)\s+CHECK\s*\(/gi
  let cm
  while ((cm = conRe.exec(body)) !== null) {
    const conBody = extractParenBody(body, cm.index + cm[0].length)
    if (conBody !== null) namedConstraints.push({ name: cm[1], body: conBody.trim() })
  }

  // ── Column definitions ───────────────────────────────────────────────────────
  // Remove CONSTRAINT blocks first so their content doesn't confuse column parsing.
  let stripped = body
  const stripConRe = /CONSTRAINT\s+\w+\s+CHECK\s*\(/gi
  let sm
  while ((sm = stripConRe.exec(body)) !== null) {
    const end = sm.index + sm[0].length + (extractParenBody(body, sm.index + sm[0].length)?.length ?? 0) + 1
    stripped = stripped.slice(0, sm.index) + ' '.repeat(end - sm.index) + stripped.slice(end)
  }

  const lines = stripped.split('\n').map(l => l.trim())

  // Join continuation lines onto the preceding line
  const normalized = []
  for (const line of lines) {
    if (!line || line.startsWith('--')) continue
    if (/^(CHECK|DEFAULT|REFERENCES|NOT\s+NULL|UNIQUE\s*\(|PRIMARY|FOREIGN)/i.test(line)) {
      if (normalized.length) normalized[normalized.length - 1] += ' ' + line
      else normalized.push(line)
    } else {
      normalized.push(line)
    }
  }

  for (const line of normalized) {
    if (/^(UNIQUE|PRIMARY|FOREIGN|CONSTRAINT)\s/i.test(line)) continue
    const colM = line.match(/^(\w+)\s+([\w\[\]]+)([\s\S]*)/)
    if (!colM) continue
    const [, cname, sqlType, rest] = colM
    columns[cname.toLowerCase()] = {
      type:        sqlType.toUpperCase(),
      nullable:    !/NOT\s+NULL/i.test(rest),
      checkValues: extractInlineCheckValues(rest, cname),
    }
  }

  return { columns, namedConstraints }
}

// ─── Diff & migration generation ─────────────────────────────────────────────

function diffSchemas(tsTypes, sqlSchema) {
  const stmts = []

  // 1. Enum CHECK constraint diffs ─────────────────────────────────────────────
  for (const map of ENUM_MAPPINGS) {
    const tsValues = tsTypes.enums[map.tsType]
    if (!tsValues) { warn(`TypeScript type '${map.tsType}' not found`); continue }

    const table = sqlSchema[map.table]
    if (!table) { warn(`SQL table '${map.table}' not found`); continue }

    const col = table.columns[map.column]
    if (!col) { warn(`SQL column '${map.table}.${map.column}' not found`); continue }

    const sqlValues = col.checkValues ?? []
    const added     = tsValues.filter(v => !sqlValues.includes(v))
    const removed   = sqlValues.filter(v => !tsValues.includes(v))
    if (!added.length && !removed.length) continue

    const label = [added.length && `+${added.join(', ')}`, removed.length && `-${removed.join(', ')}`]
      .filter(Boolean).join(' ')
    const valueList = tsValues.map(v => `'${v}'`).join(', ')

    stmts.push(
      `-- ${map.tsType} (${map.table}.${map.column}): ${label}`,
      `ALTER TABLE ${map.table} DROP CONSTRAINT IF EXISTS ${map.constraintName};`,
      `ALTER TABLE ${map.table} ADD CONSTRAINT ${map.constraintName}`,
      `  CHECK (${map.column} IN (${valueList}));`,
      '',
    )
  }

  // 2. answer_type_matches_value compound constraint ────────────────────────────
  const answerTsValues = tsTypes.enums['AnswerType']
  if (answerTsValues) {
    const table       = sqlSchema['answers']
    const namedCon    = table?.namedConstraints?.find(c => c.name === 'answer_type_matches_value')
    const currentTypes = namedCon
      ? [...namedCon.body.matchAll(/answer_type\s*=\s*'([^']+)'/gi)].map(x => x[1])
      : []

    const added   = answerTsValues.filter(v => !currentTypes.includes(v))
    const removed = currentTypes.filter(v => !answerTsValues.includes(v))

    if (added.length || removed.length) {
      const label   = [added.length && `+${added.join(', ')}`, removed.length && `-${removed.join(', ')}`].filter(Boolean).join(' ')
      const clauses = answerTsValues
        .map(v => `    (answer_type = '${v}' AND ${ANSWER_TYPE_TO_COLUMN[v] ?? 'string_value'} IS NOT NULL)`)
        .join(' OR\n')

      stmts.push(
        `-- answer_type_matches_value: ${label}`,
        `ALTER TABLE answers DROP CONSTRAINT IF EXISTS answer_type_matches_value;`,
        `ALTER TABLE answers ADD CONSTRAINT answer_type_matches_value CHECK (`,
        `${clauses}`,
        `);`,
        '',
      )
    }
  }

  // 3. Interface → column diffs ─────────────────────────────────────────────────
  for (const map of INTERFACE_MAPPINGS) {
    const tsFields = tsTypes.interfaces[map.tsInterface]
    if (!tsFields) continue

    const table = sqlSchema[map.table]
    if (!table) continue

    const skipFields = new Set(map.joinedFields)

    // Added fields (TS has it, SQL doesn't)
    for (const [field, info] of Object.entries(tsFields)) {
      if (skipFields.has(field)) continue
      if (table.columns[field]) continue

      const sqlType  = TS_TO_SQL_TYPE[info.type] ?? 'TEXT'
      const nullable = info.optional || info.type.includes('null')

      stmts.push(
        `-- New field '${field}' on ${map.tsInterface} → ${map.table}`,
        `ALTER TABLE ${map.table} ADD COLUMN IF NOT EXISTS ${field} ${sqlType}${nullable ? '' : ' NOT NULL'};`,
        '',
      )
    }

    // Removed fields (SQL has it, TS doesn't) — warn only, never auto-drop
    for (const colName of Object.keys(table.columns)) {
      if (['id', 'created_at', 'updated_at'].includes(colName)) continue
      if (skipFields.has(colName)) continue
      if (tsFields[colName]) continue

      // Check if another INTERFACE_MAPPING to the same table covers this column
      const coveredByOther = INTERFACE_MAPPINGS.some(other =>
        other.table === map.table &&
        other.tsInterface !== map.tsInterface &&
        tsTypes.interfaces[other.tsInterface]?.[colName]
      )
      if (coveredByOther) continue

      stmts.push(
        `-- ⚠ Column '${colName}' in ${map.table} has no matching field in ${map.tsInterface}`,
        `--   Inspect before dropping. Uncomment to drop:`,
        `-- ALTER TABLE ${map.table} DROP COLUMN ${colName};`,
        '',
      )
    }
  }

  return stmts
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function warn(msg) { console.warn(`  ⚠  ${msg}`) }

function nextMigrationPath() {
  const files   = readdirSync(MIGRATIONS_DIR).filter(f => /^\d+_.*\.sql$/.test(f)).sort()
  const lastNum = files.length
    ? parseInt(files[files.length - 1].match(/^(\d+)/)[1], 10)
    : 0
  const nextNum = String(lastNum + 1).padStart(3, '0')
  return join(MIGRATIONS_DIR, `${nextNum}_sync.sql`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('📖 Parsing types/index.ts…')
  const tsTypes = parseTypes(readFileSync(TYPES_FILE, 'utf8'))
  console.log(`   ${Object.keys(tsTypes.enums).length} enum types, ${Object.keys(tsTypes.interfaces).length} interfaces`)

  console.log('📖 Parsing migrations…')
  const sqlSchema = parseMigrations(MIGRATIONS_DIR)
  console.log(`   ${Object.keys(sqlSchema).length} tables`)

  console.log('🔍 Diffing schemas…')
  const stmts = diffSchemas(tsTypes, sqlSchema)

  const meaningful = stmts.filter(s => s && !s.startsWith('--') && !s.startsWith('/*'))
  if (!meaningful.length) {
    console.log('✅ Schema is already in sync — no migration needed.')
    return
  }

  const output = [
    `-- ============================================================`,
    `-- Auto-generated migration  ${new Date().toISOString().slice(0, 10)}`,
    `-- Generated by: scripts/sync-migrations.mjs`,
    `-- ============================================================`,
    '',
    ...stmts,
  ].join('\n')

  if (DRY_RUN) {
    console.log('\n--- DRY RUN OUTPUT ---\n')
    console.log(output)
    console.log('\n--- END ---')
    return
  }

  const outPath = nextMigrationPath()
  writeFileSync(outPath, output)
  console.log(`\n✅ Written → ${outPath}`)
  console.log('\n' + output)
}

main()
