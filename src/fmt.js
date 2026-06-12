// Clad formatter: parse -> print the single canonical form (SPEC.md).
// Comments are reattached to statements by their original line numbers.

import { lex } from './lexer.js'
import { parse } from './parser.js'

// expression precedence levels; a child is parenthesized when its level is
// below what its position requires
const PREC = {
  ternary: 1, pipe: 2, or: 3, and: 4, not: 5, cmp: 6,
  add: 7, mul: 8, unary: 9, pow: 10, postfix: 11,
}
const BINOP_PREC = {
  'or': PREC.or, 'and': PREC.and,
  '==': PREC.cmp, '!=': PREC.cmp, '<': PREC.cmp, '<=': PREC.cmp, '>': PREC.cmp, '>=': PREC.cmp,
  '+': PREC.add, '-': PREC.add,
  '*': PREC.mul, '/': PREC.mul, '%': PREC.mul, '//': PREC.mul,
  '**': PREC.pow,
}
const INLINE_KINDS = new Set(['ret', 'expect', 'ensure', 'break', 'continue', 'assign', 'exprStmt'])
const AUG_OPS = new Set(['+', '-', '*', '/', '%'])

// per-line comments: full-line comments and trailing comments, found by
// scanning outside string literals
function scanComments(src) {
  const full = [] // { line, text }
  const trail = new Map() // line -> text
  const lines = src.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i]
    let inStr = false
    for (let j = 0; j < text.length; j++) {
      const c = text[j]
      if (inStr) {
        if (c === '\\') j++
        else if (c === '"') inStr = false
        continue
      }
      if (c === '"') { inStr = true; continue }
      if (c === '-' && text[j + 1] === '-') {
        const comment = text.slice(j).replace(/\s+$/, '')
        if (text.slice(0, j).trim() === '') full.push({ line: i + 1, text: comment })
        else trail.set(i + 1, comment)
        break
      }
    }
  }
  return { full, trail }
}

class Printer {
  constructor(comments) {
    this.lines = []
    this.full = comments.full
    this.trail = comments.trail
    this.fi = 0
  }

  flushComments(beforeLine, ind) {
    while (this.fi < this.full.length && this.full[this.fi].line < beforeLine) {
      this.lines.push('  '.repeat(ind) + this.full[this.fi].text)
      this.fi++
    }
  }

  push(ind, text, srcLine) {
    const t = this.trail.get(srcLine)
    this.lines.push('  '.repeat(ind) + text + (t ? ' ' + t : ''))
  }

  printProgram(ast) {
    let prev = null
    for (const s of ast.body) {
      if (prev && (prev.kind === 'fn' || s.kind === 'fn')) this.lines.push('')
      this.printStmt(s, 0)
      prev = s
    }
    this.flushComments(Infinity, 0)
  }

  printStmt(s, ind) {
    this.flushComments(s.line, ind)
    switch (s.kind) {
      case 'fn': {
        const params = s.params.map(p => p.type ? `${p.name}:${p.type}` : p.name).join(' ')
        const head = `fn ${s.name}(${params})` + (s.retType ? ` -> ${s.retType}` : '')
        return this.printBody(head, s.body, ind, s.line)
      }
      case 'if': return this.printIf(s, ind, 'if')
      case 'for': return this.printBody(`for ${s.name} in ${this.expr(s.iter)}`, s.body, ind, s.line)
      case 'while': return this.printBody(`while ${this.expr(s.cond)}`, s.body, ind, s.line)
      default: return this.push(ind, this.simple(s), s.line)
    }
  }

  // statements that fit after ':' on one line
  simple(s) {
    switch (s.kind) {
      case 'ret': return s.value ? `ret ${this.expr(s.value)}` : 'ret'
      case 'expect': return `expect ${this.expr(s.expr)}`
      case 'ensure': return `ensure ${this.expr(s.expr)}`
      case 'break': return 'break'
      case 'continue': return 'continue'
      case 'assign': {
        const target = this.expr(s.target, PREC.postfix)
        const v = s.value
        if (v.kind === 'binop' && AUG_OPS.has(v.op) && this.sameNode(s.target, v.left))
          return `${target} ${v.op}= ${this.expr(v.right)}`
        return `${target} = ${this.expr(s.value)}`
      }
      case 'exprStmt': return this.expr(s.expr)
      default: throw new Error(`cannot inline ${s.kind}`)
    }
  }

  printBody(head, body, ind, srcLine) {
    if (body.length === 1 && INLINE_KINDS.has(body[0].kind)) {
      this.push(ind, `${head}: ${this.simple(body[0])}`, srcLine)
      return
    }
    this.push(ind, head, srcLine)
    for (const st of body) this.printStmt(st, ind + 1)
  }

  printIf(s, ind, kw) {
    this.printBody(`${kw} ${this.expr(s.cond)}`, s.body, ind, s.line)
    if (!s.elseBody) return
    if (s.elseBody.length === 1 && s.elseBody[0].kind === 'if') {
      this.printIf(s.elseBody[0], ind, 'elif')
      return
    }
    this.printBody('else', s.elseBody, ind, s.elseBody[0].line)
  }

  sameNode(a, b) {
    if (a.kind !== b.kind) return false
    if (a.kind === 'ident') return a.name === b.name
    if (a.kind === 'index') return this.sameNode(a.obj, b.obj) && this.sameNode(a.index, b.index)
    if (a.kind === 'num' || a.kind === 'str') return a.value === b.value
    return false
  }

  str(v) {
    let out = '"'
    for (const c of v) {
      if (c === '\\') out += '\\\\'
      else if (c === '"') out += '\\"'
      else if (c === '\n') out += '\\n'
      else if (c === '\t') out += '\\t'
      else out += c
    }
    return out + '"'
  }

  expr(e, parent = 0) {
    const wrap = (level, text) => (level < parent ? `(${text})` : text)
    switch (e.kind) {
      case 'num': return String(e.value)
      case 'str': return this.str(e.value)
      case 'bool': return e.value ? 'true' : 'false'
      case 'nil': return 'nil'
      case 'ident': return e.name
      case 'list': return `[${e.items.map(it => this.expr(it, PREC.ternary)).join(' ')}]`
      case 'map': return `{${e.pairs.map(p => `${p.key}:${this.expr(p.value, PREC.ternary)}`).join(' ')}}`
      case 'lambda': {
        const params = e.params.length === 1 && !e.params[0].type
          ? e.params[0].name
          : `(${e.params.map(p => p.type ? `${p.name}:${p.type}` : p.name).join(' ')})`
        return wrap(PREC.ternary, `${params} -> ${this.expr(e.body, PREC.ternary)}`)
      }
      case 'ternary':
        return wrap(PREC.ternary,
          `${this.expr(e.then, PREC.pipe)} if ${this.expr(e.cond, PREC.pipe)} else ${this.expr(e.alt, PREC.ternary)}`)
      case 'unop':
        if (e.op === 'not') return wrap(PREC.not, `not ${this.expr(e.operand, PREC.not)}`)
        return wrap(PREC.unary, `-${this.expr(e.operand, PREC.unary)}`)
      case 'binop': {
        const prec = BINOP_PREC[e.op]
        if (e.op === '**') // right-associative
          return wrap(prec, `${this.expr(e.left, PREC.postfix)} ** ${this.expr(e.right, PREC.unary)}`)
        return wrap(prec, `${this.expr(e.left, prec)} ${e.op} ${this.expr(e.right, prec + 1)}`)
      }
      case 'call': {
        if (e.pipe) {
          const args = e.args.slice(1).map(a => this.expr(a, PREC.ternary)).join(' ')
          const left = this.expr(e.args[0], PREC.pipe)
          return wrap(PREC.pipe, `${left} |> ${this.expr(e.callee, PREC.postfix)}(${args})`)
        }
        const args = e.args.map(a => this.expr(a, PREC.ternary)).join(' ')
        return wrap(PREC.postfix, `${this.expr(e.callee, PREC.postfix)}(${args})`)
      }
      case 'index':
        return wrap(PREC.postfix, `${this.expr(e.obj, PREC.postfix)}[${this.expr(e.index, PREC.ternary)}]`)
      default:
        throw new Error(`unknown expression kind ${e.kind}`)
    }
  }
}

export function format(src) {
  const ast = parse(lex(src))
  const p = new Printer(scanComments(src))
  p.printProgram(ast)
  return p.lines.length ? p.lines.join('\n') + '\n' : ''
}
