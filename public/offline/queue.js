// Durable offline queue for tracker entries (diaper and sleep in Phase 1).
//
// One classic script shared by the static offline page (<script> tag), the Next client
// (src/utils/offline/queue-client.ts injects it) and, later, the service worker
// (importScripts). It attaches a single global, `OfflineQueue`. Do not copy it into src/.
//
// Storage: IndexedDB `lepetitmonde-offline` v1.
//   ops       keyPath opId, index userId. { opId, userId, babyId, type, payload, createdAt, status, error? }
//             type: 'create' | 'startTimer' | 'stopTimer'; status: 'pending' | 'sending' | 'needs_attention'.
//             For create and startTimer, opId equals the new row's UUID (the server's idempotency key).
//   snapshots keyPath [userId, babyId]. Last-known tracker state; never notes or member names.
//   meta      keyPath key. { key, value }: lastUserId, lastBabyId, schema.
// The server replay contract is POST /api/tracker/sync (see src/app/api/tracker/sync/route.ts).
(function (root) {
  'use strict';

  var DB_NAME = 'lepetitmonde-offline';
  var DB_VERSION = 1;
  var SYNC_URL = '/api/tracker/sync';
  var LOCK_NAME = 'lepetitmonde-offline-drain';
  var CHANNEL_NAME = 'lepetitmonde-offline';
  var BATCH_SIZE = 25;
  var PROBE_TIMEOUT_MS = 4000;
  var SEND_TIMEOUT_MS = 20000;
  var DAY_MS = 24 * 60 * 60 * 1000;
  var PURGE_AFTER_MS = 30 * DAY_MS;
  // A op the server keeps failing on (not rejecting) would otherwise retry forever and block
  // the ones behind it: after this many sends it becomes needs_attention and can be discarded.
  var MAX_ATTEMPTS = 5;

  // ---------------------------------------------------------------------------------------
  // Pure functions (no DOM, no IndexedDB): unit-tested with node.
  // ---------------------------------------------------------------------------------------

  function newId() {
    var c = root.crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    var b = new Uint8Array(16);
    c.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return (x + 0x100).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  function clampEnd(startedAt, endedAt) {
    var start = Date.parse(startedAt);
    var end = Date.parse(endedAt);
    if (isNaN(start) || isNaN(end)) return endedAt;
    return new Date(Math.min(Math.max(end, start), start + DAY_MS)).toISOString();
  }

  function byCreatedAt(a, b) {
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  }

  // A stop whose start is still queued (pending) becomes one completed `create`, end clamped to
  // 24 h. It never touches the one-running-timer-per-kind index on the server. A start that is
  // already `sending`, or may have reached the server (`attempted`), is left alone and the stop
  // stays a normal stopTimer with the same id: a create for an id the server already has is a
  // no-op, so merging there would silently lose the stop time.
  // Returns a new list ordered by createdAt; the input is not mutated.
  function coalesce(ops) {
    var out = [];
    ops.slice().sort(byCreatedAt).forEach(function (op) {
      if (op.type === 'stopTimer') {
        var idx = -1;
        for (var i = 0; i < out.length; i++) {
          var o = out[i];
          if (o.type === 'startTimer' && o.status === 'pending' && !o.attempted && o.userId === op.userId &&
              o.babyId === op.babyId && o.payload.id === op.payload.eventId) { idx = i; break; }
        }
        if (idx !== -1) {
          var start = out[idx];
          var payload = {
            id: start.payload.id,
            kind: start.payload.kind,
            startedAt: start.payload.startedAt,
            endedAt: clampEnd(start.payload.startedAt, op.payload.endedAt),
          };
          var side = op.payload.side || start.payload.side;
          if (side) payload.side = side;
          out[idx] = {
            opId: start.opId, userId: start.userId, babyId: start.babyId, type: 'create',
            payload: payload, createdAt: start.createdAt, status: 'pending',
          };
          return;
        }
      }
      out.push(op);
    });
    return out;
  }

  // Which timers look running right now for one baby: a queued start with no stop, or a
  // snapshot timer (started online) with no queued stop. needs_attention starts are not running.
  // Returns { [kind]: { id, startedAt, source: 'queue' | 'snapshot', status? } }.
  function deriveTimers(snapshot, ops, babyId) {
    var timers = {};
    var stopped = {};
    var babyOps = ops.filter(function (o) { return o.babyId === babyId; });
    babyOps.forEach(function (o) { if (o.type === 'stopTimer') stopped[o.payload.eventId] = true; });
    var ongoing = (snapshot && snapshot.ongoing) || [];
    ongoing.forEach(function (t) {
      if (!stopped[t.id]) timers[t.kind] = { id: t.id, startedAt: t.started_at, source: 'snapshot' };
    });
    babyOps.slice().sort(byCreatedAt).forEach(function (o) {
      if (o.type !== 'startTimer' || o.status === 'needs_attention' || stopped[o.payload.id]) return;
      timers[o.payload.kind] = { id: o.payload.id, startedAt: o.payload.startedAt, source: 'queue', status: o.status };
    });
    return timers;
  }

  // Entries as a parent counts them: a stop appended to a sending start is part of that entry.
  function countEntries(ops) {
    var starts = {};
    ops.forEach(function (o) { if (o.type === 'startTimer') starts[o.payload.id] = true; });
    return ops.filter(function (o) { return !(o.type === 'stopTimer' && starts[o.payload.eventId]); }).length;
  }

  // ---------------------------------------------------------------------------------------
  // IndexedDB plumbing
  // ---------------------------------------------------------------------------------------

  var dbPromise = null;
  var listeners = [];
  var channel = null;

  function isAvailable() {
    try { return !!root.indexedDB; } catch { return false; }
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!isAvailable()) { reject(new Error('indexedDB unavailable')); return; }
      var req = root.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('ops')) {
          db.createObjectStore('ops', { keyPath: 'opId' }).createIndex('userId', 'userId');
        }
        if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: ['userId', 'babyId'] });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = function () {
        var db = req.result;
        // A newer worker/page wants to upgrade: release the connection.
        db.onversionchange = function () { db.close(); dbPromise = null; };
        resolve(db);
      };
      req.onerror = function () { reject(req.error || new Error('indexedDB open failed')); };
      req.onblocked = function () { reject(new Error('indexedDB blocked')); };
    });
    dbPromise.catch(function () { dbPromise = null; });
    return dbPromise;
  }

  // Runs fn(stores, tx) in one transaction. Resolves with fn's return value only on
  // tx.oncomplete, so a caller that sees success knows the data is durable.
  function withTx(storeNames, mode, fn, txOptions) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = txOptions ? db.transaction(storeNames, mode, txOptions) : db.transaction(storeNames, mode);
        var stores = {};
        storeNames.forEach(function (n) { stores[n] = tx.objectStore(n); });
        var result;
        tx.oncomplete = function () { resolve(result); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error || new Error('transaction aborted')); };
        try { result = fn(stores, tx); } catch (e) { try { tx.abort(); } catch { /* already done */ } reject(e); }
      });
    });
  }

  function notify() {
    listeners.slice().forEach(function (cb) { try { cb(); } catch { /* listener bug must not break the queue */ } });
    try {
      if (!channel && typeof root.BroadcastChannel === 'function') channel = new root.BroadcastChannel(CHANNEL_NAME);
      if (channel) channel.postMessage('changed');
    } catch { /* best effort */ }
  }

  // cb runs after any queue change, in this context or another tab/page of the origin.
  function subscribe(cb) {
    listeners.push(cb);
    var rx = null;
    try {
      if (typeof root.BroadcastChannel === 'function') {
        rx = new root.BroadcastChannel(CHANNEL_NAME);
        rx.onmessage = function () { try { cb(); } catch { /* ignore */ } };
      }
    } catch { rx = null; }
    return function () {
      listeners = listeners.filter(function (l) { return l !== cb; });
      if (rx) rx.close();
    };
  }

  // ---------------------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------------------

  function getMeta() {
    return withTx(['meta'], 'readonly', function (s) {
      var out = {};
      var all = s.meta.getAll();
      all.onsuccess = function () { all.result.forEach(function (r) { out[r.key] = r.value; }); };
      return out;
    });
  }

  function getSnapshots(userId) {
    return withTx(['snapshots'], 'readonly', function (s) {
      var holder = { list: [] };
      var all = s.snapshots.getAll();
      all.onsuccess = function () {
        holder.list = all.result.filter(function (x) { return x.userId === userId; });
      };
      return holder;
    }).then(function (h) { return h.list; });
  }

  function listOps(userId) {
    return withTx(['ops'], 'readonly', function (s) {
      var holder = { list: [] };
      var all = s.ops.index('userId').getAll(userId);
      all.onsuccess = function () { holder.list = all.result.slice().sort(byCreatedAt); };
      return holder;
    }).then(function (h) { return h.list; });
  }

  function listAllOps() {
    return withTx(['ops'], 'readonly', function (s) {
      var holder = { list: [] };
      var all = s.ops.getAll();
      all.onsuccess = function () { holder.list = all.result; };
      return holder;
    }).then(function (h) { return h.list; });
  }

  // Entries waiting on this device (needs_attention included). Without an argument it counts
  // the last user's entries; { all: true } counts every user's, for logout.
  function pendingCount(opts) {
    if (opts && opts.all) return listAllOps().then(countEntries);
    return getMeta().then(function (meta) {
      var userId = (opts && opts.userId) || meta.lastUserId;
      return userId ? listOps(userId).then(countEntries) : 0;
    });
  }

  // ---------------------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------------------

  function requestPersistence() {
    try {
      if (root.navigator && root.navigator.storage && root.navigator.storage.persist) {
        root.navigator.storage.persist().catch(function () { /* advisory */ });
      }
    } catch { /* advisory */ }
  }

  var persistRequested = false;
  // Resolve only once the data is flushed to disk, not merely handed to the OS.
  var STRICT = { durability: 'strict' };

  // Adds one op and re-coalesces the user's queue in the same transaction. Resolves with the op
  // that was stored (a stop merged into its start resolves with the merged `create`).
  // opts.attempted: the same tap may already have reached the server (a request that timed out
  // or failed after being sent), so it must never be merged into a create.
  function enqueue(userId, babyId, type, payload, opts) {
    if (!persistRequested) { persistRequested = true; requestPersistence(); }
    var op = {
      opId: type === 'stopTimer' ? newId() : payload.id,
      userId: userId, babyId: babyId, type: type, payload: payload,
      createdAt: new Date().toISOString(), status: 'pending',
    };
    if (opts && opts.attempted) op.attempted = true;
    return withTx(['ops'], 'readwrite', function (s) {
      var holder = { op: op };
      var all = s.ops.index('userId').getAll(userId);
      all.onsuccess = function () {
        var existing = all.result;
        var next = coalesce(existing.concat([op]));
        var keep = {};
        next.forEach(function (n) { keep[n.opId] = true; s.ops.put(n); });
        existing.forEach(function (e) { if (!keep[e.opId]) s.ops.delete(e.opId); });
        // The stop merged into its start: report the merged row.
        if (!keep[op.opId]) {
          holder.op = next.filter(function (n) { return n.payload && n.payload.id === op.payload.eventId; })[0] || op;
        }
      };
      return holder;
    }, STRICT).then(function (h) { notify(); return h.op; });
  }

  // Undo, Remove and Discard. A queued stop that targets the removed start goes with it.
  function removeOp(opId) {
    return withTx(['ops'], 'readwrite', function (s) {
      var get = s.ops.get(opId);
      get.onsuccess = function () {
        var op = get.result;
        if (!op) return;
        s.ops.delete(opId);
        if (op.type === 'startTimer') {
          var all = s.ops.index('userId').getAll(op.userId);
          all.onsuccess = function () {
            all.result.forEach(function (o) {
              if (o.type === 'stopTimer' && o.payload.eventId === op.payload.id) s.ops.delete(o.opId);
            });
          };
        }
      };
    }, STRICT).then(notify);
  }

  function setStatus(opIds, status, error) {
    return withTx(['ops'], 'readwrite', function (s) {
      opIds.forEach(function (id) {
        var get = s.ops.get(id);
        get.onsuccess = function () {
          var op = get.result;
          if (!op) return;
          op.status = status;
          if (error) op.error = error; else delete op.error;
          s.ops.put(op);
        };
      });
    });
  }

  // Back to pending after a send that didn't settle. A failed attempt counts toward
  // MAX_ATTEMPTS; past it the op becomes needs_attention instead of blocking the queue forever.
  function release(op, penalize) {
    if (!penalize) op.attempts = Math.max(0, (op.attempts || 1) - 1);
    if (penalize && (op.attempts || 0) >= MAX_ATTEMPTS) {
      op.status = 'needs_attention';
      op.error = { status: 'rejected', code: 'tooManyAttempts' };
    } else {
      op.status = 'pending';
      delete op.error;
    }
  }

  function releaseBatch(opIds) {
    return withTx(['ops'], 'readwrite', function (s) {
      opIds.forEach(function (id) {
        var get = s.ops.get(id);
        get.onsuccess = function () { if (get.result) { release(get.result, true); s.ops.put(get.result); } };
      });
    });
  }

  // The server refused the whole batch as malformed: retrying the same bytes can't help.
  function quarantineBatch(opIds) {
    return withTx(['ops'], 'readwrite', function (s) {
      opIds.forEach(function (id) {
        var get = s.ops.get(id);
        get.onsuccess = function () {
          var op = get.result;
          if (!op) return;
          op.status = 'needs_attention';
          op.error = { status: 'rejected', code: 'malformed' };
          s.ops.put(op);
        };
      });
    });
  }

  // Picks the next pending ops and marks them sending in one transaction, so the batch that is
  // sent is exactly the batch that was claimed. `attempted` records that the server may now
  // have them even if the response is lost.
  function claimBatch(userId) {
    return withTx(['ops'], 'readwrite', function (s) {
      var holder = { batch: [] };
      var all = s.ops.index('userId').getAll(userId);
      all.onsuccess = function () {
        holder.batch = all.result
          .filter(function (o) { return o.status === 'pending'; })
          .sort(byCreatedAt)
          .slice(0, BATCH_SIZE);
        holder.batch.forEach(function (o) {
          o.status = 'sending';
          o.attempted = true;
          o.attempts = (o.attempts || 0) + 1;
          s.ops.put(o);
        });
      };
      return holder;
    }).then(function (h) { return h.batch; });
  }

  function applyResults(batch, results) {
    var byId = {};
    results.forEach(function (r) { byId[r.opId] = r; });
    return withTx(['ops'], 'readwrite', function (s) {
      batch.forEach(function (op) {
        var r = byId[op.opId];
        var get = s.ops.get(op.opId);
        get.onsuccess = function () {
          var cur = get.result;
          if (!cur) return; // removed locally while sending
          if (r && r.status === 'applied') { s.ops.delete(op.opId); return; }
          if (r && (r.status === 'conflict' || r.status === 'rejected' || r.status === 'forbidden')) {
            cur.status = 'needs_attention';
            cur.error = { status: r.status, code: r.error || null };
          } else {
            // 'retry' counts as a failed attempt; an op with no result was never processed.
            release(cur, !!r);
          }
          s.ops.put(cur);
        };
      });
    });
  }

  // Snapshot of what the tracker last showed. Another user's snapshots (and meta) are dropped
  // the first time this user writes one, so a shared phone never offers the previous account's babies.
  function saveSnapshot(userId, babyId, snapshot) {
    var record = {};
    Object.keys(snapshot).forEach(function (k) { record[k] = snapshot[k]; });
    record.userId = userId;
    record.babyId = babyId;
    record.savedAt = new Date().toISOString();
    return withTx(['snapshots', 'meta'], 'readwrite', function (s) {
      var all = s.snapshots.getAll();
      all.onsuccess = function () {
        all.result.forEach(function (x) {
          if (x.userId !== userId) s.snapshots.delete([x.userId, x.babyId]);
        });
      };
      s.snapshots.put(record);
      s.meta.put({ key: 'lastUserId', value: userId });
      s.meta.put({ key: 'lastBabyId', value: babyId });
      s.meta.put({ key: 'schema', value: DB_VERSION });
    }).then(function () { return purge(); });
  }

  function setLastBaby(babyId) {
    return withTx(['meta'], 'readwrite', function (s) { s.meta.put({ key: 'lastBabyId', value: babyId }); });
  }

  // Ops nobody opened the app for in 30 days (typically another account's) are dropped.
  function purge() {
    var cutoff = new Date(Date.now() - PURGE_AFTER_MS).toISOString();
    return withTx(['ops'], 'readwrite', function (s) {
      var all = s.ops.getAll();
      all.onsuccess = function () {
        all.result.forEach(function (o) { if (o.createdAt < cutoff) s.ops.delete(o.opId); });
      };
    });
  }

  // Logout on a shared phone must not leave anyone's entries or babies behind, so every store
  // is emptied (not only the current user's).
  function clearForLogout() {
    return withTx(['ops', 'snapshots', 'meta'], 'readwrite', function (s) {
      s.ops.clear();
      s.snapshots.clear();
      s.meta.clear();
    }).then(notify);
  }

  // ---------------------------------------------------------------------------------------
  // Reachability and replay
  // ---------------------------------------------------------------------------------------

  function timedFetch(url, init, ms) {
    var ctrl = typeof root.AbortController === 'function' ? new root.AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms) : null;
    var options = Object.assign({}, init);
    if (ctrl) options.signal = ctrl.signal;
    return root.fetch(url, options).then(
      function (r) { if (timer) clearTimeout(timer); return r; },
      function (e) { if (timer) clearTimeout(timer); throw e; }
    );
  }

  function isJson(response) {
    var type = response.headers.get('content-type') || '';
    return type.toLowerCase().indexOf('application/json') === 0;
  }

  // reachable (with userId) | sessionExpired | unreachable. A Cloudflare 502 page resolves
  // fetch(), so the response is inspected: only the route's own JSON counts.
  function probe() {
    if (root.navigator && root.navigator.onLine === false) return Promise.resolve({ state: 'unreachable' });
    return timedFetch(SYNC_URL, { method: 'GET', cache: 'no-store', redirect: 'manual', credentials: 'same-origin' }, PROBE_TIMEOUT_MS)
      .then(function (res) {
        if (res.type === 'opaqueredirect' || !isJson(res)) return { state: 'unreachable' };
        return res.json().then(function (body) {
          if (res.status === 200 && body && body.ok === true && typeof body.userId === 'string') {
            return { state: 'reachable', userId: body.userId };
          }
          if (res.status === 401) return { state: 'sessionExpired' };
          return { state: 'unreachable' };
        });
      })
      .catch(function () { return { state: 'unreachable' }; });
  }

  async function drainLocked() {
    var p = await probe();
    if (p.state !== 'reachable') return { state: p.state, sent: 0 };
    var userId = p.userId;

    // A previous run may have died mid-request: those ops were never confirmed.
    var all = await listOps(userId);
    var stale = all.filter(function (o) { return o.status === 'sending'; }).map(function (o) { return o.opId; });
    if (stale.length) await setStatus(stale, 'pending');

    var sent = 0;
    for (;;) {
      var batch = await claimBatch(userId);
      if (!batch.length) break;
      var ids = batch.map(function (o) { return o.opId; });
      notify();

      var res;
      try {
        res = await timedFetch(SYNC_URL, {
          method: 'POST',
          cache: 'no-store',
          redirect: 'manual',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            v: 1,
            userId: userId,
            ops: batch.map(function (o) { return { opId: o.opId, babyId: o.babyId, type: o.type, payload: o.payload }; }),
          }),
        }, SEND_TIMEOUT_MS);
      } catch {
        await releaseBatch(ids);
        notify();
        return { state: 'failed', sent: sent };
      }

      // 401, 409, 503 and anything unexpected: keep everything and stop.
      var body = null;
      if (res.status === 200 && isJson(res)) { try { body = await res.json(); } catch { body = null; } }
      if (!body || !Array.isArray(body.results)) {
        // 400/413: the batch itself is unacceptable, so quarantine it and carry on with the rest.
        if (res.status === 400 || res.status === 413) {
          await quarantineBatch(ids);
          notify();
          continue;
        }
        await releaseBatch(ids);
        notify();
        var state = res.status === 401 ? 'sessionExpired' : res.status === 409 ? 'userMismatch' : 'failed';
        return { state: state, sent: sent };
      }

      await applyResults(batch, body.results);
      notify();
      var retry = false;
      body.results.forEach(function (r) {
        if (r.status === 'applied') sent++;
        if (r.status === 'retry') retry = true;
      });
      // A retry ends the server's batch; unprocessed ops came back without a result.
      if (retry || body.results.length < batch.length) return { state: 'failed', sent: sent };
    }
    return { state: 'drained', sent: sent };
  }

  // One drain at a time across tabs and pages (Web Locks when available).
  function drain() {
    var locks = root.navigator && root.navigator.locks;
    if (locks && typeof locks.request === 'function') {
      return locks.request(LOCK_NAME, { ifAvailable: true }, function (lock) {
        return lock ? drainLocked() : { state: 'busy', sent: 0 };
      });
    }
    return drainLocked();
  }

  root.OfflineQueue = {
    DB_NAME: DB_NAME,
    // pure
    release: release, newId: newId, coalesce: coalesce, clampEnd: clampEnd, deriveTimers: deriveTimers, countEntries: countEntries,
    // storage
    isAvailable: isAvailable, openDb: openDb, getMeta: getMeta, getSnapshots: getSnapshots, listOps: listOps,
    pendingCount: pendingCount, enqueue: enqueue, removeOp: removeOp, saveSnapshot: saveSnapshot,
    setLastBaby: setLastBaby, purge: purge, clearForLogout: clearForLogout, subscribe: subscribe,
    // network
    probe: probe, drain: drain,
  };
})(typeof self !== 'undefined' ? self : globalThis);
