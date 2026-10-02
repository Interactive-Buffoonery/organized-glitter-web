# PocketBase type generation

Organized Glitter commits canonical PocketBase TypeScript types in `src/types/pocketbase.types.ts`.

Type generation is explicit. It does **not** run automatically before `pnpm dev` because normal dev startup should not mutate committed generated files or depend on whichever PocketBase instance `.env` points at.

## Commands

### Generate canonical committed types

```bash
pnpm pb:types
```

This loads `.env` and writes:

```txt
src/types/pocketbase.types.ts
```

Use this when the canonical PocketBase schema changes and the generated types should be committed.

Required environment variables:

- `POCKETBASE_URL`
- `POCKETBASE_ADMIN_EMAIL`
- `POCKETBASE_ADMIN_PASSWORD`

### Generate local development types

```bash
pnpm pb:types:local
```

This loads `.env` and writes:

```txt
src/types/pocketbase.types.local.ts
```

Required environment variables:

- `LOCAL_POCKETBASE_URL`
- `LOCAL_POCKETBASE_ADMIN_EMAIL`
- `LOCAL_POCKETBASE_ADMIN_PASSWORD`

## Workflow

1. Make or deploy the PocketBase schema change.
2. Run the appropriate typegen command intentionally.
3. Review the generated diff before committing.
4. Run:

```bash
pnpm typecheck
pnpm lint --max-warnings=0
```

5. Commit the generated type changes with the schema/app change that requires them.

## Why typegen is not part of `predev`

`pnpm dev` should mean “start the app.” It should not also connect to a live PocketBase instance and overwrite committed generated types.

Keeping typegen explicit avoids:

- dirty working trees from normal dev startup
- accidental prod/local schema drift
- hidden failures where typegen fails but Vite still starts
- agent confusion when generated files change before any code edits
