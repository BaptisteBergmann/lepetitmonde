import 'server-only'
import type { logger } from '@utils/logger'

// For effects that run after the required write has already committed
// (Photos-page mirror, ...). Throwing there rolls nothing back; it only skips
// whatever comes next and shows the user an error for something that exists.
export async function bestEffort(log: typeof logger, label: string, fn: () => Promise<unknown>) {
  try {
    await fn()
  } catch (err) {
    log.error(err, label)
  }
}
