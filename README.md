# Clad

[![ci](https://github.com/cladlang/clad/actions/workflows/ci.yml/badge.svg)](https://github.com/cladlang/clad/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/clad-lang)](https://www.npmjs.com/package/clad-lang)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

A token-minimal programming language designed for LLM code generation (Claude-first, works with any model).

**Try it in your browser: [cladlang.github.io/clad](https://cladlang.github.io/clad/)** — the site runs the real interpreter. Updates: [x.com/cladlang](https://x.com/cladlang).

> Clad is an independent community project, not affiliated with or endorsed by Anthropic.

## Why

- **Fewer tokens.** No commas, no semicolons, no braces — every construct picked for minimal tokenizer cost while staying close to patterns models already know.
- **One canonical form.** Exactly one way to write and format each construct; diffs are always semantic.
- **Contracts built in.** `expect` / `ensure` runtime guards as part of the language.
- **Errors built for self-repair.** Stable error codes with `expected / got / fix` fields so a model can fix its code in one iteration.

## Quick start

```
git clone https://github.com/cladlang/clad && cd clad
node src/cli.js run examples/fib.clad
node src/cli.js fmt --check examples/fib.clad
```

Or `npm install && npm link` to get the `clad` command. Requires Node ≥ 20. Run the test suite with `npm test`.

## Taste

```
fn fib(n:int) -> int
  expect n >= 0
  if n < 2: ret n
  ret fib(n - 1) + fib(n - 2)

range(10) |> filter(x -> x % 2 == 0) |> map(x -> x * x) |> sum() |> say()
```

Full language reference: [SPEC.md](SPEC.md). Error code reference: [docs/errors.md](docs/errors.md). Examples: [examples/](examples/).

## Status

v0.7 — release candidate: regression test suite (`npm test`), CI, recursion limits and call-chain tracebacks in errors, packaged CLI. Working tree-walking interpreter and canonical formatter (`clad fmt`, with `--check`; comment-preserving, idempotent). Python-habit operators (`**`, `//`, `+=`, ternary `a if c else b`, `elif`, `break`/`continue`, negative indexing, deep `==`, `+` on lists), iterable strings, and a dense stdlib covering Python's (`freq`, `group`, `scan`, `runs`, `chunks`, `zip`, `maxby`, `uniq`, `flat`, `says`, `title`, …).

Benchmarks vs Python over 35 tasks, now including data-processing-heavy ones ([bench/results/](bench/results/)):

- **Tokens: 1557 vs 1834 (−15.1%)** on the real Claude tokenizer; Clad cheaper or equal on 31/35 tasks.
- **Iterations to green** (since v0.6 a Clad solution must also pass `clad fmt --check`): v0.4 run — 25/25 first-attempt on both claude-opus-4-8 and claude-fable-5; v0.6 run (35 tasks, fmt enforced) — **35/35 passed, 40 vs 35 attempts**, first-attempt output correct on 34/35, and every extra attempt (mostly formatter canonicalization) self-repaired in exactly one round.

Next: static checks for contracts, more data-processing tasks.
