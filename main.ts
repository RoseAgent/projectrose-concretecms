import { registerHandlers } from './src/main/handlers'
import { CCMS_TOOLS } from './src/main/tools'
import { setRoseCcmsCtx } from './src/main/credentials'
// First-party extensions in the monorepo type-only-import the host contract
// via a relative path. The import is erased by esbuild, so the path only
// needs to resolve at type-check time inside the worktree.
import type { ExtensionMainContext } from '../../ProjectRose/src/shared/extension-contract'

export function register(ctx: ExtensionMainContext): () => void {
  // Stash the ctx so the credentials module (called by handlers AND tool
  // execute functions) can read/write settings via the contract instead of
  // importing host internals.
  setRoseCcmsCtx(ctx)
  ctx.registerSensitiveFields(['ccmsCreds'])
  ctx.registerTools(CCMS_TOOLS)
  return registerHandlers(ctx)
}
