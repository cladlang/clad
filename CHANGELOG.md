# Changelog

## 0.7.0 — 2026-06-13

First published release: [npm](https://www.npmjs.com/package/clad-lang) · [GitHub](https://github.com/cladlang/clad).

- Regression test suite (`npm test`), GitHub Actions CI.
- Recursion depth limit (E115), call-chain tracebacks in errors, E999 for internal failures, optional `maxSteps` for embedding (E116).
- English spec (now the canonical SPEC.md), error-code reference (docs/errors.md), `clad --version`.
- Web playground at [cladlang.github.io/clad](https://cladlang.github.io/clad/).

## 0.6.0 — 2026-06-12

- Stdlib: `float`, `zip`, `cap`, `title`, `lines`, `runs`, `chunks`.
- Benchmark grown to 35 tasks (data processing); tokens −15.1% vs Python.
- `clad fmt --check` enforced in the iterations benchmark loop.

## 0.5.0 — 2026-06-12

- `clad fmt` — canonical formatter (`--check`, comment-preserving, idempotent).
- Pipes survive formatting; `x = x + 1` → `x += 1`; `else if` → `elif`.

## 0.4.0 — 2026-06-12

- Operators: `**`, `//`, `+= -= *= /= %=`, ternary `a if c else b`, `elif`, `break`/`continue`, negative indexing, deep `==`, `+` on lists.
- Stdlib: `count`, `freq`, `group`, `scan`, `maxby`/`minby`, `uniq`, `idx`, `slice`, `pairs`, `ord`/`chr`, `replace`, `flat`, `says`, `range` step, sort keys.
- 25-task benchmark; tokens −16.2% vs Python; iterations 25/25 first-attempt.

## 0.3.0 — 2026-06-12

- Strings are iterable; pipes inside call arguments; targeted comma/semicolon error fixes; BOM tolerated.
- First token win over Python (−0.7% on 10 tasks).

## 0.2.0 — 2026-06-12

- Dense stdlib pass; real-Claude-tokenizer benchmark; iterations-to-green benchmark.

## 0.1.0 — 2026-06-12

- Working tree-walking interpreter, contracts (`expect`/`ensure`), pipeline operator.
