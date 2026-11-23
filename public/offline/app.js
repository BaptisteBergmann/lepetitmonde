// Offline quick-log page. Plain script (no framework, no bundler). Everything on screen comes
// from the HTML shell, the strings saved in IndexedDB by the live tracker, and the device
// clock. All dynamic text goes through textContent; nothing is injected as HTML.
// Phase 1: diaper (pee/poop/both) and sleep start/stop. Entries keep the time they were tapped.
(function () {
  'use strict';

  var Q = self.OfflineQueue;
  var NS = 'http://www.w3.org/2000/svg';
  var UNDO_MS = 8000;
  var DOUBLE_TAP_MS = 600;
  var FLASH_MS = 1500;
  var RETURN_DELAY_MS = 1200;
  var RECENT_TAP_MS = 4000;
  var BACKOFF_S = [5, 15, 30, 60];
  var MAX_ROWS = 50;
  var OLD_ROW_MS = 7 * 24 * 60 * 60 * 1000;

  var fallbackAll = {};
  try { fallbackAll = JSON.parse(document.getElementById('fallback-strings').textContent); } catch { /* defaults below */ }
  var browserLang = ((navigator.language || 'en').toLowerCase().indexOf('fr') === 0) ? 'fr' : 'en';
  var fallback = fallbackAll[browserLang] || fallbackAll.en || {};

  var state = {
    storage: true,
    userId: null,
    snapshots: [],
    babyId: null,
    snapshot: null,
    pickerHint: false,
    picking: false,
    ops: [],
    allOps: [],
    net: 'checking',      // checking | unreachable | reachable | sessionExpired
    banner: 'unreachable',
    syncing: 0,
    confirmation: null,   // { text, opId, undoUntil }
    flash: null,
    tapLockUntil: 0,
    lastTapAt: 0,
    backoffIndex: 0,
  };
  var timers = { backoff: null, undo: null, flash: null, ret: null };

  // ------------------------------------------------------------------------ helpers

  function $(id) { return document.getElementById(id); }

  function strings() { return (state.snapshot && state.snapshot.strings) || (state.snapshots[0] && state.snapshots[0].strings) || null; }
  function locale() {
    var s = state.snapshot || state.snapshots[0];
    return (s && s.locale) || navigator.language || 'en';
  }

  // Tiny ICU subset: {name}, {n, plural, one {...} other {...}} with #. Enough for our messages.
  function matchBrace(msg, open) {
    var depth = 0;
    for (var i = open; i < msg.length; i++) {
      if (msg[i] === '{') depth++;
      else if (msg[i] === '}') { depth--; if (depth === 0) return i; }
    }
    return msg.length - 1;
  }
  function fmt(msg, vals, hash) {
    var out = '';
    var i = 0;
    while (i < msg.length) {
      var ch = msg[i];
      if (ch === '{') {
        var end = matchBrace(msg, i);
        out += expr(msg.slice(i + 1, end), vals);
        i = end + 1;
      } else if (ch === '#' && hash !== undefined) {
        out += hash; i++;
      } else { out += ch; i++; }
    }
    return out;
  }
  function expr(inner, vals) {
    var m = /^\s*(\w+)\s*(?:,\s*(\w+)\s*,([\s\S]*))?$/.exec(inner);
    if (!m) return '';
    var value = vals[m[1]];
    if (m[2] !== 'plural') return value === undefined || value === null ? '' : String(value);
    var body = m[3];
    var options = {};
    var re = /\s*(=\d+|\w+)\s*\{/g;
    var pos = 0;
    var found;
    while ((found = re.exec(body.slice(pos))) !== null) {
      var open = pos + found.index + found[0].length - 1;
      var close = matchBrace(body, open);
      options[found[1]] = body.slice(open + 1, close);
      pos = close + 1;
      re.lastIndex = 0;
    }
    var n = Number(value);
    var cat = options['=' + n] !== undefined ? '=' + n : new Intl.PluralRules(locale()).select(n);
    var chosen = options[cat] !== undefined ? options[cat] : options.other || '';
    return fmt(chosen, vals, n);
  }
  function t(key, vals) {
    var s = strings();
    var msg = (s && s[key] !== undefined) ? s[key] : fallback[key];
    if (msg === undefined) return '';
    return fmt(msg, vals || {});
  }

  function h(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }
  function icon(name, spin) {
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'icon' + (spin ? ' spin' : ''));
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS(NS, 'use');
    use.setAttribute('href', '#i-' + name);
    svg.appendChild(use);
    return svg;
  }
  function announce(text) {
    var el = $('sr-status');
    el.textContent = '';
    // A second tick so the same sentence is announced twice in a row.
    setTimeout(function () { el.textContent = text; }, 30);
  }
  function setSaveError(text) { $('save-error').textContent = text || ''; }

  function isIos() {
    return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  // ------------------------------------------------------------------------ formatting

  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
  function timeOnly(iso) {
    return new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  }
  // Time of day, with the day name when it isn't today ("Yesterday 11:50 PM").
  function timeLabel(iso) {
    var d = new Date(iso);
    var days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
    if (days <= 0) return timeOnly(iso);
    if (days === 1) return t('yesterday', { time: timeOnly(iso) });
    return new Intl.DateTimeFormat(locale(), { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(d);
  }
  function durationText(ms) {
    var minutes = Math.max(0, Math.floor(ms / 60000));
    var hrs = Math.floor(minutes / 60);
    var m = minutes % 60;
    if (hrs > 0 && m > 0) return t('durationHm', { h: hrs, m: m });
    if (hrs > 0) return t('durationH', { h: hrs });
    return t('durationM', { m: m });
  }
  function agoText(iso) {
    var diff = Date.now() - new Date(iso).getTime();
    var rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
    var minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t('durationNow');
    if (minutes < 60) return rtf.format(-minutes, 'minute');
    var hrs = Math.floor(minutes / 60);
    if (hrs < 24) return rtf.format(-hrs, 'hour');
    return rtf.format(-Math.floor(hrs / 24), 'day');
  }
  function diaperLabel(pee, poop) {
    if (pee && poop) return t('diaperBothRow');
    return poop ? t('diaperPoop') : t('diaperPee');
  }

  // ------------------------------------------------------------------------ data

  function babyOps() {
    return state.ops.filter(function (o) { return o.babyId === state.babyId; });
  }
  function babyName(id) {
    var s = state.snapshots.filter(function (x) { return x.babyId === id; })[0];
    return s ? s.babyName : '';
  }

  async function refreshOps() {
    if (!state.storage || !state.userId) { state.ops = []; return; }
    state.ops = await Q.listOps(state.userId);
  }

  function chooseBaby(preferredFromUrl, lastBabyId) {
    var byId = {};
    state.snapshots.forEach(function (s) { byId[s.babyId] = s; });
    state.pickerHint = false;
    if (preferredFromUrl && byId[preferredFromUrl]) return preferredFromUrl;
    if (preferredFromUrl && state.snapshots.length) state.pickerHint = true;
    if (!state.pickerHint && lastBabyId && byId[lastBabyId]) return lastBabyId;
    if (!state.pickerHint && state.snapshots.length === 1) return state.snapshots[0].babyId;
    return null;
  }

  function selectBaby(id) {
    state.babyId = id;
    state.snapshot = state.snapshots.filter(function (s) { return s.babyId === id; })[0] || null;
    state.picking = false;
    if (id) Q.setLastBaby(id).catch(function () { /* advisory */ });
    var lang = locale().slice(0, 2);
    document.documentElement.lang = lang;
  }

  // ------------------------------------------------------------------------ actions

  async function tapGuard() {
    var now = Date.now();
    if (now < state.tapLockUntil) return false;
    state.tapLockUntil = now + DOUBLE_TAP_MS;
    state.lastTapAt = now;
    document.querySelectorAll('[data-tap]').forEach(function (b) { b.setAttribute('aria-disabled', 'true'); });
    setTimeout(function () {
      document.querySelectorAll('[data-tap]').forEach(function (b) { b.removeAttribute('aria-disabled'); });
    }, DOUBLE_TAP_MS);
    return true;
  }

  function savedText(extra) {
    var named = state.snapshots.length > 1;
    var base = named
      ? t('savedOnPhoneFor', { name: state.snapshot.babyName, time: timeOnly(new Date().toISOString()) })
      : t('savedOnPhone', { time: timeOnly(new Date().toISOString()) });
    return extra ? base + ': ' + extra : base;
  }

  function showConfirmation(text, opId, srText) {
    clearTimeout(timers.undo);
    state.confirmation = { text: text, opId: opId || null, undoUntil: opId ? Date.now() + UNDO_MS : 0 };
    if (opId) {
      // After 8 s the Undo goes away; the row keeps its own Remove.
      timers.undo = setTimeout(function () {
        if (state.confirmation && state.confirmation.opId === opId) state.confirmation = { text: state.confirmation.text, opId: null, undoUntil: 0 };
        render();
      }, UNDO_MS);
    }
    announce(srText || text);
  }

  async function logDiaper(kind) {
    if (!(await tapGuard())) return;
    setSaveError('');
    var pee = kind !== 'poop';
    var poop = kind !== 'pee';
    var startedAt = new Date().toISOString();
    var op;
    try {
      op = await Q.enqueue(state.userId, state.babyId, 'create', { id: Q.newId(), kind: 'diaper', startedAt: startedAt, pee: pee, poop: poop });
    } catch {
      setSaveError(t('saveFailed'));
      return;
    }
    state.flash = kind;
    clearTimeout(timers.flash);
    timers.flash = setTimeout(function () { state.flash = null; render(); }, FLASH_MS);
    showConfirmation(savedText(diaperLabel(pee, poop)), op.opId, t('savedOnPhone', { time: timeOnly(startedAt) }));
    await refreshOps();
    render({ focusKey: 'diaper-' + kind });
    scheduleDrainSoon();
  }

  async function undo(opId) {
    try { await Q.removeOp(opId); } catch { setSaveError(t('saveFailed')); return; }
    state.confirmation = null;
    announce(t('undone'));
    await refreshOps();
    render({ focusKey: 'diaper-pee' });
  }

  async function startSleep() {
    if (!(await tapGuard())) return;
    setSaveError('');
    try {
      await Q.enqueue(state.userId, state.babyId, 'startTimer', { id: Q.newId(), kind: 'sleep', startedAt: new Date().toISOString() });
    } catch { setSaveError(t('saveFailed')); return; }
    showConfirmation(savedText(), null, t('sleepStartSaved'));
    await refreshOps();
    render({ focusKey: 'sleep-stop' });
    scheduleDrainSoon();
  }

  async function stopSleep(timer) {
    if (!(await tapGuard())) return;
    setSaveError('');
    try {
      await Q.enqueue(state.userId, state.babyId, 'stopTimer', { eventId: timer.id, endedAt: new Date().toISOString() });
    } catch { setSaveError(t('saveFailed')); return; }
    showConfirmation(savedText(), null, t('sleepStopSaved'));
    await refreshOps();
    render({ focusId: 'sleep-heading' });
    scheduleDrainSoon();
  }

  function ask(opts) {
    return new Promise(function (resolve) {
      var dlg = $('confirm');
      $('confirm-title').textContent = opts.title;
      $('confirm-body').textContent = opts.body;
      $('confirm-ok').textContent = opts.confirm;
      $('confirm-cancel').textContent = opts.cancel;
      dlg.returnValue = '';
      $('confirm-ok').onclick = function () { dlg.close('yes'); };
      $('confirm-cancel').onclick = function () { dlg.close('no'); };
      dlg.onclose = function () { resolve(dlg.returnValue === 'yes'); };
      dlg.showModal();
    });
  }

  async function removeEntry(op, attention) {
    var running = op.type === 'startTimer';
    var ok = await ask({
      title: attention ? t('discardTitle') : running ? t('removeSleepTitle') : t('removeTitle'),
      body: attention ? t('discardBody') : t('removeBody'),
      confirm: attention ? t('discard') : t('removeConfirm'),
      cancel: t('keep'),
    });
    if (!ok) { render({ focusKey: 'row-' + op.opId }); return; }
    try { await Q.removeOp(op.opId); } catch { setSaveError(t('saveFailed')); return; }
    if (state.confirmation && state.confirmation.opId === op.opId) state.confirmation = null;
    announce(t('undone'));
    await refreshOps();
    render({ focusId: 'pending-heading' });
  }

  // ------------------------------------------------------------------------ rendering

  function render(opts) {
    opts = opts || {};
    var active = document.activeElement;
    var keepKey = opts.focusKey || (active && active.dataset ? active.dataset.key : null);

    var main = $('main');
    main.setAttribute('aria-busy', 'false');
    main.textContent = '';

    renderBanner();
    $('open-app').textContent = t('tryOpening');

    if (!state.storage) {
      main.appendChild(h('section', { class: 'card' }, [h('p', { class: 'muted', text: t('storageUnavailable') })]));
      return;
    }
    if (!state.snapshots.length) {
      main.appendChild(h('section', { class: 'card' }, [
        h('h1', { class: 'h-serif', text: t('noSnapshotTitle') }),
        h('p', { class: 'muted', text: t('noSnapshot') }),
      ]));
      return;
    }
    if (!state.babyId || state.picking) {
      renderPicker(main);
      return;
    }

    var titleRow = h('div', { class: 'title-row' }, [
      h('div', {}, [
        h('p', { class: 'muted', text: t('babyLabel') }),
        h('h1', { class: 'h-serif', text: state.snapshot.babyName }),
      ]),
      state.snapshots.length > 1 ? h('button', { type: 'button', class: 'btn btn-ghost', 'data-key': 'change-baby', onclick: function () { state.picking = true; render({ focusKey: 'picker-first' }); }, text: t('changeBaby') }) : null,
    ]);
    main.appendChild(titleRow);
    main.appendChild(renderDiaper());
    main.appendChild(renderSleep());
    var line = renderConfirmation();
    if (line) main.appendChild(line);
    var attention = renderAttention();
    if (attention) main.appendChild(attention);
    var pending = renderPending();
    if (pending) main.appendChild(pending);
    var others = renderOthers();
    if (others) main.appendChild(others);

    var target = null;
    if (opts.focusId) target = $(opts.focusId) || (opts.focusId === 'pending-heading' ? $('diaper-heading') : null);
    else if (keepKey) target = document.querySelector('[data-key="' + keepKey + '"]');
    if (target) target.focus();
  }

  function renderPicker(main) {
    var list = h('div', { class: 'picker' }, state.snapshots.map(function (s, i) {
      return h('button', {
        type: 'button', class: 'btn', 'data-key': i === 0 ? 'picker-first' : null,
        onclick: function () { selectBaby(s.babyId); refreshOps().then(function () { render(); }); },
      }, [s.babyName]);
    }));
    main.appendChild(h('section', { class: 'card' }, [
      h('h1', { class: 'h-serif', text: t('chooseBaby') }),
      h('p', { class: 'muted', text: state.pickerHint ? t('babyNotReady') : t('chooseBabyHint') }),
      list,
    ]));
    var first = main.querySelector('[data-key="picker-first"]');
    if (first && state.picking) first.focus();
  }

  var DIAPERS = [
    { key: 'pee', icon: 'droplet', label: 'diaperPee', aria: 'logPee' },
    { key: 'poop', icon: 'circle-dot', label: 'diaperPoop', aria: 'logPoop' },
    { key: 'both', icon: 'droplets', label: 'diaperBoth', aria: 'logBoth' },
  ];

  function lastDiaperText() {
    // Newest of the snapshot and anything queued here since.
    var last = state.snapshot.lastDiaper ? { at: state.snapshot.lastDiaper.started_at, pee: state.snapshot.lastDiaper.pee, poop: state.snapshot.lastDiaper.poop } : null;
    babyOps().forEach(function (o) {
      if (o.type === 'create' && o.payload.kind === 'diaper' && (!last || o.payload.startedAt > last.at)) {
        last = { at: o.payload.startedAt, pee: o.payload.pee, poop: o.payload.poop };
      }
    });
    if (!last) return t('noDiaper');
    return t('lastDiaper', { type: diaperLabel(last.pee, last.poop), ago: agoText(last.at) });
  }

  function renderDiaper() {
    var buttons = DIAPERS.map(function (d) {
      var flashing = state.flash === d.key;
      return h('button', {
        type: 'button', class: 'btn diaper-btn', 'data-tap': true, 'data-key': 'diaper-' + d.key,
        'aria-label': t(d.aria),
        'aria-disabled': Date.now() < state.tapLockUntil ? 'true' : null,
        onclick: function (e) { if (e.currentTarget.getAttribute('aria-disabled') === 'true') return; logDiaper(d.key); },
      }, [icon(flashing ? 'check' : d.icon), h('span', { text: flashing ? t('saved') : t(d.label) })]);
    });
    return h('section', { class: 'card', 'aria-labelledby': 'diaper-heading' }, [
      h('div', { class: 'card-head' }, [
        h('h2', { id: 'diaper-heading', class: 'label', tabindex: '-1', text: t('diaperHeading') || 'Diaper' }),
        h('p', { class: 'muted', text: lastDiaperText() }),
      ]),
      h('div', { class: 'diaper-grid' }, buttons),
    ]);
  }

  function currentSleep() { return Q.deriveTimers(state.snapshot, state.ops, state.babyId).sleep || null; }

  function renderSleep() {
    var timer = currentSleep();
    if (!timer) {
      return h('section', { class: 'card', 'aria-labelledby': 'sleep-heading' }, [
        h('h2', { id: 'sleep-heading', class: 'label', tabindex: '-1', text: t('sleepHeading') || 'Sleep' }),
        h('p', { class: 'sleep-line' }, [icon('moon'), t('sleepIdle')]),
        h('button', { type: 'button', class: 'btn btn-primary', 'data-tap': true, 'data-key': 'sleep-start', onclick: function (e) { if (e.currentTarget.getAttribute('aria-disabled') !== 'true') startSleep(); } }, [t('startSleep')]),
      ]);
    }
    var elapsed = durationText(Date.now() - new Date(timer.startedAt).getTime());
    return h('section', { class: 'card card-running', 'aria-labelledby': 'sleep-heading' }, [
      h('h2', { id: 'sleep-heading', class: 'label', tabindex: '-1', text: t('sleepHeading') || 'Sleep' }),
      h('p', { class: 'running-title' }, [icon('moon'), h('span', { text: t('sleepRunning', { duration: elapsed }) }), h('span', { class: 'dot', 'aria-hidden': 'true' })]),
      h('p', { class: 'muted', text: t('sleepStartedAt', { time: timeLabel(timer.startedAt) }) }),
      timer.source === 'snapshot' ? h('p', { class: 'muted', text: t('sleepFromSnapshot', { time: timeOnly(state.snapshot.savedAt) }) }) : null,
      h('button', { type: 'button', class: 'btn btn-primary', 'data-tap': true, 'data-key': 'sleep-stop', onclick: function (e) { if (e.currentTarget.getAttribute('aria-disabled') !== 'true') stopSleep(timer); } }, [t('stopSleep')]),
    ]);
  }

  function renderConfirmation() {
    var c = state.confirmation;
    if (!c) return null;
    var canUndo = c.opId && Date.now() < c.undoUntil;
    // aria-hidden: the same text is announced through #sr-status.
    return h('div', { class: 'confirm-line', 'aria-hidden': 'true' }, [
      icon('check'),
      h('span', { class: 'text', text: c.text }),
      canUndo ? h('button', { type: 'button', class: 'btn btn-ghost', 'data-key': 'undo', onclick: function () { undo(c.opId); }, text: t('undo') }) : null,
    ]);
  }

  function sleepStartFor(op) {
    // A queued stop for a timer that started online: the start comes from the snapshot.
    var found = (state.snapshot.ongoing || []).filter(function (x) { return x.id === op.payload.eventId; })[0];
    return found ? found.started_at : null;
  }

  // One entry as { title, time, detail, iso }.
  function describe(op) {
    if (op.type === 'create' && op.payload.kind === 'diaper') {
      return { title: diaperLabel(op.payload.pee, op.payload.poop), time: timeLabel(op.payload.startedAt), iso: op.payload.startedAt, kind: 'diaper', pee: op.payload.pee, poop: op.payload.poop };
    }
    if (op.type === 'create' && op.payload.kind === 'sleep') {
      var s = new Date(op.payload.startedAt).getTime();
      var e = new Date(op.payload.endedAt).getTime();
      return { title: t('sleepRow', { start: timeLabel(op.payload.startedAt), end: timeOnly(op.payload.endedAt), duration: durationText(e - s) }), time: '', iso: op.payload.startedAt, kind: 'sleep' };
    }
    if (op.type === 'startTimer') {
      return { title: t('sleepRowRunning', { start: timeLabel(op.payload.startedAt) }), time: '', iso: op.payload.startedAt, kind: 'sleep' };
    }
    if (op.type === 'stopTimer') {
      var from = sleepStartFor(op);
      if (from) {
        return { title: t('sleepRow', { start: timeLabel(from), end: timeOnly(op.payload.endedAt), duration: durationText(new Date(op.payload.endedAt) - new Date(from)) }), time: '', iso: from, kind: 'sleep' };
      }
      return { title: t('sleepHeading') || 'Sleep', time: timeLabel(op.payload.endedAt), iso: op.payload.endedAt, kind: 'sleep' };
    }
    return { title: String(op.payload.kind || ''), time: timeLabel(op.payload.startedAt || op.createdAt), iso: op.payload.startedAt || op.createdAt, kind: 'other' };
  }

  function toneChip(d) {
    var name = d.kind === 'sleep' ? 'moon' : d.pee && d.poop ? 'droplets' : d.poop ? 'circle-dot' : 'droplet';
    return h('span', { class: 'tone', 'aria-hidden': 'true' }, [icon(name)]);
  }

  function entryRow(op, attention) {
    var d = describe(op);
    var meta;
    if (attention) meta = reason(op);
    else if (op.status === 'sending') meta = t('rowSending');
    else if (Date.now() - new Date(op.createdAt).getTime() > OLD_ROW_MS) meta = t('rowSavedAgo', { ago: agoText(op.createdAt) });
    else meta = t('rowSaved');
    var sending = op.status === 'sending';
    return h('li', { class: 'row', 'data-key': 'row-' + op.opId, tabindex: '-1' }, [
      h('div', { class: 'main' }, [
        attention ? h('span', { class: 'attn-title' }, [icon('triangle-alert')]) : toneChip(d),
        h('div', { class: 'text' }, [
          h('span', { class: attention ? 'attn-title' : '', text: d.title }),
          h('span', { class: 'time', text: attention ? (d.time || timeLabel(d.iso)) + ' · ' + meta : meta }),
        ]),
      ]),
      !attention && d.time ? h('span', { class: 'time', text: d.time }) : null,
      h('div', { class: 'actions' }, [
        h('button', {
          type: 'button', class: 'btn btn-ghost', 'aria-disabled': sending ? 'true' : null,
          onclick: function () { if (!sending) removeEntry(op, attention); },
          text: attention ? t('discard') : t('remove'),
        }),
      ]),
    ]);
  }

  function reason(op) {
    var e = op.error || {};
    if (e.status === 'conflict') return t('conflictRunningNoName');
    if (e.status === 'forbidden') return t('forbidden', { name: state.snapshot.babyName });
    if (e.code === 'future') return t('rejectedFuture');
    return t('rejected');
  }

  function renderAttention() {
    var rows = babyOps().filter(function (o) { return o.status === 'needs_attention'; }).reverse();
    if (!rows.length) return null;
    return h('section', { class: 'card card-attention', 'aria-labelledby': 'attention-heading' }, [
      h('div', { class: 'section-head' }, [
        h('h2', { id: 'attention-heading', class: 'label', text: t('attentionHeading') }),
        h('span', { class: 'badge', text: String(rows.length) }),
      ]),
      h('ul', { class: 'list' }, rows.map(function (o) { return entryRow(o, true); })),
    ]);
  }

  function renderPending() {
    var all = babyOps().filter(function (o) { return o.status !== 'needs_attention'; });
    if (!all.length) return null;
    var rows = all.slice().sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
    var shown = rows.slice(0, MAX_ROWS);
    return h('section', { class: 'card', 'aria-labelledby': 'pending-heading' }, [
      h('div', { class: 'section-head' }, [
        h('h2', { id: 'pending-heading', class: 'label', tabindex: '-1', text: t('pendingHeading') }),
        h('span', { class: 'badge', text: String(Q.countEntries(all)) }),
      ]),
      h('div', { class: 'note' }, [icon('info'), h('p', { class: 'muted', text: isIos() ? t('willSyncOnOpen') : t('willSyncAuto') })]),
      h('ul', { class: 'list' }, shown.map(function (o) { return entryRow(o, false); })),
      rows.length > MAX_ROWS ? h('p', { class: 'muted', text: t('moreEntries', { count: rows.length - MAX_ROWS }) }) : null,
    ]);
  }

  // Entries waiting for other babies: a muted line so nothing looks lost.
  function renderOthers() {
    var byBaby = {};
    state.ops.forEach(function (o) { if (o.babyId !== state.babyId) byBaby[o.babyId] = (byBaby[o.babyId] || []).concat([o]); });
    var lines = Object.keys(byBaby).map(function (id) {
      var name = babyName(id);
      return name ? h('p', { class: 'muted', text: t('waitingFor', { count: Q.countEntries(byBaby[id]), name: name }) }) : null;
    }).filter(Boolean);
    return lines.length ? h('div', {}, lines) : null;
  }

  function attentionCount() { return state.ops.filter(function (o) { return o.status === 'needs_attention'; }).length; }
  function waitingCount() { return Q.countEntries(state.ops.filter(function (o) { return o.status !== 'needs_attention'; })); }

  function renderBanner() {
    var banner = $('banner');
    var alertRegion = $('alert-region');
    banner.textContent = '';
    alertRegion.textContent = '';

    var kind = state.banner;
    if (!state.storage) kind = 'storage';
    var onlineHint = navigator.onLine === false ? t('noConnection') + ' ' : '';
    var node;
    var checkBtn = h('button', { type: 'button', class: 'btn', 'data-key': 'check', onclick: function () { checkAgain(); }, text: t('retry') });
    var openBtn = h('button', { type: 'button', class: 'btn', onclick: function () { location.reload(); }, text: t('openApp') });

    if (kind === 'checking') {
      node = [icon('loader-circle', true), h('div', { class: 'grow' }, [h('p', { text: t('checking') })])];
    } else if (kind === 'unreachable') {
      node = [icon('wifi-off'), h('div', { class: 'grow' }, [h('p', { text: t('unreachable') }), h('p', { class: 'sub', text: onlineHint + t('unreachableHint') }), checkBtn])];
    } else if (kind === 'sending') {
      node = [icon('loader-circle', true), h('div', { class: 'grow' }, [h('p', { text: t('reachableAgain') + ' ' + t('syncing', { count: state.syncing }) })])];
    } else if (kind === 'returning') {
      node = [icon('check'), h('div', { class: 'grow' }, [h('p', { text: t('synced') })])];
    } else if (kind === 'reachableOnly') {
      node = [icon('check'), h('div', { class: 'grow' }, [h('p', { text: t('reachableAgain') }), openBtn])];
    } else if (kind === 'syncedStay') {
      node = [icon('check'), h('div', { class: 'grow' }, [h('p', { text: t('syncedStay') }), openBtn])];
    } else if (kind === 'syncedAttention') {
      node = [icon('check'), h('div', { class: 'grow' }, [h('p', { text: t('syncedAttention', { count: attentionCount() }) }), openBtn])];
    } else if (kind === 'failed') {
      node = [icon('triangle-alert'), h('div', { class: 'grow' }, [h('p', { class: 'title', text: t('syncFailed') }), checkBtn])];
    }
    if (node) {
      if (kind === 'failed') banner.classList.add('problem'); else banner.classList.remove('problem');
      node.forEach(function (n) { banner.appendChild(n); });
      return;
    }

    banner.classList.remove('problem');
    var wrap;
    if (kind === 'sessionExpired') {
      wrap = h('div', { class: 'problem' }, [
        icon('triangle-alert'),
        h('div', { class: 'grow' }, [
          h('p', { class: 'title', text: t('sessionExpired', { count: Q.countEntries(state.ops) }) }),
          h('p', { class: 'sub', text: t('sessionExpiredHint') }),
          h('a', { class: 'btn btn-primary', href: '/login' }, [icon('log-in'), t('logIn')]),
        ]),
      ]);
    } else if (kind === 'storage') {
      wrap = h('div', { class: 'problem' }, [icon('triangle-alert'), h('div', { class: 'grow' }, [h('p', { class: 'title', text: t('storageUnavailable') })])]);
    }
    if (wrap) alertRegion.appendChild(wrap);
  }

  // ------------------------------------------------------------------------ connection and sync

  function clearBackoff() { clearTimeout(timers.backoff); timers.backoff = null; }

  function scheduleBackoff() {
    clearBackoff();
    if (document.visibilityState !== 'visible') return;
    var secs = BACKOFF_S[Math.min(state.backoffIndex, BACKOFF_S.length - 1)];
    state.backoffIndex++;
    timers.backoff = setTimeout(function () { check(); }, secs * 1000);
  }

  function scheduleDrainSoon() {
    // A tap while the server might already be back: probe now rather than waiting out the backoff.
    state.backoffIndex = 0;
    clearBackoff();
    timers.backoff = setTimeout(function () { check(); }, 800);
  }

  function checkAgain() {
    state.backoffIndex = 0;
    state.banner = 'checking';
    renderBanner();
    check();
  }

  // Guards against a reload loop if the probe passes but navigations still fail: at most
  // two automatic returns per 30 s (after that the Open the app button stays).
  function returnedTooOften() {
    try {
      var now = Date.now();
      var recent = JSON.parse(sessionStorage.getItem('offlineReturns') || '[]').filter(function (x) { return now - x < 30000; });
      if (recent.length >= 2) return true;
      recent.push(now);
      sessionStorage.setItem('offlineReturns', JSON.stringify(recent));
    } catch { /* storage blocked: no guard possible */ }
    return false;
  }

  function canAutoReturn() {
    return !$('confirm').open && Date.now() - state.lastTapAt > RECENT_TAP_MS && !returnedTooOften();
  }

  function returnToApp(label) {
    state.banner = label;
    renderBanner();
    clearTimeout(timers.ret);
    timers.ret = setTimeout(function attempt() {
      if (canAutoReturn()) { location.reload(); return; }
      // Editing or just tapped: never yank the page away.
      state.banner = attentionCount() ? 'syncedAttention' : label === 'returning' ? 'syncedStay' : 'reachableOnly';
      renderBanner();
    }, RETURN_DELAY_MS);
  }

  async function check() {
    var probe = await Q.probe();
    if (probe.state === 'unreachable') {
      state.net = 'unreachable';
      state.banner = 'unreachable';
      renderBanner();
      scheduleBackoff();
      return;
    }
    if (probe.state === 'sessionExpired') {
      state.net = 'sessionExpired';
      state.banner = 'sessionExpired';
      renderBanner();
      return;
    }
    state.net = 'reachable';
    // Another account is signed in: this account's entries can't be sent under it.
    if (state.storage && state.userId && probe.userId !== state.userId && Q.countEntries(state.ops)) {
      state.banner = 'sessionExpired';
      renderBanner();
      return;
    }
    await refreshOps();
    var waiting = waitingCount();
    state.syncing = waiting;
    if (waiting) { state.banner = 'sending'; renderBanner(); }
    var result = waiting ? await Q.drain() : { state: 'drained' };
    await refreshOps();
    render();

    if (result.state === 'sessionExpired' || result.state === 'userMismatch') {
      state.banner = 'sessionExpired';
      renderBanner();
    } else if (result.state === 'busy') {
      // Another tab is sending; look again shortly.
      state.banner = 'sending';
      renderBanner();
      timers.backoff = setTimeout(function () { check(); }, 2000);
    } else if (result.state === 'failed' || result.state === 'unreachable') {
      state.banner = 'failed';
      renderBanner();
      scheduleBackoff();
    } else if (attentionCount()) {
      // Never auto-return: the parent has to read these.
      state.banner = waiting ? 'syncedAttention' : 'reachableOnly';
      renderBanner();
    } else {
      returnToApp(waiting ? 'returning' : 'reachableOnly');
    }
  }

  // ------------------------------------------------------------------------ boot

  async function boot() {
    document.documentElement.lang = browserLang;
    $('fallback-title').textContent = fallback.noSnapshotTitle || '';
    $('fallback-body').textContent = fallback.noSnapshot || '';
    $('open-app').textContent = fallback.tryOpening || '';
    $('open-app').addEventListener('click', function () { location.reload(); });

    if (!Q || !Q.isAvailable()) { state.storage = false; render(); return; }
    try {
      var meta = await Q.getMeta();
      state.userId = meta.lastUserId || null;
      state.snapshots = state.userId ? await Q.getSnapshots(state.userId) : [];
      Q.purge().catch(function () { /* advisory */ });
      var m = /^\/baby\/([0-9a-f-]{36})(\/|$)/i.exec(location.pathname);
      selectBaby(chooseBaby(m ? m[1].toLowerCase() : null, meta.lastBabyId));
      await refreshOps();
    } catch {
      state.storage = false;
      render();
      return;
    }

    // The live tracker queued a tap and reloaded into this page: show it as saved.
    var recent = babyOps().filter(function (o) { return Date.now() - new Date(o.createdAt).getTime() < 10000; }).pop();
    if (recent && state.snapshot) showConfirmation(t('savedFromTracker'), recent.type === 'create' ? recent.opId : null);

    state.banner = 'checking';
    render();

    Q.subscribe(function () { refreshOps().then(function () { render(); }); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') { state.backoffIndex = 0; check(); render(); } else clearBackoff();
    });
    window.addEventListener('pageshow', function () { state.backoffIndex = 0; check(); });
    window.addEventListener('online', function () { state.backoffIndex = 0; check(); });
    window.addEventListener('offline', function () { state.banner = 'unreachable'; renderBanner(); });
    // Elapsed time and "2 h ago" labels refresh once a minute.
    setInterval(function () { if (document.visibilityState === 'visible') render(); }, 60000);

    check();
  }

  boot();
})();
