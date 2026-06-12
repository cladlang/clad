// Clad parser: token stream -> AST (recursive descent).

import { CladError } from './lexer.js'

export function parse(tokens) {
  return new Parser(tokens).parseProgram()
}

class Parser {
  constructor(tokens) {
    this.toks = tokens
    this.p = 0
    this.argDepth = 0 // >0 while parsing space-separated argument/list items
  }

  peek(o = 0) { return this.toks[Math.min(this.p + o, this.toks.length - 1)] }
  next() { return this.toks[this.p++] }
  at(type, value) {
    const t = this.peek()
    return t.type === type && (value === undefined || t.value === value)
  }
  atOp(v) { return this.at('op', v) }
  atKw(v) { return this.at('kw', v) }

  expect(type, value, what, fix) {
    if (!this.at(type, value)) this.fail(what ?? `'${value ?? type}'`, fix)
    return this.next()
  }

  fail(expected, fix) {
    const t = this.peek()
    const got = t.type === 'newline' ? 'newline'
      : t.type === 'eof' ? 'end of file'
      : t.type === 'indent' ? 'indent'
      : t.type === 'dedent' ? 'dedent'
      : `'${t.value}'`
    throw new CladError('E010', t.line, t.col, { expected, got, fix: fix ?? 'adjust the syntax to match SPEC.md' })
  }

  skipNewlines() { while (this.at('newline')) this.next() }

  parseProgram() {
    const body = []
    this.skipNewlines()
    while (!this.at('eof')) {
      body.push(this.parseStmt())
      this.skipNewlines()
    }
    return { kind: 'program', body }
  }

  parseStmt() {
    if (this.atKw('fn')) return this.parseFn()
    if (this.atKw('if')) return this.parseIf()
    if (this.atKw('for')) return this.parseFor()
    if (this.atKw('while')) return this.parseWhile()
    return this.parseSimple()
  }

  // statements allowed in ": inline" bodies
  parseSimple() {
    const t = this.peek()
    if (this.atKw('ret')) {
      this.next()
      let value = null
      if (!this.at('newline') && !this.at('eof') && !this.at('dedent')) value = this.parseExpr()
      return { kind: 'ret', value, line: t.line, col: t.col }
    }
    if (this.atKw('expect') || this.atKw('ensure')) {
      const kw = this.next()
      return { kind: kw.value, expr: this.parseExpr(), line: kw.line, col: kw.col }
    }
    if (this.atKw('break') || this.atKw('continue')) {
      const kw = this.next()
      return { kind: kw.value, line: kw.line, col: kw.col }
    }
    const expr = this.parseExpr()
    const AUG = ['+=', '-=', '*=', '/=', '%=']
    if (this.atOp('=') || (this.at('op') && AUG.includes(this.peek().value))) {
      if (expr.kind !== 'ident' && expr.kind !== 'index')
        throw new CladError('E011', t.line, t.col, { expected: 'a name or element on the left of =', got: expr.kind, fix: 'assign to a variable or element, e.g. x = 1 or xs[0] = 1' })
      const op = this.next()
      const rhs = this.parseExpr()
      const value = op.value === '='
        ? rhs
        : { kind: 'binop', op: op.value[0], left: expr, right: rhs, line: op.line, col: op.col }
      return { kind: 'assign', target: expr, value, line: t.line, col: t.col }
    }
    return { kind: 'exprStmt', expr, line: t.line, col: t.col }
  }

  parseBody() {
    if (this.atOp(':')) {
      this.next()
      return [this.parseSimple()]
    }
    this.expect('newline', undefined, "': statement' or a newline then an indented block")
    this.expect('indent', undefined, 'an indented block (2 spaces)')
    const stmts = []
    this.skipNewlines()
    while (!this.at('dedent') && !this.at('eof')) {
      stmts.push(this.parseStmt())
      this.skipNewlines()
    }
    if (this.at('dedent')) this.next()
    return stmts
  }

  parseFn() {
    const t = this.expect('kw', 'fn')
    const name = this.expect('ident', undefined, 'function name').value
    this.expect('op', '(', "'(' right after the function name")
    const params = this.parseParams()
    let retType = null
    if (this.atOp('->')) {
      this.next()
      retType = this.expect('ident', undefined, 'return type name').value
    }
    const body = this.parseBody()
    return { kind: 'fn', name, params, retType, body, line: t.line, col: t.col }
  }

  parseParams() {
    const params = []
    while (!this.atOp(')')) {
      if (this.at('eof')) this.fail("')'")
      const p = this.expect('ident', undefined, 'parameter name')
      let type = null
      if (this.atOp(':')) {
        this.next()
        type = this.expect('ident', undefined, 'type name').value
      }
      params.push({ name: p.value, type })
    }
    this.next() // ')'
    return params
  }

  parseIf(kw = 'if') {
    const t = this.expect('kw', kw)
    const cond = this.parseExpr()
    const body = this.parseBody()
    let elseBody = null
    const save = this.p
    this.skipNewlines()
    if (this.atKw('elif')) {
      elseBody = [this.parseIf('elif')]
    } else if (this.atKw('else')) {
      this.next()
      elseBody = this.atKw('if') ? [this.parseIf()] : this.parseBody()
    } else {
      this.p = save
    }
    return { kind: 'if', cond, body, elseBody, line: t.line, col: t.col }
  }

  parseFor() {
    const t = this.expect('kw', 'for')
    const name = this.expect('ident', undefined, 'loop variable').value
    this.expect('kw', 'in', "'in'")
    const iter = this.parseExpr()
    const body = this.parseBody()
    return { kind: 'for', name, iter, body, line: t.line, col: t.col }
  }

  parseWhile() {
    const t = this.expect('kw', 'while')
    const cond = this.parseExpr()
    const body = this.parseBody()
    return { kind: 'while', cond, body, line: t.line, col: t.col }
  }

  // ---- expressions ----

  parseExpr() { return this.parseTernary() }

  // Python-style conditional expression: value if cond else other
  parseTernary() {
    const e = this.parsePipe()
    if (this.atKw('if')) {
      const op = this.next()
      const cond = this.parsePipe()
      this.expect('kw', 'else', "'else' in a conditional expression")
      const alt = this.parseTernary()
      return { kind: 'ternary', cond, then: e, alt, line: op.line, col: op.col }
    }
    return e
  }

  parsePipe() {
    let left = this.parseOr()
    while (this.atOp('|>')) {
      const op = this.next()
      const target = this.parsePostfix(this.parsePrimary())
      if (target.kind === 'call') {
        target.args.unshift(left)
        target.pipe = true // remember the source used |>, for the formatter
        left = target
      } else if (target.kind === 'ident') {
        left = { kind: 'call', callee: target, args: [left], pipe: true, line: op.line, col: op.col }
      } else {
        throw new CladError('E012', op.line, op.col, { expected: "function call after '|>'", got: target.kind, fix: 'write the target as a call, e.g. |> map(f)' })
      }
    }
    return left
  }

  binNode(op, left, right) {
    return { kind: 'binop', op: op.value, left, right, line: op.line, col: op.col }
  }

  // inside argument lists a spaced '-' glued to the next token starts a new
  // argument (f(a -b) is two args; f(a - b) is one)
  argBreak(tok) {
    if (this.argDepth === 0 || tok.value !== '-') return false
    const next = this.peek(1)
    return tok.spaceBefore && next != null && !next.spaceBefore
  }

  // '|>' and 'if' cannot start a new argument, so pipes and conditional
  // expressions are unambiguous inside calls too
  parseArg() { return this.parseExpr() }

  parseOr() {
    let l = this.parseAnd()
    while (this.atKw('or')) { const op = this.next(); l = this.binNode(op, l, this.parseAnd()) }
    return l
  }

  parseAnd() {
    let l = this.parseNot()
    while (this.atKw('and')) { const op = this.next(); l = this.binNode(op, l, this.parseNot()) }
    return l
  }

  parseNot() {
    if (this.atKw('not')) {
      const op = this.next()
      return { kind: 'unop', op: 'not', operand: this.parseNot(), line: op.line, col: op.col }
    }
    return this.parseCmp()
  }

  parseCmp() {
    let l = this.parseAdd()
    while (this.at('op') && ['==', '!=', '<', '<=', '>', '>='].includes(this.peek().value)) {
      const op = this.next()
      l = this.binNode(op, l, this.parseAdd())
    }
    return l
  }

  parseAdd() {
    let l = this.parseMul()
    while (this.at('op') && (this.peek().value === '+' || this.peek().value === '-')) {
      if (this.argBreak(this.peek())) break
      const op = this.next()
      l = this.binNode(op, l, this.parseMul())
    }
    return l
  }

  parseMul() {
    let l = this.parseUnary()
    while (this.at('op') && ['*', '/', '%', '//'].includes(this.peek().value)) {
      const op = this.next()
      l = this.binNode(op, l, this.parseUnary())
    }
    return l
  }

  parseUnary() {
    if (this.atOp('-')) {
      const op = this.next()
      return { kind: 'unop', op: '-', operand: this.parseUnary(), line: op.line, col: op.col }
    }
    return this.parsePow()
  }

  // '**' is right-associative and binds tighter than unary minus (as in Python)
  parsePow() {
    const base = this.parsePostfix(this.parsePrimary())
    if (this.atOp('**')) {
      const op = this.next()
      return this.binNode(op, base, this.parseUnary())
    }
    return base
  }

  parsePostfix(node) {
    for (;;) {
      if (this.atOp('(') && !this.peek().spaceBefore) {
        const op = this.next()
        const args = []
        const saved = this.argDepth
        this.argDepth++
        while (!this.atOp(')')) {
          if (this.at('eof')) this.fail("')'", 'close the call')
          args.push(this.parseArg())
        }
        this.argDepth = saved
        this.next()
        node = { kind: 'call', callee: node, args, line: op.line, col: op.col }
      } else if (this.atOp('[') && !this.peek().spaceBefore) {
        const op = this.next()
        const saved = this.argDepth
        this.argDepth = 0
        const index = this.parseExpr()
        this.argDepth = saved
        this.expect('op', ']', "']'")
        node = { kind: 'index', obj: node, index, line: op.line, col: op.col }
      } else {
        break
      }
    }
    return node
  }

  parsePrimary() {
    const t = this.peek()
    if (this.at('num')) { this.next(); return { kind: 'num', value: t.value, line: t.line, col: t.col } }
    if (this.at('str')) { this.next(); return { kind: 'str', value: t.value, line: t.line, col: t.col } }
    if (this.atKw('true') || this.atKw('false')) {
      this.next()
      return { kind: 'bool', value: t.value === 'true', line: t.line, col: t.col }
    }
    if (this.atKw('nil')) { this.next(); return { kind: 'nil', line: t.line, col: t.col } }

    if (this.at('ident')) {
      this.next()
      if (this.atOp('->')) {
        this.next()
        return { kind: 'lambda', params: [{ name: t.value, type: null }], body: this.parseArg(), line: t.line, col: t.col }
      }
      return { kind: 'ident', name: t.value, line: t.line, col: t.col }
    }

    if (this.atOp('(')) {
      if (this.isParenLambda()) {
        this.next() // '('
        const params = this.parseParams()
        this.expect('op', '->', "'->'")
        return { kind: 'lambda', params, body: this.parseArg(), line: t.line, col: t.col }
      }
      this.next()
      const saved = this.argDepth
      this.argDepth = 0
      const e = this.parseExpr()
      this.argDepth = saved
      this.expect('op', ')', "')'")
      return e
    }

    if (this.atOp('[')) {
      this.next()
      const items = []
      const saved = this.argDepth
      this.argDepth++
      while (!this.atOp(']')) {
        if (this.at('eof')) this.fail("']'", 'close the list')
        items.push(this.parseArg())
      }
      this.argDepth = saved
      this.next()
      return { kind: 'list', items, line: t.line, col: t.col }
    }

    if (this.atOp('{')) {
      this.next()
      const pairs = []
      while (!this.atOp('}')) {
        if (this.at('eof')) this.fail("'}'", 'close the map')
        const k = this.expect('ident', undefined, 'map key')
        this.expect('op', ':', "':' right after the map key")
        const saved = this.argDepth
        this.argDepth++
        pairs.push({ key: k.value, value: this.parseArg() })
        this.argDepth = saved
      }
      this.next()
      return { kind: 'map', pairs, line: t.line, col: t.col }
    }

    this.fail('an expression')
  }

  isParenLambda() {
    let j = this.p + 1
    while (this.toks[j] && this.toks[j].type === 'ident') {
      j++
      if (this.toks[j] && this.toks[j].type === 'op' && this.toks[j].value === ':') {
        j++
        if (!(this.toks[j] && this.toks[j].type === 'ident')) return false
        j++
      }
    }
    return this.toks[j] && this.toks[j].type === 'op' && this.toks[j].value === ')'
      && this.toks[j + 1] && this.toks[j + 1].type === 'op' && this.toks[j + 1].value === '->'
  }
}
