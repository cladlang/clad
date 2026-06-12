// Clad benchmark runner: executes every task in both languages, verifies the
// outputs match, and compares source token counts.
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const tasksDir = join(here, 'tasks')

// real Claude tokenizer via the count_tokens API when a key is set,
// o200k proxy otherwise; see bench/README.md
let tokens, tokenizerName, tokenizerTag
if (process.env.ANTHROPIC_API_KEY) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const anthropic = new Anthropic()
  tokenizerName = 'Claude count_tokens API, model claude-opus-4-8 (counts include a small constant message envelope)'
  tokenizerTag = 'claude'
  tokens = async src => {
    const r = await anthropic.messages.countTokens({
      model: 'claude-opus-4-8',
      messages: [{ role: 'user', content: src.trim() }],
    })
    return r.input_tokens
  }
} else {
  const { getEncoding } = await import('js-tiktoken')
  const enc = getEncoding('o200k_base')
  tokenizerName = 'o200k_base (proxy)'
  tokenizerTag = 'o200k'
  tokens = async src => enc.encode(src.trim()).length
}

function findPython() {
  const local = process.env.LOCALAPPDATA
  const candidates = [
    'python',
    local && join(local, 'Programs', 'Python', 'Python312', 'python.exe'),
  ].filter(Boolean)
  for (const c of candidates) {
    try {
      execFileSync(c, ['--version'], { stdio: 'ignore' })
      return c
    } catch { /* try next */ }
  }
  console.error('python not found')
  process.exit(1)
}
const python = findPython()

function runCmd(file, args) {
  try {
    return { ok: true, out: execFileSync(file, args, { encoding: 'utf8' }).replace(/\r\n/g, '\n').trim() }
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}`.trim() }
  }
}

const rows = []
let cladTotal = 0
let pyTotal = 0
let matched = 0

for (const name of readdirSync(tasksDir).sort()) {
  const cladFile = join(tasksDir, name, 'solution.clad')
  const pyFile = join(tasksDir, name, 'solution.py')
  if (!existsSync(cladFile) || !existsSync(pyFile)) continue
  const clad = runCmd('node', [join(root, 'src', 'cli.js'), 'run', cladFile])
  const py = runCmd(python, [pyFile])
  const match = clad.ok && py.ok && clad.out === py.out
  const ct = await tokens(readFileSync(cladFile, 'utf8'))
  const pt = await tokens(readFileSync(pyFile, 'utf8'))
  cladTotal += ct
  pyTotal += pt
  if (match) matched++
  else console.error(`MISMATCH ${name}\n--- clad ---\n${clad.out}\n--- python ---\n${py.out}\n`)
  rows.push({ name, match, ct, pt })
}

const lines = []
lines.push('| task | match | clad tok | py tok | diff |')
lines.push('|---|---|---|---|---|')
for (const r of rows) {
  const d = Math.round((r.ct - r.pt) / r.pt * 100)
  lines.push(`| ${r.name} | ${r.match ? 'yes' : 'NO'} | ${r.ct} | ${r.pt} | ${d > 0 ? '+' : ''}${d}% |`)
}
const total = ((cladTotal - pyTotal) / pyTotal * 100).toFixed(1)
lines.push('')
lines.push(`outputs match: ${matched}/${rows.length}`)
lines.push(`tokens total: clad ${cladTotal} vs python ${pyTotal} (${total > 0 ? '+' : ''}${total}%)`)
console.log(lines.join('\n'))

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const date = new Date().toISOString().slice(0, 10)
const report = [
  `# Clad benchmark — v${version}`,
  '',
  `date: ${date} · tokenizer: ${tokenizerName} · node ${process.version} · tasks: ${rows.length}`,
  '',
  ...lines,
  '',
].join('\n')
mkdirSync(join(here, 'results'), { recursive: true })
writeFileSync(join(here, 'results', `v${version}-${tokenizerTag}.md`), report)
console.log(`\nsaved: bench/results/v${version}-${tokenizerTag}.md`)
