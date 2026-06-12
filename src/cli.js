#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { lex, CladError } from './lexer.js'
import { parse } from './parser.js'
import { run } from './interp.js'
import { format } from './fmt.js'

const args = process.argv.slice(2)

if (args.includes('--version') || args[0] === 'version') {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  console.log(`clad v${pkg.version}`)
  process.exit(0)
}
const cmd = args[0]
const check = args.includes('--check')
const files = args.slice(1).filter(a => !a.startsWith('--'))

function read(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    console.error(`clad: cannot read ${file}`)
    process.exit(1)
  }
}

if (cmd === 'run' && files.length === 1) {
  try {
    run(parse(lex(read(files[0]))))
  } catch (e) {
    if (e instanceof CladError) {
      console.error(e.format())
    } else {
      console.error(`err E999 internal error\n  got: ${e.message}\n  fix: report this at https://github.com/cladlang/clad/issues`)
    }
    process.exit(1)
  }
} else if (cmd === 'fmt' && files.length > 0) {
  let dirty = 0
  for (const file of files) {
    const src = read(file)
    let out
    try {
      out = format(src)
    } catch (e) {
      if (e instanceof CladError) {
        console.error(`${file}:\n${e.format()}`)
        process.exit(1)
      }
      throw e
    }
    if (out === src) continue
    dirty++
    if (check) {
      console.error(`needs formatting: ${file}`)
    } else {
      writeFileSync(file, out)
      console.log(`formatted: ${file}`)
    }
  }
  if (check && dirty) process.exit(1)
} else {
  console.log('clad — usage: clad run <file.clad> | clad fmt [--check] <files...> | clad --version')
  process.exit(cmd ? 1 : 0)
}
