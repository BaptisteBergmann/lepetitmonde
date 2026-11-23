// Typed loader for public/offline/queue.js, the single source of the offline queue (also used
// by the static offline page). It is injected as a classic script instead of bundled so the
// two consumers can never drift apart. Browser only.

export type OfflineOpType = 'create' | 'startTimer' | 'stopTimer'
export type OfflineOpStatus = 'pending' | 'sending' | 'needs_attention'

export type OfflineOp = {
  opId: string
  userId: string
  babyId: string
  type: OfflineOpType
  payload: Record<string, unknown>
  createdAt: string
  status: OfflineOpStatus
  error?: { status: 'conflict' | 'rejected' | 'forbidden'; code: string | null }
}

export type OfflineSnapshot = {
  userId: string
  babyId: string
  babyName: string
  locale: string
  strings: Record<string, string>
  ongoing: { id: string; kind: string; started_at: string; breast_side: string | null }[]
  lastDiaper: { started_at: string; pee: boolean | null; poop: boolean | null } | null
  lastSleep: { started_at: string; ended_at: string | null } | null
  savedAt: string
}

export type ProbeResult =
  | { state: 'reachable'; userId: string }
  | { state: 'sessionExpired' }
  | { state: 'unreachable' }

export type DrainResult = {
  state: 'drained' | 'failed' | 'sessionExpired' | 'userMismatch' | 'unreachable' | 'busy'
  sent: number
}

export type OfflineTimer = { id: string; startedAt: string; source: 'queue' | 'snapshot'; status?: OfflineOpStatus }

export type OfflineQueueApi = {
  newId(): string
  isAvailable(): boolean
  getMeta(): Promise<{ lastUserId?: string; lastBabyId?: string }>
  getSnapshots(userId: string): Promise<OfflineSnapshot[]>
  listOps(userId: string): Promise<OfflineOp[]>
  pendingCount(opts?: { userId?: string; all?: boolean }): Promise<number>
  enqueue(userId: string, babyId: string, type: OfflineOpType, payload: Record<string, unknown>): Promise<OfflineOp>
  removeOp(opId: string): Promise<void>
  // snapshot fields userId, babyId and savedAt are set by the queue
  saveSnapshot(userId: string, babyId: string, snapshot: Omit<OfflineSnapshot, 'userId' | 'babyId' | 'savedAt'>): Promise<void>
  setLastBaby(babyId: string): Promise<void>
  purge(): Promise<void>
  clearForLogout(): Promise<void>
  subscribe(cb: () => void): () => void
  probe(): Promise<ProbeResult>
  drain(): Promise<DrainResult>
  coalesce(ops: OfflineOp[]): OfflineOp[]
  deriveTimers(snapshot: Pick<OfflineSnapshot, 'ongoing'> | null, ops: OfflineOp[], babyId: string): Record<string, OfflineTimer>
  countEntries(ops: OfflineOp[]): number
}

declare global {
  interface Window {
    OfflineQueue?: OfflineQueueApi
  }
}

const SCRIPT_SRC = '/offline/queue.js'
let loading: Promise<OfflineQueueApi> | null = null

export function loadOfflineQueue(): Promise<OfflineQueueApi> {
  if (typeof window === 'undefined') return Promise.reject(new Error('offline queue is browser-only'))
  if (window.OfflineQueue) return Promise.resolve(window.OfflineQueue)
  if (loading) return loading
  loading = new Promise<OfflineQueueApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () => {
      if (window.OfflineQueue) resolve(window.OfflineQueue)
      else reject(new Error('offline queue script did not register'))
    }
    script.onerror = () => reject(new Error('offline queue script failed to load'))
    document.head.appendChild(script)
  }).catch((err) => {
    // Allow a later retry (for example after the network returns).
    loading = null
    throw err
  })
  return loading
}
