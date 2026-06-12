// Iterations-to-green benchmark: Claude writes each solution in Clad (given
// only SPEC.md) and in Python; we run it, feed errors back, and count attempts
// until the output matches the reference. Requires ANTHROPIC_API_KEY.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import { format } from '../src/fmt.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const tasksDir = join(here, 'tasks')
const tmpDir = join(here, '.tmp')
mkdirSync(tmpDir, { recursive: true })

const client = new Anthropic()
const MODEL = process.env.CLAD_MODEL || 'claude-opus-4-8' // e.g. CLAD_MODEL=claude-fable-5
const MAX_ATTEMPTS = 3

const TASKS = {
  '01-fizzbuzz': 'Print FizzBuzz for the numbers 1 to 30 inclusive, one per line: "FizzBuzz" if divisible by 15, "Fizz" if divisible by 3, "Buzz" if divisible by 5, otherwise the number itself.',
  '02-fib': 'Define a recursive fibonacci function (fib(0)=0, fib(1)=1) and print fib(20).',
  '03-wordcount': 'Count word occurrences in the string "the quick brown fox jumps over the lazy dog the end" (words are separated by single spaces). Print the count of the word "the" on the first line, then the number of unique words on the second line.',
  '04-even-squares': 'Print the sum of the squares of all even numbers from 1 to 100 inclusive.',
  '05-reverse': 'Print the string "clad language" reversed.',
  '06-max': 'Print the maximum of the list of numbers: 3, 17, 4, 42, 9, 8.',
  '07-vowels': 'Print the number of vowels (a, e, i, o, u) in the string "programming languages are fun".',
  '08-gcd': 'Print the greatest common divisor of 252 and 105.',
  '09-primes': 'Print all prime numbers below 50 on a single line, separated by single spaces.',
  '10-two-sum': 'In the list of numbers 2, 7, 11, 15 find the two indices i < j (0-based) whose values sum to 26 and print the two indices separated by a space.',
  '11-anagram': 'Define a function that returns "yes" if two words are anagrams and "no" otherwise. Print the result for the pair ("listen", "silent") on the first line and for ("hello", "world") on the second.',
  '12-palindrome': 'Print "yes" if the string "never odd or even" with spaces removed reads the same forwards and backwards, otherwise "no".',
  '13-digit-sum': 'Print the sum of the decimal digits of 2 to the power of 40.',
  '14-caesar': 'Apply a Caesar cipher with shift 3 to "hello world" (lowercase letters wrap around a-z, the space stays as is) and print the result.',
  '15-sort-words': 'Sort the words of "banana kiwi apple fig cherry date" by length, breaking ties alphabetically, and print them on one line separated by spaces.',
  '16-top-word': 'In the string "a b c a b a d c a b" print the most frequent word and its count, separated by a space.',
  '17-diagonal': 'For the 3x3 matrix [[1,2,3],[4,5,6],[7,8,9]] (a list of rows) print the sum of the main diagonal.',
  '18-flatten': 'Flatten the nested list [[1,2],[3],[4,5,6]] by one level and print the elements on one line separated by spaces.',
  '19-index-of': 'Print the 0-based index of the value 11 in the list 1 3 5 7 9 11 13 15.',
  '20-collatz': 'Print how many steps the Collatz process (n -> n/2 if n is even, else 3n+1) takes to reach 1 starting from 27.',
  '21-dedupe': 'Remove duplicates from the list 3 1 3 2 1 4 3 keeping the first occurrence of each value, and print the result on one line separated by spaces.',
  '22-group': 'Group the words "apple avocado banana blueberry cherry" by first letter; for each letter in alphabetical order print a line "letter: word word ..." with the words in their original order.',
  '23-running-max': 'For the list 3 1 4 1 5 9 2 6 print the running maximum after each element, on one line separated by spaces.',
  '24-parens': 'Print "yes" if the parentheses in the string "(()(()))" are balanced, otherwise "no".',
  '25-second-largest': 'Print the second largest distinct value in the list 5 1 9 7 9 3.',
  '26-csv-sum': 'The string "apple,1.50\\nbread,2.25\\nmilk,0.75" contains one item per line in the form name,price. Print the sum of the prices.',
  '27-group-avg': 'The string "eng 100 eng 200 ops 150 ops 250 ops 200" alternates department and salary. For each department in alphabetical order print a line "dept avg" where avg is the floored integer average of its salaries.',
  '28-top-three': 'Print the three largest values of 17 4 42 9 23 8 15 in descending order on one line, separated by spaces.',
  '29-histogram': 'For the string "banana" print one line per distinct letter in alphabetical order, formatted as letter:count (with a colon, no spaces).',
  '30-zip-sort': 'Names ["a", "b", "c"] have scores [3, 1, 2] (same order). Print one line per name as "name score", sorted by score descending.',
  '31-longest-word': 'Print the longest word of "the quick brown fox jumped".',
  '32-acronym': 'Print the acronym of "portable network graphics": the first letter of each word, uppercased, as one word.',
  '33-rle': 'Run-length encode the string "aaabccccd" and print it as character+count pairs concatenated on one line (e.g. "xxyz" becomes "x2y1z1").',
  '34-median': 'Print the median of the list 7 1 5 9 3.',
  '35-title-case': 'Print "hello brave new world" with the first letter of every word capitalized.',
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
    return { ok: true, out: execFileSync(file, args, { encoding: 'utf8', timeout: 20000 }).replace(/\r\n/g, '\n').trim() }
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}`.replace(/\r\n/g, '\n').trim() || String(e.message) }
  }
}

function clean(text) {
  const t = text.trim()
  const m = t.match(/^```[a-zA-Z]*\r?\n([\s\S]*?)\r?\n?```$/)
  return m ? m[1] : t
}

// first few lines where the source deviates from canonical form, or null
function canonIssue(src) {
  const canon = format(src)
  if (canon === src) return null
  const a = src.split('\n')
  const b = canon.split('\n')
  const out = []
  for (let i = 0; i < Math.max(a.length, b.length) && out.length < 3; i++) {
    if (a[i] !== b[i]) out.push(`line ${i + 1}:\n  got:       ${a[i] ?? '<missing>'}\n  canonical: ${b[i] ?? '<missing>'}`)
  }
  return out.join('\n')
}

const spec = readFileSync(join(root, 'SPEC.md'), 'utf8')
const SYSTEM = {
  clad: `You write programs in Clad, a new programming language you have never seen before. Here is its full specification:\n\n${spec}\n\nReply with ONLY the Clad source code of the program. No markdown fences, no explanations.`,
  python: 'You write Python 3 programs. Reply with ONLY the Python source code of the program. No markdown fences, no explanations.',
}

async function solve(name, task, lang, expected) {
  const messages = [{ role: 'user', content: task }]
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      system: SYSTEM[lang],
      messages,
    })
    const code = clean(resp.content.filter(b => b.type === 'text').map(b => b.text).join(''))
    const file = join(tmpDir, `${name}.${lang === 'clad' ? 'clad' : 'py'}`)
    writeFileSync(file, code + '\n')
    const run = lang === 'clad'
      ? runCmd('node', [join(root, 'src', 'cli.js'), 'run', file])
      : runCmd(python, [file])
    if (run.ok && run.out === expected) {
      // clad solutions must also be in canonical form (clad fmt --check)
      const issue = lang === 'clad' ? canonIssue(code + '\n') : null
      if (!issue) return { attempts: attempt, passed: true }
      messages.push({ role: 'assistant', content: resp.content })
      messages.push({
        role: 'user',
        content: `The output is correct, but the source is not in the canonical format (clad fmt --check fails):\n${issue}\nFix the formatting. Reply with ONLY the corrected source code.`,
      })
      continue
    }
    messages.push({ role: 'assistant', content: resp.content })
    messages.push({
      role: 'user',
      content: run.ok
        ? `Wrong output.\nExpected:\n${expected}\nGot:\n${run.out}\nFix the program. Reply with ONLY the corrected source code.`
        : `The program failed with this error:\n${run.out}\nFix the program. Reply with ONLY the corrected source code.`,
    })
  }
  return { attempts: MAX_ATTEMPTS, passed: false }
}

// optional CLI args filter tasks by name prefix, e.g. `node bench/iterate.js 01 02`
const only = process.argv.slice(2)
const rows = []
for (const [name, task] of Object.entries(TASKS)) {
  if (only.length && !only.some(f => name.startsWith(f))) continue
  const expected = runCmd(python, [join(tasksDir, name, 'solution.py')]).out
  const row = { name }
  for (const lang of ['clad', 'python']) {
    const r = await solve(name, task, lang, expected)
    row[lang] = r.passed ? r.attempts : `FAIL(${r.attempts})`
    console.log(`${name} [${lang}]: ${row[lang]}`)
  }
  rows.push(row)
}

const sum = lang => rows.reduce((a, r) => a + (typeof r[lang] === 'number' ? r[lang] : MAX_ATTEMPTS + 1), 0)
const passed = lang => rows.filter(r => typeof r[lang] === 'number').length
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const date = new Date().toISOString().slice(0, 10)

const lines = []
lines.push('| task | clad attempts | python attempts |')
lines.push('|---|---|---|')
for (const r of rows) lines.push(`| ${r.name} | ${r.clad} | ${r.python} |`)
lines.push('')
lines.push(`passed: clad ${passed('clad')}/${rows.length}, python ${passed('python')}/${rows.length} (max ${MAX_ATTEMPTS} attempts; failures counted as ${MAX_ATTEMPTS + 1})`)
lines.push(`total attempts: clad ${sum('clad')} vs python ${sum('python')}`)
console.log('\n' + lines.join('\n'))

const report = [
  `# Clad iterations-to-green benchmark — v${version}`,
  '',
  `date: ${date} · model: ${MODEL} (adaptive thinking) · Clad solutions written from SPEC.md only (model has never seen the language) · tasks: ${rows.length}`,
  '',
  ...lines,
  '',
].join('\n')
const tag = only.length ? `-part-${only[0]}` : ''
const modelTag = MODEL.replace(/^claude-/, '')
writeFileSync(join(here, 'results', `iterations-v${version}-${modelTag}${tag}.md`), report)
console.log(`\nsaved: bench/results/iterations-v${version}-${modelTag}${tag}.md`)
