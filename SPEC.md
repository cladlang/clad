# Clad — language specification v0.7

> Clad is an independent community project, not affiliated with or endorsed by Anthropic.

A programming language optimized for LLM code generation (Claude-first): minimal tokens per construct, exactly one canonical form, contracts in the syntax, and error messages designed to be fixed by a model in a single iteration.

File extension: `.clad`. CLI: `clad run file.clad`, `clad fmt [--check] file.clad`.

## Design principles

1. **Token economy weighted by familiarity.** Each construct is the cheapest one that stays close to patterns models already know from Python/JS. Exotic syntax saves tokens but raises generation error rates — this is verified by benchmark, not taste.
2. **One canonical form.** Exactly one way to write and format every construct. `clad fmt` is the identity function on canonical code; diffs are always semantic.
3. **Contracts are part of the language.** `expect` (precondition) and `ensure` (postcondition) are runtime checks in v0.x, with static checking planned.
4. **Errors built for LLMs.** Every error has a stable code, a position, expected/got fields, and a concrete fix hint. See [docs/errors.md](docs/errors.md).

## Lexical structure

- Indentation is significant (2 spaces; tabs are an error). End of line ends a statement; there are no semicolons and no commas — list items, call arguments and parameters are separated by spaces.
- Comment: `-- text` to end of line. No other comment forms.
- Identifiers: `[a-z][a-z0-9_]*` (snake_case).
- Calls have the parenthesis attached to the name: `say(x)`. Indexing is attached too: `xs[0]`.
- A leading UTF-8 BOM is tolerated.

## Data types

`int`, `float`, `str`, `bool`, `list`, `map`, `fn`, `nil`. Dynamic typing; annotations are optional and checked at runtime: `fn add(a:int b:int) -> int`.

Literals:

```
n = 42
s = "hi"            -- escapes: \n \t \" \\
ok = true
xs = [1 2 3]        -- list: space-separated, no commas
m = {a:1 b:2}       -- map; read with m["a"]; keys are strings
nothing = nil
```

## Operators

- Arithmetic: `+ - * / % // **` (`//` floor division, `**` power, right-associative).
- Comparisons: `== != < <= > >=`; `==` compares lists and maps by value (deep). Logic: `and or not`.
- `+` concatenates two lists or two strings.
- Augmented assignment: `x += 1`, also `-= *= /= %=`.
- Conditional expression (as in Python): `a if cond else b`.
- Indexing: `xs[0]`, `s[2]`; negative indexes count from the end: `xs[-1]` is the last element.

## Functions

```
fn fib(n:int) -> int
  expect n >= 0
  if n < 2: ret n
  ret fib(n - 1) + fib(n - 2)
```

- Parameters without commas: `fn f(a b c)`.
- `ret` returns a value; a function without `ret` returns `nil`.
- One-line body after `:`; multi-line body by indentation.
- Lambda: `x -> x * x`; several parameters: `(a b) -> a + b`.

## Contracts

```
fn div(a:float b:float) -> float
  expect b != 0
  ensure result >= 0 or a < 0
  ret a / b
```

`result` is the reserved name of the return value inside `ensure`; all `ensure` clauses are checked on return. A violated contract is error E120/E121 at the contract's position.

## Control flow

```
if x > 0: say("pos")
elif x < 0: say("neg")
else: say("zero")

for x in xs        -- a list or a string (over characters)
  say(x)

while n > 0
  n -= 1
```

Conditions must be `bool` — there is no implicit truthiness (E110). `break` and `continue` work inside loops.

## Pipeline

`|>` passes the value as the first argument of the next call:

```
xs |> filter(x -> x % 2 == 0) |> map(x -> x * x) |> sum() |> say()
```

## Standard library

`say` (prints arguments space-separated), `says` (prints list elements space-separated: `xs |> says()`), `len`, `push`, `map`, `filter`, `fold`, `scan`, `count`, `range`, `keys`, `vals`, `pairs`, `has`, `idx`, `slice`, `rev`, `uniq`, `freq`, `group`, `sort`, `maxby`, `minby`, `flat`, `join`, `split`, `replace`, `lines`, `lower`, `upper`, `cap` (capitalize first letter), `title` (capitalize every word), `str`, `int`, `float`, `abs`, `min`, `max`, `sum`, `gcd`, `ord`, `chr`, `zip`, `runs`, `chunks`.

Signatures of the non-obvious ones:

- `range(n)` / `range(a b)` / `range(a b step)` — step may be negative.
- `count(xs f)` — number of elements where `f` is `true`.
- `freq(xs)` — frequency map of string elements: `split(s) |> freq()`.
- `sort(xs)` / `sort(xs f)` — stable ascending sort; `f` is a key: number, string, or list (compared lexicographically): `sort(ws w -> [len(w) w])`.
- `split(s)` — on whitespace (as in Python); `split(s sep)` — on a separator.
- `idx(xs v)` — first index of a value (substring for strings), `-1` if absent.
- `slice(xs a b)` — sublist/substring `[a, b)`; negative indexes count from the end.
- `uniq(xs)` — duplicates removed, first-occurrence order.
- `pairs(m)` — list of `[key value]` pairs.
- `has(c k)` — map key / list element / substring. `replace(s a b)` — replace all occurrences.
- `min` / `max` — a pair of numbers or a list. `ord(c)` / `chr(n)` — character code and back.
- `scan(xs init f)` — like `fold`, but returns the list of all intermediate values.
- `maxby(xs f)` / `minby(xs f)` — element with the largest/smallest key `f` (first on ties).
- `group(xs f)` — map from key to the list of elements with that key: `group(ws w -> w[0])`.
- `flat(xs)` — flattens a list of lists by one level.
- `join(xs sep)` — non-string elements are stringified automatically: `join([1 2] " ")` → `"1 2"`.
- `float(x)` — number or numeric string to a number. `zip(a b)` — list of `[a[i] b[i]]` pairs up to the shorter length.
- `lines(s)` — split on `\n`. `runs(xs)` — runs of equal adjacent elements as `[value count]` pairs: `runs("aab")` → `[[a 2] [b 1]]`.
- `chunks(xs n)` — split into chunks of n: `chunks([1 2 3 4] 2)` → `[[1 2] [3 4]]`.

`map`, `filter`, `fold`, `count`, `sort`, `uniq`, `freq` accept a list or a string (a string acts as the list of its characters; the result is always a list): `"text" |> count(c -> has("aeiou" c))`.

## Canonical format (`clad fmt`)

- 2-space indentation; one space around binary operators; no space after `(` or before `)`.
- The one-line `:` form is mandatory when the body is a single simple statement; block form when there are more or the body is compound (`if`/`for`/`while`).
- `x = x + 1` canonicalizes to `x += 1`; `else if` chains to `elif`.
- Exactly one blank line between functions. No trailing whitespace.
- `clad fmt file` rewrites the file into canonical form (comments are preserved); `clad fmt --check file` verifies without writing and exits non-zero on deviations. The formatter is idempotent and never changes program semantics.

## Error format

```
err E012 line 4 col 9
  expected: function call after '|>'
  got: newline
  fix: write target as a call, e.g. |> map(f)
```

Error codes are stable (for model self-repair); `fix` is a concrete action. Runtime errors carry the call chain (`in f (called at line N col M)`). The full code reference is in [docs/errors.md](docs/errors.md). Recursion is limited to 500 frames (E115).

## Out of scope for v0.x

Modules/imports, classes, concurrency, static typing, compilation.

## Benchmark (the primary artifact)

35 tasks (algorithms + data processing). For each, Claude generates a solution in Clad (given only this spec) and in Python; we measure (1) solution token count on the real Claude tokenizer and (2) iterations until the output matches and `clad fmt --check` passes. Current results: tokens −15.1% vs Python, 35/35 tasks solved. See `bench/`.
