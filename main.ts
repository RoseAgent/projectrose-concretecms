import { registerHandlers } from './src/main/handlers'
import { CCMS_TOOLS } from './src/main/tools'
import type { ExtensionMainContext } from './src/main/types'

export function register(ctx: ExtensionMainContext): () => void {
  ctx.registerSensitiveFields(['ccmsCreds'])
  ctx.registerTools(CCMS_TOOLS)
  return registerHandlers(ctx)
}
