// Clad interpreter: tree-walking evaluator with runtime contracts and type checks.

import { CladError } from './lexer.js'

class Env {
  constructor(parent = null) {
    this.vars = new Map()
    this.parent = parent
  }
  lookup(name) {
    let e = this
    while (e) {
      if (e.vars.has(name)) return e
      e = e.parent
    }
    return null
  }
  get(name, node) {
    const e = this.lookup(name)
    if (!e) throw new CladError('E100', node.line, node.col, { expected: 'a defined name', got: `unknown name '${name}'`, fix: `define '${name}' before use or fix the spelling` })
    return e.vars.get(name)
  }
  set(name, val) {
    const e = this.lookup(name) ?? this
    e.vars.set(name, val)
  }
  define(name, val) { this.vars.set(name, val) }
}

class Ret {
  constructor(value) { this.value = value }
}

class LoopSig {
  constructor(kind, line, col) { this.kind = kind; this.line = line; this.col = col }
  toError() {
    return new CladError('E114', this.line, this.col, { expected: `'${this.kind}' inside a loop`, got: `'${this.kind}' outside any loop`, fix: 'use break/continue only inside for or while bodies' })
  }
}

function isFn(v) {
  return v !== null && typeof v === 'object' && (v.clad === true || v.builtin === true)
}

export function typeName(v) {
  if (v === null) return 'nil'
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'float'
  if (typeof v === 'string') return 'str'
  if (typeof v === 'boolean') return 'bool'
  if (Array.isArray(v)) return 'list'
  if (v instanceof Map) return 'map'
  if (isFn(v)) return 'fn'
  return 'unknown'
}

const TYPE_CHECKS = {
  int: v => typeof v === 'number' && Number.isInteger(v),
  float: v => typeof v === 'number',
  str: v => typeof v === 'string',
  bool: v => typeof v === 'boolean',
  list: v => Array.isArray(v),
  map: v => v instanceof Map,
  fn: v => isFn(v),
}

function checkType(v, type, node, what) {
  const check = TYPE_CHECKS[type]
  if (!check) throw new CladError('E109', node.line, node.col, { expected: 'a known type (int float str bool list map fn)', got: `'${type}'`, fix: 'use one of the built-in type names' })
  if (!check(v)) throw new CladError('E110', node.line, node.col, { expected: `${what}: ${type}`, got: typeName(v), fix: `pass a ${type} value or drop the annotation` })
}

function mustBool(v, node, where) {
  if (typeof v !== 'boolean') throw new CladError('E110', node.line, node.col, { expected: `bool in ${where}`, got: typeName(v), fix: 'use an explicit comparison, e.g. x != 0' })
}

export function fmt(v) {
  if (v === null) return 'nil'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return `[${v.map(fmt).join(' ')}]`
  if (v instanceof Map) return `{${[...v].map(([k, x]) => `${k}:${fmt(x)}`).join(' ')}}`
  if (isFn(v)) return '<fn>'
  return String(v)
}

export function run(ast, out = s => console.log(s)) {
  const g = new Env()
  installBuiltins(g, out)
  try {
    execBlock(ast.body, g, null)
  } catch (e) {
    throw e instanceof LoopSig ? e.toError() : e
  }
}

function execBlock(stmts, env, fnCtx) {
  for (const s of stmts) exec(s, env, fnCtx)
}

function exec(s, env, fnCtx) {
  switch (s.kind) {
    case 'fn':
      env.define(s.name, { clad: true, decl: s, env })
      return
    case 'assign': {
      const v = evalExpr(s.value, env)
      if (s.target.kind === 'ident') env.set(s.target.name, v)
      else assignIndex(s.target, v, env)
      return
    }
    case 'exprStmt':
      evalExpr(s.expr, env)
      return
    case 'ret': {
      if (!fnCtx) throw new CladError('E101', s.line, s.col, { expected: "'ret' inside a function", got: "'ret' at top level", fix: 'use ret only inside fn bodies' })
      throw new Ret(s.value ? evalExpr(s.value, env) : null)
    }
    case 'expect': {
      const v = evalExpr(s.expr, env)
      mustBool(v, s, 'expect')
      if (!v) throw new CladError('E120', s.line, s.col, { contract: 'expect', got: 'false', fix: 'call the function with values that satisfy the precondition' })
      return
    }
    case 'ensure': {
      if (!fnCtx) throw new CladError('E102', s.line, s.col, { expected: "'ensure' inside a function", got: "'ensure' at top level", fix: 'use ensure only inside fn bodies' })
      fnCtx.ensures.push({ expr: s.expr, env, line: s.line, col: s.col })
      return
    }
    case 'if': {
      const c = evalExpr(s.cond, env)
      mustBool(c, s.cond, 'if condition')
      if (c) execBlock(s.body, env, fnCtx)
      else if (s.elseBody) execBlock(s.elseBody, env, fnCtx)
      return
    }
    case 'for': {
      let it = evalExpr(s.iter, env)
      if (typeof it === 'string') it = [...it]
      if (!Array.isArray(it)) throw new CladError('E103', s.line, s.col, { expected: 'a list or str to iterate', got: typeName(it), fix: 'iterate over a list (e.g. range(n), keys(m)) or a string' })
      for (const v of it) {
        env.set(s.name, v)
        try { execBlock(s.body, env, fnCtx) }
        catch (e) {
          if (!(e instanceof LoopSig)) throw e
          if (e.kind === 'break') break
        }
      }
      return
    }
    case 'while': {
      for (;;) {
        const c = evalExpr(s.cond, env)
        mustBool(c, s.cond, 'while condition')
        if (!c) break
        try { execBlock(s.body, env, fnCtx) }
        catch (e) {
          if (!(e instanceof LoopSig)) throw e
          if (e.kind === 'break') break
        }
      }
      return
    }
    case 'break':
    case 'continue':
      throw new LoopSig(s.kind, s.line, s.col)
    default:
      throw new CladError('E199', s.line ?? 0, s.col ?? 0, { expected: 'a known statement', got: s.kind, fix: 'internal error — report this' })
  }
}

function assignIndex(target, v, env) {
  const obj = evalExpr(target.obj, env)
  let idx = evalExpr(target.index, env)
  if (Array.isArray(obj)) {
    if (!(typeof idx === 'number' && Number.isInteger(idx)))
      throw new CladError('E106', target.line, target.col, { expected: 'int index for a list', got: typeName(idx), fix: 'index lists with integers' })
    if (idx < 0) idx += obj.length // negative counts from the end
    if (idx < 0 || idx >= obj.length)
      throw new CladError('E106', target.line, target.col, { expected: `index in -${obj.length}..${obj.length - 1}`, got: `${idx}`, fix: 'check bounds with len() or use push() to append' })
    obj[idx] = v
    return
  }
  if (obj instanceof Map) {
    if (typeof idx !== 'string')
      throw new CladError('E107', target.line, target.col, { expected: 'str key for a map', got: typeName(idx), fix: 'use string keys' })
    obj.set(idx, v)
    return
  }
  throw new CladError('E108', target.line, target.col, { expected: 'list or map on the left of indexed assignment', got: typeName(obj), fix: 'assign into a list or map' })
}

export function evalExpr(s, env) {
  switch (s.kind) {
    case 'num': return s.value
    case 'str': return s.value
    case 'bool': return s.value
    case 'nil': return null
    case 'ident': return env.get(s.name, s)
    case 'list': return s.items.map(it => evalExpr(it, env))
    case 'map': {
      const m = new Map()
      for (const p of s.pairs) m.set(p.key, evalExpr(p.value, env))
      return m
    }
    case 'lambda':
      return {
        clad: true,
        decl: { name: null, params: s.params, retType: null, body: [{ kind: 'ret', value: s.body, line: s.line, col: s.col }] },
        env,
      }
    case 'unop': {
      const v = evalExpr(s.operand, env)
      if (s.op === '-') {
        if (typeof v !== 'number') throw new CladError('E111', s.line, s.col, { expected: 'a number after unary -', got: typeName(v), fix: 'negate numbers only' })
        return -v
      }
      mustBool(v, s, "'not'")
      return !v
    }
    case 'ternary': {
      const c = evalExpr(s.cond, env)
      mustBool(c, s, 'conditional expression')
      return evalExpr(c ? s.then : s.alt, env)
    }
    case 'binop': return evalBinop(s, env)
    case 'call': {
      const f = evalExpr(s.callee, env)
      const args = s.args.map(a => evalExpr(a, env))
      return callFunction(f, args, s)
    }
    case 'index': {
      const obj = evalExpr(s.obj, env)
      let idx = evalExpr(s.index, env)
      if (Array.isArray(obj) || typeof obj === 'string') {
        if (!(typeof idx === 'number' && Number.isInteger(idx)))
          throw new CladError('E106', s.line, s.col, { expected: 'int index', got: typeName(idx), fix: 'index lists and strings with integers' })
        if (idx < 0) idx += obj.length // negative counts from the end
        if (idx < 0 || idx >= obj.length)
          throw new CladError('E106', s.line, s.col, { expected: `index in -${obj.length}..${obj.length - 1}`, got: `${idx}`, fix: 'check bounds with len()' })
        return obj[idx]
      }
      if (obj instanceof Map) {
        if (typeof idx !== 'string')
          throw new CladError('E107', s.line, s.col, { expected: 'str key', got: typeName(idx), fix: 'use string keys' })
        if (!obj.has(idx))
          throw new CladError('E107', s.line, s.col, { expected: 'an existing key', got: `missing key '${idx}'`, fix: 'check with has(m "key") first' })
        return obj.get(idx)
      }
      throw new CladError('E108', s.line, s.col, { expected: 'list, str or map to index', got: typeName(obj), fix: 'index only collections' })
    }
    default:
      throw new CladError('E199', s.line ?? 0, s.col ?? 0, { expected: 'a known expression', got: s.kind, fix: 'internal error — report this' })
  }
}

// '==' compares by value: lists and maps are equal when their contents are
function eq(l, r) {
  if (l === r) return true
  if (Array.isArray(l) && Array.isArray(r))
    return l.length === r.length && l.every((v, i) => eq(v, r[i]))
  if (l instanceof Map && r instanceof Map) {
    if (l.size !== r.size) return false
    for (const [k, v] of l) if (!r.has(k) || !eq(v, r.get(k))) return false
    return true
  }
  return false
}

function evalBinop(s, env) {
  const op = s.op
  if (op === 'and' || op === 'or') {
    const l = evalExpr(s.left, env)
    mustBool(l, s, `'${op}'`)
    if (op === 'and' && !l) return false
    if (op === 'or' && l) return true
    const r = evalExpr(s.right, env)
    mustBool(r, s, `'${op}'`)
    return r
  }
  const l = evalExpr(s.left, env)
  const r = evalExpr(s.right, env)
  const bothNum = typeof l === 'number' && typeof r === 'number'
  const bothStr = typeof l === 'string' && typeof r === 'string'
  switch (op) {
    case '+':
      if (bothNum || bothStr) return l + r
      if (Array.isArray(l) && Array.isArray(r)) return [...l, ...r]
      throw new CladError('E111', s.line, s.col, { expected: 'two numbers, two strings or two lists for +', got: `${typeName(l)} + ${typeName(r)}`, fix: 'convert explicitly, e.g. str(x)' })
    case '-': case '*': case '/': case '%': case '//': case '**': {
      if (!bothNum)
        throw new CladError('E111', s.line, s.col, { expected: `two numbers for ${op}`, got: `${typeName(l)} ${op} ${typeName(r)}`, fix: 'convert with int() first' })
      if ((op === '/' || op === '%' || op === '//') && r === 0)
        throw new CladError('E112', s.line, s.col, { expected: 'a non-zero divisor', got: '0', fix: 'guard with expect or an if check' })
      if (op === '-') return l - r
      if (op === '*') return l * r
      if (op === '/') return l / r
      if (op === '//') return Math.floor(l / r)
      if (op === '**') return l ** r
      return l % r
    }
    case '==': return eq(l, r)
    case '!=': return !eq(l, r)
    default: {
      if (!bothNum && !bothStr)
        throw new CladError('E111', s.line, s.col, { expected: `two numbers or two strings for ${op}`, got: `${typeName(l)} ${op} ${typeName(r)}`, fix: 'compare values of the same type' })
      if (op === '<') return l < r
      if (op === '<=') return l <= r
      if (op === '>') return l > r
      return l >= r
    }
  }
}

export function callFunction(f, args, node) {
  if (f && f.builtin === true) return f.fn(args, node)
  if (!(f && f.clad === true))
    throw new CladError('E105', node.line, node.col, { expected: 'a function to call', got: typeName(f), fix: 'call a defined fn or a builtin' })
  const d = f.decl
  if (args.length !== d.params.length)
    throw new CladError('E104', node.line, node.col, { expected: `${d.params.length} argument(s) for ${d.name ?? 'fn'}`, got: `${args.length}`, fix: 'match the parameter list' })
  const env = new Env(f.env)
  d.params.forEach((p, i) => {
    if (p.type) checkType(args[i], p.type, node, `parameter '${p.name}'`)
    env.define(p.name, args[i])
  })
  const ctx = { ensures: [] }
  let result = null
  try {
    execBlock(d.body, env, ctx)
  } catch (e) {
    if (e instanceof Ret) result = e.value
    else if (e instanceof LoopSig) throw e.toError()
    else throw e
  }
  if (d.retType) checkType(result, d.retType, node, `return value of ${d.name ?? 'fn'}`)
  for (const en of ctx.ensures) {
    const ee = new Env(en.env)
    ee.define('result', result)
    const v = evalExpr(en.expr, ee)
    mustBool(v, en, 'ensure')
    if (!v) throw new CladError('E121', en.line, en.col, { contract: 'ensure', got: 'false', fix: 'fix the function body so the postcondition holds' })
  }
  return result
}

function installBuiltins(g, out) {
  const B = (name, arity, fn) => g.define(name, {
    builtin: true,
    name,
    fn: (args, node) => {
      if (arity !== null && !arity.includes(args.length))
        throw new CladError('E104', node.line, node.col, { expected: `${arity.join(' or ')} argument(s) for ${name}`, got: `${args.length}`, fix: `check the signature of ${name} in SPEC.md` })
      return fn(args, node)
    },
  })
  const bad = (n, expected, got, fix) => new CladError('E113', n.line, n.col, { expected, got, fix })
  const reqList = (v, n, w) => { if (!Array.isArray(v)) throw bad(n, `list in ${w}()`, typeName(v), 'pass a list') }
  // map/filter/fold also take a str, treated as the list of its characters
  const reqSeq = (v, n, w) => {
    if (typeof v === 'string') return [...v]
    if (Array.isArray(v)) return v
    throw bad(n, `list or str in ${w}()`, typeName(v), 'pass a list or a string')
  }
  const reqMap = (v, n, w) => { if (!(v instanceof Map)) throw bad(n, `map in ${w}()`, typeName(v), 'pass a map') }
  const reqStr = (v, n, w) => { if (typeof v !== 'string') throw bad(n, `str in ${w}()`, typeName(v), 'pass a string') }
  const reqNum = (v, n, w) => { if (typeof v !== 'number') throw bad(n, `number in ${w}()`, typeName(v), 'pass a number') }
  const reqInt = (v, n, w) => { if (!(typeof v === 'number' && Number.isInteger(v))) throw bad(n, `int in ${w}()`, typeName(v), 'pass an integer') }
  const reqFn = (v, n, w) => { if (!isFn(v)) throw bad(n, `fn in ${w}()`, typeName(v), 'pass a function or lambda') }

  B('say', null, args => { out(args.map(fmt).join(' ')); return null })
  B('says', [1], ([xs], n) => { reqList(xs, n, 'says'); out(xs.map(fmt).join(' ')); return null })
  B('len', [1], ([x], n) => {
    if (typeof x === 'string' || Array.isArray(x)) return x.length
    if (x instanceof Map) return x.size
    throw bad(n, 'str, list or map in len()', typeName(x), 'pass a collection')
  })
  B('push', [2], ([xs, v], n) => { reqList(xs, n, 'push'); xs.push(v); return xs })
  B('map', [2], ([xs, f], n) => {
    xs = reqSeq(xs, n, 'map'); reqFn(f, n, 'map')
    return xs.map(v => callFunction(f, [v], n))
  })
  B('filter', [2], ([xs, f], n) => {
    xs = reqSeq(xs, n, 'filter'); reqFn(f, n, 'filter')
    return xs.filter(v => {
      const r = callFunction(f, [v], n)
      mustBool(r, n, 'filter predicate')
      return r
    })
  })
  B('fold', [3], ([xs, init, f], n) => {
    xs = reqSeq(xs, n, 'fold'); reqFn(f, n, 'fold')
    let acc = init
    for (const v of xs) acc = callFunction(f, [acc, v], n)
    return acc
  })
  B('range', [1, 2, 3], (args, n) => {
    const [a, b, step] = args.length === 1 ? [0, args[0], 1] : args.length === 2 ? [args[0], args[1], 1] : args
    reqInt(a, n, 'range'); reqInt(b, n, 'range'); reqInt(step, n, 'range')
    if (step === 0) throw bad(n, 'non-zero step in range()', '0', 'use a positive or negative step')
    const xs = []
    if (step > 0) for (let i = a; i < b; i += step) xs.push(i)
    else for (let i = a; i > b; i += step) xs.push(i)
    return xs
  })
  B('count', [2], ([xs, f], n) => {
    xs = reqSeq(xs, n, 'count'); reqFn(f, n, 'count')
    let c = 0
    for (const v of xs) {
      const r = callFunction(f, [v], n)
      mustBool(r, n, 'count predicate')
      if (r) c++
    }
    return c
  })
  B('freq', [1], ([xs], n) => {
    xs = reqSeq(xs, n, 'freq')
    const m = new Map()
    for (const v of xs) {
      if (typeof v !== 'string') throw bad(n, 'str elements in freq()', typeName(v), 'freq counts strings; convert elements with str()')
      m.set(v, (m.get(v) ?? 0) + 1)
    }
    return m
  })
  B('uniq', [1], ([xs], n) => {
    xs = reqSeq(xs, n, 'uniq')
    const seen = new Set()
    const out = []
    for (const v of xs) if (!seen.has(v)) { seen.add(v); out.push(v) }
    return out
  })
  B('idx', [2], ([xs, v], n) => {
    if (typeof xs === 'string') { reqStr(v, n, 'idx'); return xs.indexOf(v) }
    reqList(xs, n, 'idx')
    return xs.findIndex(x => eq(x, v))
  })
  B('slice', [3], ([xs, a, b], n) => {
    reqInt(a, n, 'slice'); reqInt(b, n, 'slice')
    if (typeof xs === 'string' || Array.isArray(xs)) return xs.slice(a, b)
    throw bad(n, 'list or str in slice()', typeName(xs), 'slice a list or a string')
  })
  B('pairs', [1], ([m], n) => { reqMap(m, n, 'pairs'); return [...m].map(([k, v]) => [k, v]) })
  B('ord', [1], ([s], n) => {
    reqStr(s, n, 'ord')
    if ([...s].length !== 1) throw bad(n, 'a single character in ord()', `str of len ${s.length}`, 'pass exactly one character')
    return s.codePointAt(0)
  })
  B('chr', [1], ([x], n) => { reqInt(x, n, 'chr'); return String.fromCodePoint(x) })
  B('replace', [3], ([s, a, b], n) => {
    reqStr(s, n, 'replace'); reqStr(a, n, 'replace'); reqStr(b, n, 'replace')
    return s.split(a).join(b)
  })
  B('keys', [1], ([m], n) => { reqMap(m, n, 'keys'); return [...m.keys()] })
  B('vals', [1], ([m], n) => { reqMap(m, n, 'vals'); return [...m.values()] })
  B('has', [2], ([c, k], n) => {
    if (c instanceof Map) { reqStr(k, n, 'has'); return c.has(k) }
    if (Array.isArray(c)) return c.some(v => v === k)
    if (typeof c === 'string') { reqStr(k, n, 'has'); return c.includes(k) }
    throw bad(n, 'map, list or str in has()', typeName(c), 'pass a collection')
  })
  B('rev', [1], ([x], n) => {
    if (typeof x === 'string') return [...x].reverse().join('')
    if (Array.isArray(x)) return [...x].reverse()
    throw bad(n, 'str or list in rev()', typeName(x), 'reverse a string or a list')
  })
  B('gcd', [2], ([a, b], n) => {
    reqInt(a, n, 'gcd'); reqInt(b, n, 'gcd')
    a = Math.abs(a); b = Math.abs(b)
    while (b !== 0) { const t = b; b = a % b; a = t }
    return a
  })
  B('lower', [1], ([s], n) => { reqStr(s, n, 'lower'); return s.toLowerCase() })
  B('upper', [1], ([s], n) => { reqStr(s, n, 'upper'); return s.toUpperCase() })
  B('str', [1], ([x]) => fmt(x))
  B('int', [1], ([x], n) => {
    if (typeof x === 'number') return Math.trunc(x)
    if (typeof x === 'boolean') return x ? 1 : 0
    if (typeof x === 'string') {
      const v = Number(x)
      if (!Number.isFinite(v)) throw bad(n, 'numeric string in int()', `"${x}"`, 'pass a string of digits')
      return Math.trunc(v)
    }
    throw bad(n, 'num, str or bool in int()', typeName(x), 'convert numbers, strings or bools')
  })
  B('abs', [1], ([x], n) => { reqNum(x, n, 'abs'); return Math.abs(x) })
  B('float', [1], ([x], n) => {
    if (typeof x === 'number') return x
    if (typeof x === 'string') {
      const v = Number(x)
      if (!Number.isFinite(v)) throw bad(n, 'numeric string in float()', `"${x}"`, 'pass a string like "1.5"')
      return v
    }
    throw bad(n, 'num or str in float()', typeName(x), 'convert numbers or numeric strings')
  })
  B('zip', [2], ([a, b], n) => {
    a = reqSeq(a, n, 'zip'); b = reqSeq(b, n, 'zip')
    const len = Math.min(a.length, b.length)
    const out = []
    for (let i = 0; i < len; i++) out.push([a[i], b[i]])
    return out
  })
  B('cap', [1], ([s], n) => {
    reqStr(s, n, 'cap')
    return s === '' ? s : s[0].toUpperCase() + s.slice(1)
  })
  B('title', [1], ([s], n) => {
    reqStr(s, n, 'title')
    return s.split(' ').map(w => (w === '' ? w : w[0].toUpperCase() + w.slice(1))).join(' ')
  })
  B('lines', [1], ([s], n) => { reqStr(s, n, 'lines'); return s.split('\n') })
  B('runs', [1], ([xs], n) => {
    xs = reqSeq(xs, n, 'runs')
    const out = []
    for (const v of xs) {
      const last = out[out.length - 1]
      if (last && eq(last[0], v)) last[1]++
      else out.push([v, 1])
    }
    return out
  })
  B('chunks', [2], ([xs, size], n) => {
    xs = reqSeq(xs, n, 'chunks'); reqInt(size, n, 'chunks')
    if (size < 1) throw bad(n, 'positive chunk size in chunks()', `${size}`, 'pass a size of at least 1')
    const out = []
    for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size))
    return out
  })
  const minmax = (name, pick) => B(name, [1, 2], (args, n) => {
    if (args.length === 1) {
      const xs = args[0]
      reqList(xs, n, name)
      if (xs.length === 0) throw bad(n, `non-empty list in ${name}()`, 'empty list', 'pass at least one element')
      for (const v of xs) reqNum(v, n, name)
      return pick(...xs)
    }
    reqNum(args[0], n, name); reqNum(args[1], n, name)
    return pick(args[0], args[1])
  })
  minmax('min', Math.min)
  minmax('max', Math.max)
  B('sum', [1], ([xs], n) => {
    reqList(xs, n, 'sum')
    let s = 0
    for (const v of xs) { reqNum(v, n, 'sum'); s += v }
    return s
  })
  // sort keys: numbers, strings, or lists of them compared lexicographically
  const cmpKey = (a, b, n) => {
    if (typeof a === 'number' && typeof b === 'number') return a - b
    if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0
    if (Array.isArray(a) && Array.isArray(b)) {
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        const c = cmpKey(a[i], b[i], n)
        if (c !== 0) return c
      }
      return a.length - b.length
    }
    throw bad(n, 'comparable sort keys (numbers, strings or lists of them)', `${typeName(a)} vs ${typeName(b)}`, 'make all keys the same comparable type')
  }
  B('sort', [1, 2], ([xs, f], n) => {
    xs = reqSeq(xs, n, 'sort')
    if (f !== undefined) reqFn(f, n, 'sort')
    return xs.map(v => [f ? callFunction(f, [v], n) : v, v])
      .sort((p, q) => cmpKey(p[0], q[0], n))
      .map(p => p[1])
  })
  B('join', [2], ([xs, sep], n) => {
    reqList(xs, n, 'join'); reqStr(sep, n, 'join')
    return xs.map(fmt).join(sep) // non-str elements are stringified
  })
  B('flat', [1], ([xs], n) => {
    reqList(xs, n, 'flat')
    const out = []
    for (const v of xs) { reqList(v, n, 'flat'); out.push(...v) }
    return out
  })
  B('scan', [3], ([xs, init, f], n) => {
    xs = reqSeq(xs, n, 'scan'); reqFn(f, n, 'scan')
    let acc = init
    return xs.map(v => (acc = callFunction(f, [acc, v], n)))
  })
  const byPick = (name, wins) => B(name, [2], ([xs, f], n) => {
    xs = reqSeq(xs, n, name); reqFn(f, n, name)
    if (xs.length === 0) throw bad(n, `non-empty list in ${name}()`, 'empty list', 'pass at least one element')
    let bestV = xs[0]
    let bestK = callFunction(f, [xs[0]], n)
    for (const v of xs.slice(1)) {
      const k = callFunction(f, [v], n)
      if (wins(cmpKey(k, bestK, n))) { bestV = v; bestK = k }
    }
    return bestV
  })
  byPick('maxby', c => c > 0)
  byPick('minby', c => c < 0)
  B('group', [2], ([xs, f], n) => {
    xs = reqSeq(xs, n, 'group'); reqFn(f, n, 'group')
    const m = new Map()
    for (const v of xs) {
      const k = callFunction(f, [v], n)
      if (typeof k !== 'string') throw bad(n, 'str group keys', typeName(k), 'map keys are strings — return a str key, e.g. w[0]')
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(v)
    }
    return m
  })
  B('split', [1, 2], ([s, sep], n) => {
    reqStr(s, n, 'split')
    if (sep === undefined) return s.split(/\s+/).filter(w => w !== '') // whitespace, as in Python
    reqStr(sep, n, 'split')
    return s.split(sep)
  })
}
