// Clad lexer: source text -> token stream with significant indentation.

export class CladError extends Error {
  constructor(code, line, col, fields) {
    super(`${code} line ${line} col ${col}`)
    this.code = code
    this.line = line
    this.col = col
    this.fields = fields
  }
  format() {
    let out = `err ${this.code} line ${this.line} col ${this.col}`
    for (const [k, v] of Object.entries(this.fields)) out += `\n  ${k}: ${v}`
    if (this.trace) for (const frame of this.trace) out += `\n  in ${frame}`
    return out
  }
}

const KEYWORDS = new Set(['fn', 'ret', 'if', 'elif', 'else', 'for', 'in', 'while',
  'break', 'continue', 'expect', 'ensure', 'true', 'false', 'nil', 'and', 'or', 'not'])
const TWO_CHAR = ['|>', '->', '==', '!=', '<=', '>=', '**', '//', '+=', '-=', '*=', '/=', '%=']
const ONE_CHAR = '+-*/%<>=:()[]{}'

export function lex(src) {
  if (src[0] === '﻿') src = src.slice(1) // tolerate a UTF-8 BOM from Windows editors
  const tokens = []
  const indents = [0]
  let depth = 0 // bracket nesting; newlines/indentation are ignored inside brackets
  const lines = src.split(/\r?\n/)

  for (let ln = 0; ln < lines.length; ln++) {
    const text = lines[ln]
    const line = ln + 1
    let i = 0

    if (depth === 0) {
      let ind = 0
      while (i < text.length && (text[i] === ' ' || text[i] === '\t')) {
        if (text[i] === '\t')
          throw new CladError('E001', line, i + 1, { expected: 'spaces (2 per level)', got: 'tab', fix: 'replace tabs with spaces' })
        ind++; i++
      }
      if (i >= text.length || (text[i] === '-' && text[i + 1] === '-')) continue
      if (ind % 2 !== 0)
        throw new CladError('E002', line, 1, { expected: 'indent that is a multiple of 2 spaces', got: `${ind} space(s)`, fix: 'use 2-space indentation' })
      const top = indents[indents.length - 1]
      if (ind > top) {
        if (ind !== top + 2)
          throw new CladError('E002', line, 1, { expected: `${top + 2} spaces`, got: `${ind} spaces`, fix: 'indent exactly one level (2 spaces) at a time' })
        indents.push(ind)
        tokens.push({ type: 'indent', value: '', line, col: 1, spaceBefore: true })
      } else if (ind < top) {
        while (indents.length > 1 && indents[indents.length - 1] > ind) {
          indents.pop()
          tokens.push({ type: 'dedent', value: '', line, col: 1, spaceBefore: true })
        }
        if (indents[indents.length - 1] !== ind)
          throw new CladError('E002', line, 1, { expected: 'an indent level matching an enclosing block', got: `${ind} space(s)`, fix: 'align the line with an enclosing block' })
      }
    }

    let sb = true // whether the next token has whitespace (or line start) before it
    while (i < text.length) {
      const c = text[i]
      if (c === ' ') { i++; sb = true; continue }
      if (c === '\t')
        throw new CladError('E001', line, i + 1, { expected: 'spaces', got: 'tab', fix: 'replace tabs with spaces' })
      if (c === '-' && text[i + 1] === '-') break // comment to end of line
      const col = i + 1

      if (c === '"') {
        let j = i + 1, val = ''
        while (j < text.length && text[j] !== '"') {
          if (text[j] === '\\') {
            const e = text[j + 1]
            if (e === 'n') val += '\n'
            else if (e === 't') val += '\t'
            else if (e === '"') val += '"'
            else if (e === '\\') val += '\\'
            else throw new CladError('E003', line, j + 1, { expected: 'escape \\n \\t \\" \\\\', got: `\\${e ?? 'end of line'}`, fix: 'use a supported escape sequence' })
            j += 2
          } else { val += text[j]; j++ }
        }
        if (j >= text.length)
          throw new CladError('E004', line, col, { expected: 'closing "', got: 'end of line', fix: 'close the string on the same line' })
        tokens.push({ type: 'str', value: val, line, col, spaceBefore: sb })
        i = j + 1; sb = false; continue
      }

      if (c >= '0' && c <= '9') {
        let j = i
        while (j < text.length && text[j] >= '0' && text[j] <= '9') j++
        if (text[j] === '.' && text[j + 1] >= '0' && text[j + 1] <= '9') {
          j++
          while (j < text.length && text[j] >= '0' && text[j] <= '9') j++
        }
        tokens.push({ type: 'num', value: Number(text.slice(i, j)), line, col, spaceBefore: sb })
        i = j; sb = false; continue
      }

      if (/[a-zA-Z_]/.test(c)) {
        let j = i
        while (j < text.length && /[a-zA-Z0-9_]/.test(text[j])) j++
        const w = text.slice(i, j)
        tokens.push({ type: KEYWORDS.has(w) ? 'kw' : 'ident', value: w, line, col, spaceBefore: sb })
        i = j; sb = false; continue
      }

      const two = text.slice(i, i + 2)
      if (TWO_CHAR.includes(two)) {
        tokens.push({ type: 'op', value: two, line, col, spaceBefore: sb })
        i += 2; sb = false; continue
      }

      if (ONE_CHAR.includes(c)) {
        if ('([{'.includes(c)) depth++
        if (')]}'.includes(c)) depth = Math.max(0, depth - 1)
        tokens.push({ type: 'op', value: c, line, col, spaceBefore: sb })
        i++; sb = false; continue
      }

      if (c === ',')
        throw new CladError('E005', line, col, { expected: 'a space between items', got: "','", fix: 'remove the comma — Clad separates list items, arguments and parameters with spaces' })
      if (c === ';')
        throw new CladError('E005', line, col, { expected: 'end of line', got: "';'", fix: 'remove the semicolon — a newline ends a statement' })
      throw new CladError('E005', line, col, { expected: 'a valid token', got: `'${c}'`, fix: 'remove or replace this character' })
    }

    const last = tokens[tokens.length - 1]
    if (depth === 0 && last && !['newline', 'indent', 'dedent'].includes(last.type)) {
      tokens.push({ type: 'newline', value: '', line, col: text.length + 1, spaceBefore: true })
    }
  }

  while (indents.length > 1) {
    indents.pop()
    tokens.push({ type: 'dedent', value: '', line: lines.length, col: 1, spaceBefore: true })
  }
  tokens.push({ type: 'eof', value: '', line: lines.length + 1, col: 1, spaceBefore: true })
  return tokens
}
