# Worker Changelog — t_cd8d4939

## Summary

Restored the skipped component test by fixing the JSX transform / Vitest config ESM issue.

---

## Files Created

| File | Reason |
|------|--------|
| `implementation/vitest.config.mts` | ESM-format vitest config. Identical content to old `vitest.config.ts`, but the `.mts` extension causes Vitest to load it via Node's ESM loader instead of esbuild's CJS bundler, which was rejecting the ESM-only `@vitejs/plugin-react-swc` package. |

## Files Deleted

| File | Reason |
|------|--------|
| `implementation/vitest.config.ts` | Replaced by `vitest.config.mts`. Kept identical configuration; only the file extension changed. |

## Files Modified

None. (Product source files are unchanged. Test files are unchanged. `package.json` is unchanged.)

## Behavior Changes

| Area | Before | After |
|------|--------|-------|
| `npm run test` | **Startup error** — esbuild could not load vitest config (ESM-only plugin imported in CJS context). Zero tests ran. | **10/10 suites pass, 67/67 tests pass**. Component test suite (`tests/components/components.test.tsx`) now runs and all 6 tests pass. |
| JSX transform in tests | SWC plugin unreachable (config failed to load) | SWC plugin loaded correctly; JSX `.tsx` files transform as expected |

## Dependency Changes

None. No packages added, removed, or version-changed.

## Rationale

`@vitejs/plugin-react-swc` v4.3.3 is `"type":"module"` (ESM-only). Vitest 2.x bundles `vitest.config.ts` with esbuild targeting CJS so the bundled config can be `require()`'d. The `externalize-deps` plugin rejects ESM-only external packages, causing a startup error.

Renaming the config to `.mts` (Module TypeScript) causes Vitest to use Node's native ESM loader instead of the esbuild bundler, cleanly resolving the incompatibility without changing any configuration values or product code.

## Limitations / Side Notes

- `npm run test` previously failed with "Permission denied" because `node_modules/.bin/vitest` lacked executable bit. Fixed with `chmod +x`. This is a local filesystem permission artifact and not a code-level issue.
- E2E tests are still out of scope for this task (Playwright, manual QA with camera).
