# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in.

If **`CONTEXT.md`** is missing, **proceed silently** for that file only. For **`docs/adr/`**, the folder exists; read ADRs that apply to your task. Add a new ADR when you lock in a stable decision worth recording. The producer skill (`/grill-with-docs`) can extend the glossary or ADRs when terminology or decisions are actually resolved.

## File structure

Single-context repo:

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── README.md
│   ├── 0000-template.md
│   └── 0001-pocketbase-cost-and-platform.md
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal. Either you're inventing language the project doesn't use (reconsider), or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (some-decision), but worth reopening because…_
