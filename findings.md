# Bug Investigation: "Oops, sorry!" on Challenge Resume

## Summary

Clicking "Resume" on the challenge page for **"Phenomena of Sound Waves — Calculations"**
(`/subscriptions/269986/classes/1160860/modules/107798/posts/125696`) crashes the React component
tree and displays the generic error page.

The crash is caused by **two independent bugs** coinciding: a malformed HTML entity in the question
content, and a Terser minification bug in a transitive dependency. Either bug fixed alone would
prevent the crash.

---

## Reproduction

1. Navigate to `https://preview.getatomi.com/subscriptions/269986/classes/1160860/modules/107798/posts/125696`
2. Click **Resume**
3. Result: "Oops, sorry! An unexpected error has occurred."

---

## Root Cause

### Bug 1 — Content: `&nbsp` missing semicolon

The question prompt contains:

```
_An ambulance travelling at 60&nbspkm/h drives past you..._
```

The HTML entity `&nbsp` is missing its closing semicolon (should be `&nbsp;`). This causes
`parse-entities` (the HTML entity decoder used by `remark-parse`) to emit a `namedNotTerminated`
warning (type code `1`).

### Bug 2 — Code: Terser minification bug in `vfile-message` v1.1.1

The `VMessage` constructor (used by `vfile` to create parser warnings) is broken in the minified
Next.js bundle. During minification, Terser inlined the `parseOrigin()` helper function and renamed
its local variable `parts` → `s` for most references, but **missed the final two**.

**Source** (`vfile-message@1.1.1/index.js`):
```js
function VMessage(reason, position, origin) {
  var parts                    // declared
  // ...
  parts = parseOrigin(origin)  // assigned
  // ...
  this.source = parts[0]       // used
  this.ruleId = parts[1]       // used
}
```

**Minified bundle** (module `38846` in `6790-1ed91b0810ab8a1c.js`):
```js
function a(e,t,n){
  var o,i,a,l,s;
  s=[null,null],              // 'parts' correctly renamed to 's' ✓
  // ... parseOrigin inlined using 's' ...
  this.source=parts[0],       // 'parts' NOT renamed → ReferenceError ✗
  this.ruleId=parts[1]        // 'parts' NOT renamed → ReferenceError ✗
}
```

`parts` appears **only twice** in the entire chunk — both as broken undefined references.

---

## Full Crash Chain

```
Question prompt: "...60&nbspkm/h..."
                        ↓
parse-entities@1.2.2 — sees '&nbsp' without ';'
  → warning type: namedNotTerminated (code = 1)
  → calls: handleWarning.call(ctx, messages[1], position, 1)
                        ↓
remark-parse decode module warning function:
  function n(t, n, r) { 3 !== r && e.file.message(t, n) }
  → 3 !== 1 → true → calls e.file.message(msg, position)
                        ↓
vfile.message() → new VMessage(msg, position, origin)
                        ↓
Minified VMessage constructor:
  this.source = parts[0]  ← ReferenceError: parts is not defined
                        ↓
React component throws
  → Error boundary catches
  → "Oops, sorry! An unexpected error has occurred."
```

**Note:** Warning type `3` (`namedEmpty`, e.g. a bare `&&`) is intentionally suppressed by
remark's decode module (`3 !== r` is false). Type `1` (`namedNotTerminated`, triggered by
`&nbsp` without `;`) is **not** suppressed, so it always reaches the broken constructor.

---

## Package Hierarchy

```
@app/learn  (frontend/apps/learn)
├── @getatomi/neon @ 59.18.0                        ← direct dependency
│   ├── react-markdown @ 4.3.1
│   │   └── remark-parse @ 5.0.0
│   │       └── parse-entities @ 1.2.2
│   │           └── vfile → vfile-message @ 1.1.1   ← CRASH (minification bug)
│   ├── remark-math @ 2.0.1
│   ├── remark-attr @ 0.11.1
│   ├── remark-macro @ 1.0.7
│   └── remark-terms @ 2.1.2
│
├── @package/content-ui @ workspace:*               ← (frontend/packages/content-ui)
│   ├── peerDep: @getatomi/neon @ 59.18.0
│   └── [no neon bundled — resolves from learn app]
│
└── @getatomi/product-components @ workspace:*      ← (packages/product-components)
    └── peerDep: @getatomi/neon @ 59.18.0
```

**Crash path through components:**

```
@app/learn
  └── challenges/pages/SelfMarkedQuestionPage
        └── @package/content-ui › SelfMarkedQuestion
              └── SelfMarkedQuestionBody
                    └── MarkdownPrompt
                          └── <Markdown> from @getatomi/neon
                                └── ReactMarkdown (react-markdown@4.3.1)
                                      └── remark-parse@5.0.0
                                            └── parse-entities@1.2.2
                                                  ↓ &nbsp warning (type 1)
                                            vfile-message@1.1.1 [MINIFIED - BROKEN]
                                                  ↓ ReferenceError: parts is not defined
```

`content-ui` declares neon as a `peerDependency` only — it does not bundle neon. The `Markdown`
component and its entire transitive dependency chain (including the broken `vfile-message`) come
from the **learn app's** direct copy of `@getatomi/neon @ 59.18.0`.

---

## Fixes

Either fix alone is sufficient to stop the crash.

### Fix A — Content (immediate)

Change `&nbsp` → `&nbsp;` in the question prompt. No parse warning is emitted; `VMessage` is
never called.

**Affected content:** Post ID `125696`, prompt text containing `60&nbspkm/h`.

### Fix B — Code (durable)

Fix the minification bug so `VMessage` works correctly. Remark would emit a harmless warning,
content would still render. Options:

1. **Upgrade neon's markdown stack** — move from `react-markdown@4` (remark v5 / old tokenizer
   API) to `react-markdown@9` (remark v14 / micromark). This would update `vfile-message` to a
   modern version not affected by this minification issue. All remark plugins would need
   updating accordingly (`remark-math`, `remark-attr`, etc.).

2. **Patch Terser config in Next.js** — disable the function inlining that causes the variable
   rename to fail (e.g. set `compress: { inline: 0 }` for the affected module). Lower-risk
   short-term workaround.

---

## Regression Introduction

The bug was introduced by commit **`afda17cec9`** on **2026-02-23**, PR #3307:
`fix(deps): upgrade Next.js to 15.5.10 (GHSA-h25m + CVE-2025-59471)`

| | Before (master prior to #3307) | After |
|---|---|---|
| `next` | `14.2.35` | `15.5.10` |
| `@next/swc-*` (SWC minifier) | `14.2.33` | `15.5.7` |

The upgrade jumped directly from `next@14.2.35` / SWC `14.2.33` to `next@15.5.10` / SWC `15.5.7`
in a single merge. The intermediate `next@15.0.8` step existed only on the `PROD-10710` feature
branch and was never independently live on master.

Next.js has used the **SWC minifier** by default since v13 (`swcMinify: true`). The learn app has
no override (`next.config.mjs` contains no `swcMinify` or `terser` configuration), so the bundled
`@next/swc` binary is the active minifier.

The SWC `15.x` minifier introduced a function-inlining behaviour for the `parseOrigin()` helper
in `vfile-message@1.1.1` that partially renames the local variable `parts` → `s`, but leaves the
final two property assignments (`this.source = parts[0]`, `this.ruleId = parts[1]`) unrenamed.
The SWC `14.x` minifier did not exhibit this behaviour.

The `vfile-message@1.1.1` source code and the question content both predate this PR — only the
minifier changed.

---

## Additional Observations

- The Apollo cache warning (`An error occurred! ... ensure all objects of type Account have an ID`)
  is a separate, pre-existing issue unrelated to this crash.
- `remark-gfm@4.0.1` is listed in neon's `package.json` but is incompatible with
  `react-markdown@4` (which requires remark v5). It does not appear in the active plugin list in
  `createRenderers.tsx`, but its presence in the dependency tree indicates an unresolved version
  inconsistency in the neon markdown stack.
