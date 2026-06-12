# Clad benchmarks

Two benchmarks, both saved to `bench/results/` on every run.

## 1. Token cost — `node bench/run.js`

Each task has an idiomatic solution in Clad and in Python that must print identical output. The runner executes both, verifies the outputs match, and compares source token counts.

- **Tokenizer:** with `ANTHROPIC_API_KEY` set, counts use the **real Claude tokenizer** via the `count_tokens` API (model `claude-opus-4-8`; counts include a small constant message-envelope overhead, identical for both languages). Without a key, falls back to the `o200k_base` proxy (js-tiktoken). Result files are tagged `-claude` / `-o200k`.
- Solutions are comment-free, untyped and idiomatic for each language (Python is allowed slicing, comprehensions, stdlib — no handicapping). Clad type annotations and contracts are optional features and are not used in solutions, matching the untyped Python style.

## 2. Iterations to green — `node bench/iterate.js` (requires `ANTHROPIC_API_KEY`)

For each task, Claude (default `claude-opus-4-8`; override with `CLAD_MODEL=claude-fable-5`) writes a solution **in Clad given only SPEC.md** — the model has never seen the language — and separately in Python. The harness runs the program, feeds compiler/runtime errors or output mismatches back, and counts attempts until the output matches the reference (max 3). A Clad solution must additionally pass `clad fmt --check`: correct output in non-canonical form costs an extra attempt with formatter feedback. This measures how easily a model can actually write the language (and its one canonical form), which is where new languages usually lose to Python.

## Caveats

- 35 tasks is still a modest sample; treat per-task percentages as noisy.
- The iterations benchmark costs real API money (roughly $4–10 per full run on Opus, ~2x on Fable). Pass task-name prefixes to run a subset: `node bench/iterate.js 01 02`.
- Python solutions are judged on output only (Python has no single canonical form to enforce).
- Execution speed of the Clad interpreter is NOT benchmarked and is not a goal of v0.x.
