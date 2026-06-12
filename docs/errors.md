# Clad error codes

Every error has a stable code, a `line`/`col` position, `expected`/`got` fields and a concrete `fix` hint. Runtime errors also carry the call chain (`in f (called at line N col M)`). Codes never change meaning between versions; new codes may be added.

## Lexer (E0xx)

| Code | Meaning |
|---|---|
| E001 | Tab character (Clad uses 2-space indentation) |
| E002 | Bad indentation (not a multiple of 2, or skipping levels) |
| E003 | Unsupported string escape (only `\n` `\t` `\"` `\\`) |
| E004 | Unterminated string literal |
| E005 | Invalid character — including targeted hints for `,` (Clad separates items with spaces) and `;` (a newline ends a statement) |

## Parser (E01x) 

| Code | Meaning |
|---|---|
| E010 | Unexpected token (general parse error; `expected` says what was needed) |
| E011 | Invalid assignment target (only a name or an indexed element) |
| E012 | `|>` target is not a call |

## Runtime (E1xx)

| Code | Meaning |
|---|---|
| E100 | Unknown name |
| E101 | `ret` outside a function |
| E102 | `ensure` outside a function |
| E103 | `for` over a non-iterable (needs a list or a string) |
| E104 | Wrong number of arguments |
| E105 | Calling a non-function |
| E106 | List/string index out of bounds or not an int |
| E107 | Missing or non-string map key |
| E108 | Indexing a non-collection |
| E109 | Unknown type name in an annotation |
| E110 | Type check failed (annotations, and non-`bool` in conditions — no truthiness) |
| E111 | Operand type mismatch for an operator |
| E112 | Division (or `%`, `//`) by zero |
| E113 | Wrong argument type for a builtin |
| E114 | `break`/`continue` outside a loop |
| E115 | Recursion depth over 500 |
| E116 | Step limit exceeded (only when the host sets `maxSteps`, e.g. the web playground) |

## Contracts (E12x)

| Code | Meaning |
|---|---|
| E120 | `expect` precondition violated |
| E121 | `ensure` postcondition violated |

## Internal

| Code | Meaning |
|---|---|
| E199 | Unknown AST node (interpreter bug — please report) |
| E999 | Unexpected internal error (printed by the CLI — please report) |
