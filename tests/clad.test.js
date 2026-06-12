// Regression suite: language semantics, stdlib, stable error codes, formatter.
// Run with `npm test` (node --test).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lex, CladError } from '../src/lexer.js'
import { parse } from '../src/parser.js'
import { run } from '../src/interp.js'
import { format } from '../src/fmt.js'

function out(src) {
  const lines = []
  run(parse(lex(src)), s => lines.push(s))
  return lines.join('\n')
}

function errCode(src) {
  try {
    out(src)
    return null
  } catch (e) {
    if (e instanceof CladError) return e.code
    throw e
  }
}

test('operators and expressions', () => {
  const cases = [
    ['say(2 + 3 * 4)', '14'],
    ['say((2 + 3) * 4)', '20'],
    ['say(2 ** 10)', '1024'],
    ['say(2 ** 3 ** 2)', '512'], // right-associative
    ['say(-2 ** 2)', '-4'],
    ['say(7 // 2)', '3'],
    ['say(7 / 2)', '3.5'],
    ['say(10 % 3)', '1'],
    ['say("ab" + "cd")', 'abcd'],
    ['say([1 2] + [3])', '[1 2 3]'],
    ['say([1 [2 3]] == [1 [2 3]])', 'true'],
    ['say({a:1} == {a:1})', 'true'],
    ['say({a:1} == {a:2})', 'false'],
    ['say(1 if 2 > 1 else 0)', '1'],
    ['say("y" if false else "n")', 'n'],
    ['say(not true or true)', 'true'],
    ['say(1 < 2 and 2 < 3)', 'true'],
    ['say(nil == nil)', 'true'],
  ]
  for (const [src, expected] of cases) assert.equal(out(src), expected, src)
})

test('assignment, indexing, augmented ops', () => {
  assert.equal(out('x = 5\nx += 3\nx *= 2\nx -= 1\nsay(x)'), '15')
  assert.equal(out('s = "ab"\ns += "c"\nsay(s)'), 'abc')
  assert.equal(out('xs = [10 20 30]\nsay(xs[-1] xs[0])'), '30 10')
  assert.equal(out('xs = [1 2 3]\nxs[-1] = 9\nsay(xs)'), '[1 2 9]')
  assert.equal(out('m = {a:1}\nm["b"] = 2\nsay(m["b"])'), '2')
})

test('control flow', () => {
  assert.equal(out('if 2 > 1: say("a")\nelif 1 > 2: say("b")\nelse: say("c")'), 'a')
  assert.equal(out('n = 0\nwhile true\n  n += 1\n  if n == 3: break\nsay(n)'), '3')
  assert.equal(
    out('for i in range(5)\n  if i == 1: continue\n  if i == 3: break\n  say(i)'),
    '0\n2',
  )
  assert.equal(out('for c in "ab"\n  say(c)'), 'a\nb')
})

test('functions, lambdas, closures, contracts', () => {
  assert.equal(out('fn fib(n): ret n if n < 2 else fib(n - 1) + fib(n - 2)\nsay(fib(10))'), '55')
  assert.equal(out('f = x -> x * x\nsay(f(7))'), '49')
  assert.equal(out('g = (a b) -> a + b\nsay(g(2 3))'), '5')
  assert.equal(out('fn adder(n): ret x -> x + n\nadd5 = adder(5)\nsay(add5(10))'), '15')
  assert.equal(out('fn f(a:int b:str): ret str(a) + b\nsay(f(1 "x"))'), '1x')
  assert.equal(errCode('fn d(a b)\n  expect b != 0\n  ret a / b\nsay(d(1 0))'), 'E120')
  assert.equal(errCode('fn f() -> int\n  ensure result > 0\n  ret -1\nsay(f())'), 'E121')
})

test('pipes', () => {
  assert.equal(out('range(5) |> filter(x -> x % 2 == 0) |> map(x -> x * x) |> sum() |> say()'), '20')
  assert.equal(out('say([3 1 2] |> sort())'), '[1 2 3]')
})

test('stdlib', () => {
  const cases = [
    ['say(len("abc") len([1 2]) len({a:1}))', '3 2 1'],
    ['xs = [1]\npush(xs 2)\nsay(xs)', '[1 2]'],
    ['say(map("ab" c -> upper(c)))', '[A B]'],
    ['say(fold([1 2 3] 0 (a x) -> a + x))', '6'],
    ['say(scan([3 1 5] 0 max))', '[3 3 5]'],
    ['say(count("banana" c -> c == "a"))', '3'],
    ['say(range(3) range(1 4) range(6 0 -2))', '[0 1 2] [1 2 3] [6 4 2]'],
    ['m = {b:2 a:1}\nsay(keys(m) vals(m) pairs(m))', '[b a] [2 1] [[b 2] [a 1]]'],
    ['say(has({a:1} "a") has([1 2] 2) has("abc" "bc"))', 'true true true'],
    ['say(idx([5 6 7] 7) idx("hello" "ll") idx([1] 9))', '2 2 -1'],
    ['say(slice("abcdef" 1 -1) slice([1 2 3 4] 0 2))', 'bcde [1 2]'],
    ['say(rev("abc") rev([1 2]))', 'cba [2 1]'],
    ['say(uniq([3 1 3 2 1]))', '[3 1 2]'],
    ['say(freq(["a" "b" "a"]))', '{a:2 b:1}'],
    ['g = group(["ax" "ay" "bz"] w -> w[0])\nsay(g["a"] g["b"])', '[ax ay] [bz]'],
    ['say(sort([3 1 2]) sort(["b" "a"]) sort("cab"))', '[1 2 3] [a b] [a b c]'],
    ['say(sort(["bb" "a" "cc"] w -> [len(w) w]))', '[a bb cc]'],
    ['say(maxby(["a" "ccc" "bb"] len) minby(["a" "ccc" "bb"] len))', 'ccc a'],
    ['say(flat([[1 2] [] [3]]))', '[1 2 3]'],
    ['say(join([1 "a" 2.5] "-"))', '1-a-2.5'],
    ['say(split("a  b c") split("a,b" ","))', '[a b c] [a b]'],
    ['say(replace("aXbX" "X" "."))', 'a.b.'],
    ['say(lines("a\\nb"))', '[a b]'],
    ['say(lower("Ab") upper("ab") cap("hi") title("hi all"))', 'ab AB Hi Hi All'],
    ['say(str(2.5) int("42") int(3.9) float("1.5"))', '2.5 42 3 1.5'],
    ['say(abs(-3) min(2 1) max([4 9 2]) sum([1 2 3]) gcd(252 105))', '3 1 9 6 21'],
    ['say(ord("a") chr(98))', '97 b'],
    ['say(zip([1 2 3] ["a" "b"]))', '[[1 a] [2 b]]'],
    ['say(runs("aab") runs([1 1 2]))', '[[a 2] [b 1]] [[1 2] [2 1]]'],
    ['say(chunks([1 2 3 4 5] 2))', '[[1 2] [3 4] [5]]'],
    ['says([1 "a" 2])', '1 a 2'],
  ]
  for (const [src, expected] of cases) assert.equal(out(src), expected, src)
})

test('stable error codes', () => {
  const cases = [
    ['\tsay(1)', 'E001'],
    ['if true\n   say(1)', 'E002'],
    ['say("a\\q")', 'E003'],
    ['say("abc', 'E004'],
    ['xs = [1, 2]', 'E005'],
    ['a = 1; b = 2', 'E005'],
    ['say(1 +)', 'E010'],
    ['1 = 2', 'E011'],
    ['say(nope)', 'E100'],
    ['ret 1', 'E101'],
    ['ensure 1 > 0', 'E102'],
    ['for x in 5\n  say(x)', 'E103'],
    ['fn f(a): ret a\nsay(f(1 2))', 'E104'],
    ['x = 1\nsay(x(2))', 'E105'],
    ['xs = [1]\nsay(xs[5])', 'E106'],
    ['m = {a:1}\nsay(m["b"])', 'E107'],
    ['say(5[0])', 'E108'],
    ['fn f(a:weird): ret a\nsay(f(1))', 'E109'],
    ['if 1: say(1)', 'E110'],
    ['say(1 + "a")', 'E111'],
    ['say(1 / 0)', 'E112'],
    ['say(sum("ab"))', 'E113'],
    ['break', 'E114'],
    ['fn f(): ret f()\nsay(f())', 'E115'],
  ]
  for (const [src, code] of cases) assert.equal(errCode(src), code, src)
})

test('error trace names the call chain', () => {
  try {
    out('fn inner(): ret 1 / 0\nfn outer(): ret inner()\nsay(outer())')
    assert.fail('expected E112')
  } catch (e) {
    assert.equal(e.code, 'E112')
    assert.match(e.format(), /in inner \(called at line 2/)
    assert.match(e.format(), /in outer \(called at line 3/)
  }
})

test('formatter canonicalizes and is idempotent', () => {
  const cases = [
    ['x = x + 1\n', 'x += 1\n'],
    ['x=1+2*3\n', 'x = 1 + 2 * 3\n'],
    ['if a > 0: say(1)\nelse if a < 0: say(2)\nelse: say(3)\n', 'if a > 0: say(1)\nelif a < 0: say(2)\nelse: say(3)\n'],
    ['for x in xs\n  say(x)\n', 'for x in xs: say(x)\n'],
    ['fn f(a)\n  ret a\nsay(f(1))\n', 'fn f(a): ret a\n\nsay(f(1))\n'],
    ['-- intent: demo\nx = 1 -- trailing\n', '-- intent: demo\nx = 1 -- trailing\n'],
    ['xs |> map(f) |> sum() |> say()\n', 'xs |> map(f) |> sum() |> say()\n'],
    ['say((1 if c else 2) + 3)\n', 'say((1 if c else 2) + 3)\n'],
    ['﻿say(1)\n', 'say(1)\n'],
  ]
  for (const [src, expected] of cases) {
    const once = format(src)
    assert.equal(once, expected, JSON.stringify(src))
    assert.equal(format(once), once, `idempotency: ${JSON.stringify(src)}`)
  }
})

test('formatter output runs identically', () => {
  const src = 'fn is_prime(n)\n  if n < 2: ret false\n  d = 2\n  while d * d <= n\n    if n % d == 0: ret false\n    d = d + 1\n  ret true\n\nsays(filter(range(30) is_prime))\n'
  assert.equal(out(format(src)), out(src))
})
