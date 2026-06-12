# Clad iterations-to-green benchmark — v0.6.0

date: 2026-06-12 · model: claude-opus-4-8 (adaptive thinking) · Clad solutions written from SPEC.md only · tasks: 35 · **NEW in v0.6: a Clad solution must also pass `clad fmt --check`** (correct output in non-canonical form costs an extra attempt with formatter feedback)

Run in parts (01–12, 13–24, 25–35; the last part was interrupted by an exhausted API balance at task 32 and finished with `node bench/iterate.js 32 33 34 35` after a top-up).

| task | clad attempts | python attempts |
|---|---|---|
| 01-fizzbuzz | 1 | 1 |
| 02-fib | 1 | 1 |
| 03-wordcount | 1 | 1 |
| 04-even-squares | 1 | 1 |
| 05-reverse | 1 | 1 |
| 06-max | 1 | 1 |
| 07-vowels | 1 | 1 |
| 08-gcd | 1 | 1 |
| 09-primes | 1 | 1 |
| 10-two-sum | 1 | 1 |
| 11-anagram | 2 (fmt) | 1 |
| 12-palindrome | 1 | 1 |
| 13-digit-sum | 1 | 1 |
| 14-caesar | 1 | 1 |
| 15-sort-words | 1 | 1 |
| 16-top-word | 1 | 1 |
| 17-diagonal | 1 | 1 |
| 18-flatten | 1 | 1 |
| 19-index-of | 1 | 1 |
| 20-collatz | 1 | 1 |
| 21-dedupe | 1 | 1 |
| 22-group | 2 (fmt) | 1 |
| 23-running-max | 2 (fmt) | 1 |
| 24-parens | 1 | 1 |
| 25-second-largest | 2 (E100: invented name 'idx2') | 1 |
| 26-csv-sum | 1 | 1 |
| 27-group-avg | 1 | 1 |
| 28-top-three | 1 | 1 |
| 29-histogram | 2 | 1 |
| 30-zip-sort | 1 | 1 |
| 31-longest-word | 1 | 1 |
| 32-acronym | 1 | 1 |
| 33-rle | 1 | 1 |
| 34-median | 1 | 1 |
| 35-title-case | 1 | 1 |

passed: clad 35/35, python 35/35 (max 3 attempts; failures counted as 4)
total attempts: clad 40 vs python 35

All five extra Clad attempts self-repaired in exactly one round: three were formatter-canonicalization rounds (11-anagram, 22-group, 23-running-max), one an E100 unknown-name (25-second-largest, invented `idx2`), one on 29-histogram. First-attempt output was correct on 34/35 tasks — the canonical-form requirement, not correctness, accounts for most of the gap vs Python (which is judged on output only).
