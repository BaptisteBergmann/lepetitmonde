// Run with: node --test scripts/test-offline-queue.mjs
// public/offline/queue.js is a classic browser script, so it is evaluated in a vm context
// and its pure functions are tested directly.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const sandbox = { crypto: globalThis.crypto, console, setTimeout, clearTimeout }
sandbox.self = sandbox
vm.createContext(sandbox)
vm.runInContext(readFileSync(new URL('../public/offline/queue.js', import.meta.url), 'utf8'), sandbox)
const Q = sandbox.OfflineQueue
// Objects built inside the vm context have another Object prototype; compare plain JSON.
const plain = (x) => JSON.parse(JSON.stringify(x))

const U = 'u1'
const B = 'b1'
const ID = '11111111-1111-4111-8111-111111111111'
const T0 = '2026-11-22T02:10:00.000Z'

const start = (over = {}) => ({
  opId: ID, userId: U, babyId: B, type: 'startTimer', createdAt: T0, status: 'pending',
  payload: { id: ID, kind: 'sleep', startedAt: T0 }, ...over,
})
const stop = (endedAt, over = {}) => ({
  opId: 'stop-1', userId: U, babyId: B, type: 'stopTimer', createdAt: '2026-11-22T03:05:00.000Z', status: 'pending',
  payload: { eventId: ID, endedAt }, ...over,
})
const diaper = (id, createdAt) => ({
  opId: id, userId: U, babyId: B, type: 'create', createdAt, status: 'pending',
  payload: { id, kind: 'diaper', pee: true, poop: false, startedAt: createdAt },
})

test('newId returns a v4 UUID', () => {
  assert.match(Q.newId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})

test('start then stop coalesces into one completed create', () => {
  const out = Q.coalesce([start(), stop('2026-11-22T03:05:00.000Z')])
  assert.equal(out.length, 1)
  assert.equal(out[0].type, 'create')
  assert.equal(out[0].opId, ID)
  assert.deepEqual(plain(out[0].payload), { id: ID, kind: 'sleep', startedAt: T0, endedAt: '2026-11-22T03:05:00.000Z' })
})

test('coalesced end is clamped to 24 h after the start', () => {
  const out = Q.coalesce([start(), stop('2026-11-25T00:00:00.000Z')])
  assert.equal(out[0].payload.endedAt, '2026-11-23T02:10:00.000Z')
})

test('coalesced end before the start is clamped to the start', () => {
  const out = Q.coalesce([start(), stop('2026-11-22T01:00:00.000Z')])
  assert.equal(out[0].payload.endedAt, T0)
})

test('stop is kept as a stopTimer while the start is sending', () => {
  const out = Q.coalesce([start({ status: 'sending' }), stop('2026-11-22T03:05:00.000Z')])
  assert.deepEqual(plain(out.map((o) => o.type)), ['startTimer', 'stopTimer'])
})

test('stop for a timer started online is left alone', () => {
  const out = Q.coalesce([stop('2026-11-22T03:05:00.000Z')])
  assert.equal(out.length, 1)
  assert.equal(out[0].type, 'stopTimer')
})

test('coalescing is idempotent and keeps diapers in order', () => {
  const ops = [diaper('d1', '2026-11-22T01:00:00.000Z'), start(), diaper('d2', '2026-11-22T02:30:00.000Z'), stop('2026-11-22T03:05:00.000Z')]
  const once = Q.coalesce(ops)
  assert.deepEqual(plain(once.map((o) => o.opId)), ['d1', ID, 'd2'])
  assert.deepEqual(plain(Q.coalesce(once)), plain(once))
})

test('does not mutate its input', () => {
  const ops = [start(), stop('2026-11-22T03:05:00.000Z')]
  Q.coalesce(ops)
  assert.equal(ops.length, 2)
  assert.equal(ops[0].type, 'startTimer')
})

test('does not merge across babies', () => {
  const out = Q.coalesce([start(), stop('2026-11-22T03:05:00.000Z', { babyId: 'b2' })])
  assert.equal(out.length, 2)
})

test('deriveTimers: queued start is running, from the queue', () => {
  const t = Q.deriveTimers({ ongoing: [] }, [start()], B)
  assert.equal(t.sleep.source, 'queue')
  assert.equal(t.sleep.id, ID)
})

test('deriveTimers: snapshot timer runs until a stop is queued', () => {
  const snap = { ongoing: [{ id: 'srv', kind: 'sleep', started_at: T0 }] }
  assert.equal(Q.deriveTimers(snap, [], B).sleep.source, 'snapshot')
  const stopOp = stop('2026-11-22T03:05:00.000Z', { payload: { eventId: 'srv', endedAt: '2026-11-22T03:05:00.000Z' } })
  assert.equal(Q.deriveTimers(snap, [stopOp], B).sleep, undefined)
})

test('deriveTimers: needs_attention start and other babies do not count', () => {
  assert.deepEqual(plain(Q.deriveTimers(null, [start({ status: 'needs_attention' })], B)), {})
  assert.deepEqual(plain(Q.deriveTimers(null, [start()], 'other')), {})
})

test('deriveTimers: a completed (coalesced) sleep is not running', () => {
  const merged = Q.coalesce([start(), stop('2026-11-22T03:05:00.000Z')])
  assert.deepEqual(plain(Q.deriveTimers(null, merged, B)), {})
})

test('countEntries counts a start+stop pair as one', () => {
  const ops = [start({ status: 'sending' }), stop('2026-11-22T03:05:00.000Z'), diaper('d1', T0)]
  assert.equal(Q.countEntries(ops), 2)
  assert.equal(Q.countEntries([]), 0)
})
