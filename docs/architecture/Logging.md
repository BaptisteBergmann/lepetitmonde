---
tags: [lepetitmonde/architecture]
---

# Logging

Up: [[Le petit monde]] · See also [[Coding conventions]]

- **Pino**, exported from `src/utils/logger.ts`. Pretty-printed debug logs in development (`pino-pretty`), structured JSON at `info` in production (read with `docker logs` / Portainer).
- `console.log` is not used.
- Every Server Action and route starts with a child logger carrying its context:

```ts
import { logger } from '@/utils/logger'

export async function createPost(babyId: string, formData: FormData) {
  const contextLogger = logger.child({ function: createPost.name, babyId })
  contextLogger.info('Creating post')
}
```

- Sensitive values are never logged raw: auth headers are redacted, share-link ids are logged through `shareLogId()`, tokens never appear.
- Optional client performance metrics: `web-vitals-reporter.tsx` posts to `/api/vitals` when `WEB_VITALS_ENABLED=true`.
