/* Workbench — shared parts for browser-based maker tools.
 * Copyright (C) 2026 shahidhussain2k13@gmail.com
 * SPDX-License-Identifier: GPL-3.0-or-later — see LICENSE. */
/* ui.js — interface pieces every tool needs:
 *
 *   WB.scrubbable(input, label)   number fields you can drag, as in Unity
 *   WB.Warnings(box)              the warnings strip, with dismissible notices
 *   WB.History(opts)              undo / redo with coalesced bursts
 *   WB.Session(opts)              designs kept in localStorage, one per tab
 *   WB.designsMenu(opts)          the list of them, to open, start, copy or delete
 */
window.WB = window.WB || {};
(function (WB) {
  'use strict';

  /* ── drag to change a number ────────────────────────────────────────
     As in Unity's inspector: the label, and the left and right edges of the
     box, are drag handles. Drag sideways to change the value — Shift for big
     steps, Alt for fine ones; click the middle of the box to type. The value
     stays within the input's min and max. */
  WB.SCRUB_EDGE = 10;

  WB.startScrub = function (e, input, handle) {
    e.preventDefault();
    var x0 = e.clientX, v0 = parseFloat(input.value);
    if (!isFinite(v0)) v0 = 0;
    var step = parseFloat(input.step) || 1;
    var min = input.min !== '' ? parseFloat(input.min) : -Infinity;
    var max = input.max !== '' ? parseFloat(input.max) : Infinity;
    var moved = false;
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add('scrubbing');

    var move = function (ev) {
      var dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < 3) return;
      moved = true;
      var mult = ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1;
      var grain = step * (ev.altKey ? 0.1 : 1);
      var perPx = (step >= 1 ? step / 6 : step) * mult;
      var v = Math.min(max, Math.max(min, Math.round((v0 + dx * perPx) / grain) * grain));
      var dp = Math.max(0, (String(grain).split('.')[1] || '').length);
      input.value = v.toFixed(Math.min(dp, 4));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    var up = function () {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      document.body.classList.remove('scrubbing');
      if (moved) input.dispatchEvent(new Event('change', { bubbles: true }));
      else { input.focus(); input.select(); }
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };

  WB.scrubbable = function (input, label) {
    if (input._scrub) return;
    input._scrub = true;
    var nearEdge = function (e) {
      var r = input.getBoundingClientRect(), x = e.clientX - r.left;
      return x <= WB.SCRUB_EDGE || x >= r.width - WB.SCRUB_EDGE;
    };
    input.addEventListener('pointermove', function (e) {
      if (document.body.classList.contains('scrubbing')) return;
      input.classList.toggle('edgehot', !input.disabled && nearEdge(e));
    });
    input.addEventListener('pointerleave', function () { input.classList.remove('edgehot'); });
    input.addEventListener('pointerdown', function (e) {
      if (e.button === 0 && !input.disabled && nearEdge(e)) WB.startScrub(e, input, input);
    });
    if (label) {
      label.classList.add('scrublabel');
      label.addEventListener('pointerdown', function (e) {
        if (e.button === 0 && !input.disabled) WB.startScrub(e, input, label);
      });
    }
  };

  /* ── reset a sidebar section ───────────────────────────────────────
     Puts a small ↺ in each panel's heading. onReset(panel) does the work;
     the button doesn't open or close the panel. */
  WB.addResetButtons = function (panels, onReset) {
    Array.prototype.forEach.call(panels, function (panel) {
      var h = panel.querySelector('h2');
      if (!h || h.querySelector('.panel-reset')) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'panel-reset';
      b.textContent = '↺';
      b.title = 'Reset this section to its defaults';
      b.setAttribute('aria-label', 'Reset ' + h.textContent.trim() + ' to defaults');
      b.addEventListener('click', function (e) { e.stopPropagation(); onReset(panel); });
      h.appendChild(b);
    });
  };

  /* A bar pinned to the top of the sidebar with one button that folds every
     section shut, or opens them all again when they are all shut. */
  WB.addCollapseAll = function (sidebar) {
    if (!sidebar || sidebar.querySelector('.sidebar-tools')) return;
    var bar = document.createElement('div');
    bar.className = 'sidebar-tools';
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ghost';
    bar.appendChild(b);
    sidebar.insertBefore(bar, sidebar.firstChild);
    var panels = function () { return sidebar.querySelectorAll('.panel'); };
    var allShut = function () { return ![].some.call(panels(), function (p) { return p.classList.contains('open'); }); };
    var paint = function () {
      var shut = allShut();
      b.textContent = shut ? '▾ Expand all' : '▴ Collapse all';
      b.title = shut ? 'Open every section' : 'Fold every section shut';
    };
    b.addEventListener('click', function () {
      var open = allShut();
      [].forEach.call(panels(), function (p) { p.classList.toggle('open', open); });
      paint();
    });
    // A section opened or shut any other way changes what the button offers.
    if (typeof MutationObserver === 'function') {
      new MutationObserver(paint).observe(sidebar, { subtree: true, attributes: true, attributeFilter: ['class'] });
    }
    paint();
  };

  /* The bound settings in a panel, as paths: data-bind and data-numfor. */
  WB.panelPaths = function (panel) {
    var seen = {}, out = [];
    Array.prototype.forEach.call(panel.querySelectorAll('[data-bind],[data-numfor]'), function (el) {
      var p = el.dataset.bind || el.dataset.numfor;
      if (p && !seen[p]) { seen[p] = true; out.push(p); }
    });
    return out;
  };

  /* ── warnings strip ─────────────────────────────────────────────────
     show(list) replaces the build warnings ({level: 'bad'|'warn'|'ok', msg}),
     which happens on every rebuild. notice(level, msg) adds a line that stays
     above them until it's dismissed. */
  WB.Warnings = function (box) {
    this.box = box;
    this.notices = [];
    this.last = [];
  };
  var ICON = { bad: '●', warn: '▲', ok: 'ⓘ' };
  WB.Warnings.prototype.notice = function (level, msg) {
    this.notices = this.notices.filter(function (n) { return n.msg !== msg; });
    this.notices.push({ level: level, msg: msg });
    this.show(this.last);
  };
  WB.Warnings.prototype.show = function (list) {
    var self = this, box = this.box;
    this.last = list || [];
    box.innerHTML = '';
    this.notices.forEach(function (n) {
      var d = document.createElement('div');
      d.className = 'w ' + n.level + ' notice';
      d.innerHTML = '<span class="ic"></span><span class="msg"></span>' +
        '<button type="button" class="ghost iconbtn" aria-label="Dismiss">✕</button>';
      d.querySelector('.ic').textContent = ICON[n.level] || ICON.ok;
      d.querySelector('.msg').textContent = n.msg;
      d.lastChild.addEventListener('click', function () {
        self.notices.splice(self.notices.indexOf(n), 1);
        self.show(self.last);
      });
      box.appendChild(d);
    });
    var order = { bad: 0, warn: 1, ok: 2 };
    this.last.slice().sort(function (a, b) { return order[a.level] - order[b.level]; }).forEach(function (w) {
      var d = document.createElement('div');
      d.className = 'w ' + w.level;
      d.innerHTML = '<span class="ic"></span><span></span>';
      d.firstChild.textContent = ICON[w.level] || ICON.ok;
      d.lastChild.textContent = w.msg;
      box.appendChild(d);
    });
  };

  /* ── undo / redo ────────────────────────────────────────────────────
     The design is small and JSON-safe, so history is a stack of snapshots.
     A burst of changes (dragging one value) is coalesced into a single step:
     the snapshot from before the burst is taken once and committed after
     things go quiet.

     opts: {
       snapshot()        → { state: string, assets: { name: value | {id: value} } }
       restore(snap)     put a snapshot back and redraw
       undoButton, redoButton   optional; kept enabled/disabled and titled
       limit             steps kept (120)
     }
     Call begin() immediately BEFORE changing the design. */
  WB.History = function (opts) {
    this.opts = opts;
    this.undoStack = [];
    this.redoStack = [];
    this.pending = null;
    this.timer = 0;
    this.limit = opts.limit || 120;
  };

  function sameMap(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    var ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every(function (k) { return a[k] === b[k]; });
  }
  function plain(o) { return !!o && typeof o === 'object' && Object.getPrototypeOf(o) === Object.prototype; }
  function sameSnap(a, b) {
    if (a.state !== b.state) return false;
    var A = a.assets || {}, B = b.assets || {};
    var keys = Object.keys(A).concat(Object.keys(B));
    return keys.every(function (k) {
      var x = A[k], y = B[k];
      // Bitmaps are compared by identity; maps of bitmaps entry by entry.
      if (plain(x) && plain(y)) return sameMap(x, y);
      return x === y;
    });
  }

  WB.History.prototype.begin = function (coalesceMs) {
    var self = this;
    if (this.pending === null) this.pending = this.opts.snapshot();
    clearTimeout(this.timer);
    this.timer = setTimeout(function () { self.commit(); }, coalesceMs == null ? 450 : coalesceMs);
    this.paint();
  };
  WB.History.prototype.commit = function () {
    clearTimeout(this.timer);
    if (this.pending === null) return;
    // Nothing actually changed (a value dragged back to where it started).
    if (!sameSnap(this.pending, this.opts.snapshot())) {
      this.undoStack.push(this.pending);
      if (this.undoStack.length > this.limit) this.undoStack.shift();
      this.redoStack.length = 0;
    }
    this.pending = null;
    this.paint();
  };
  WB.History.prototype.undo = function () {
    this.commit();                    // fold any in-flight burst in first
    if (!this.undoStack.length) return;
    this.redoStack.push(this.opts.snapshot());
    this.opts.restore(this.undoStack.pop());
    this.paint();
  };
  WB.History.prototype.redo = function () {
    this.commit();
    if (!this.redoStack.length) return;
    this.undoStack.push(this.opts.snapshot());
    this.opts.restore(this.redoStack.pop());
    this.paint();
  };
  /* Forget every step, when a different design comes on screen. */
  WB.History.prototype.clear = function () {
    clearTimeout(this.timer);
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.pending = null;
    this.paint();
  };
  WB.History.prototype.paint = function () {
    var u = this.opts.undoButton, r = this.opts.redoButton;
    if (!u || !r) return;
    var n = this.undoStack.length + (this.pending !== null ? 1 : 0);
    u.disabled = !n;
    r.disabled = !this.redoStack.length;
    u.title = 'Undo (⌘Z / Ctrl+Z)' + (n ? ' — ' + n + ' step(s)' : '');
    r.title = 'Redo (⇧⌘Z / Ctrl+Y)' + (this.redoStack.length ? ' — ' + this.redoStack.length + ' step(s)' : '');
  };

  /* Text fields keep their own native undo. */
  function inTextEntry() {
    var el = document.activeElement;
    if (!el) return false;
    if (el.tagName === 'TEXTAREA') return true;
    return el.tagName === 'INPUT' && /^(text|number|search|email|url|password)$/.test(el.type);
  }

  /* Buttons and ⌘Z / ⇧⌘Z / Ctrl+Y. */
  WB.History.prototype.bind = function () {
    var self = this, o = this.opts;
    if (o.undoButton) o.undoButton.addEventListener('click', function () { self.undo(); });
    if (o.redoButton) o.redoButton.addEventListener('click', function () { self.redo(); });
    document.addEventListener('keydown', function (e) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      var k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        if (inTextEntry()) return;
        e.preventDefault(); self.undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        if (inTextEntry()) return;
        e.preventDefault(); self.redo();
      }
    });
    this.paint();
  };

  /* ── designs kept in the browser ───────────────────────────────────
     Every design lives under its own key in localStorage, with an index of
     them all, so one browser can hold many. Each tab remembers (in
     sessionStorage, which a refresh keeps) which design it has open, and
     marks it as open with a heartbeat, so a new tab leaves it alone.

     Timers stall in background tabs, so the heartbeat alone can't be
     trusted; what keeps work safe is that a tab only writes a design it was
     the last to write: each design carries a revision, and a tab that finds
     someone else's newer revision (or its lock taken) carries on in a copy
     instead. Nothing is written when nothing changed, and nothing while a
     design is still loading. Deleting a design, or everything, in one tab is
     noticed by the others, which then treat what's on their screen as new.
     Pictures are stored too, but dropped rather than losing the design if
     the quota is hit. Nothing leaves the browser.

     opts: { key, build() → payload, load(payload, done), rename(name)?,
             failed(message)? }. A payload's state.name is its listed name. */
  var BEAT = 2500, STALE = 7000;
  var tabToken = Math.random().toString(36).slice(2) + Date.now().toString(36);

  WB.Session = function (opts) {
    this.opts = opts;
    this.id = null;
    this.rev = 0;               // the revision this tab last loaded or wrote
    this.last = null;           // JSON last loaded or written, to skip no-op saves
    this.baseline = null;       // a new design isn't kept until it differs from this
    this.loading = false;
    this.warned = false;
    var self = this;
    this.ok = (function () {
      try {
        localStorage.setItem(opts.key + '.probe', '1');
        localStorage.removeItem(opts.key + '.probe');
        return true;
      } catch (e) { return false; }
    })();
    this.save = WB.debounce(function () { self.saveNow(); }, 900);
    if (!this.ok) return;
    this._migrate();
    setInterval(function () { self._claim(); }, BEAT);
    // Let go on the way out, so a refresh can pick the same design up again;
    // check again on the way back (a frozen or cached page may have been
    // thought gone).
    window.addEventListener('pagehide', function () { self.saveNow(); self._release(); });
    window.addEventListener('pageshow', function () { self._claim(); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) self._claim(); });
    window.addEventListener('storage', function (e) { self._changed(e); });
  };
  var S = WB.Session.prototype;

  S._get = function (k) { try { return localStorage.getItem(this.opts.key + k); } catch (e) { return null; } };
  S._set = function (k, v) { localStorage.setItem(this.opts.key + k, v); };
  S._del = function (k) { try { localStorage.removeItem(this.opts.key + k); } catch (e) { /* gone already */ } };
  S._index = function () {
    try {
      var l = JSON.parse(this._get('.index') || '[]');
      return Array.isArray(l) ? l.filter(function (d) { return d && typeof d.id === 'string'; }) : [];
    } catch (e) { return []; }
  };
  S._entry = function (id) { return this._index().filter(function (d) { return d.id === id; })[0] || null; };
  S._tab = function (v) {
    var k = this.opts.key + '.tab';
    try { if (v === undefined) return sessionStorage.getItem(k); if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); }
    catch (e) { return null; }
    return null;
  };
  S._fail = function (msg) {
    if (this.warned) return;
    this.warned = true;
    if (this.opts.failed) this.opts.failed(msg);
  };

  /* The single design kept before there could be many becomes the first. */
  S._migrate = function () {
    var old = this._get('');
    if (!old) return;
    this._del('');                          // first, so a second tab starting now doesn't copy it too
    var id = WB.newId('d'), name = 'Design';
    try { name = (JSON.parse(old).state || {}).name || name; } catch (e) { /* unnamed */ }
    try {
      this._set('.d.' + id, old);
      var l = this._index(); l.push({ id: id, name: String(name), t: Date.now(), rev: 1 });
      this._set('.index', JSON.stringify(l));
    } catch (e) { try { this._set('', old); } catch (e2) { /* nowhere to put it */ } }
  };

  /* Is this design open in another live tab? */
  S._lock = function (id) {
    try { return JSON.parse(this._get('.open.' + id) || 'null'); } catch (e) { return null; }
  };
  S.openElsewhere = function (id) {
    var m = this._lock(id);
    return !!m && m.tab !== tabToken && Date.now() - m.t < STALE;
  };
  /* Renew this tab's mark. If another tab has taken the design meanwhile
     (this one was asleep), let it have it and carry on in a copy. */
  S._claim = function () {
    if (!this.id) return;
    if (this.openElsewhere(this.id)) { this._fork(); return; }
    try { this._set('.open.' + this.id, JSON.stringify({ tab: tabToken, t: Date.now() })); } catch (e) { /* full */ }
  };
  S._release = function () {
    if (!this.id) return;
    var m = this._lock(this.id);
    if (m && m.tab === tabToken) this._del('.open.' + this.id);
  };
  S._use = function (id, rev) {
    this._release();
    this.id = id;
    this.rev = rev || 0;
    this._tab(id);
    this._claim();
  };
  /* From the next save on, a copy: the design under the old id is left as
     the other tab has it. */
  S._fork = function () {
    this._release();
    this.id = null;
    this.rev = 0;
    this.last = null;
    this.baseline = null;
    this._tab(null);
    this.forked = true;
  };
  /* Another tab deleted this design, or everything: what's on screen here
     becomes a new design, kept only if it is changed. */
  S._changed = function (e) {
    var pre = this.opts.key;
    if (!this.id || (e.key !== null && e.key !== pre + '.d.' + this.id && e.key !== pre + '.index')) return;
    if (this._get('.d.' + this.id) !== null && this._entry(this.id)) return;
    this.id = null;
    this.rev = 0;
    this.last = null;
    this._tab(null);
    this.baseline = JSON.stringify(this.opts.build());
  };

  /* The designs, newest first: { id, name, t, here, elsewhere }. */
  S.list = function () {
    var self = this;
    return this._index().sort(function (a, b) { return b.t - a.t; }).map(function (d) {
      return { id: d.id, name: d.name || 'Untitled', t: d.t, here: d.id === self.id, elsewhere: self.openElsewhere(d.id) };
    });
  };

  /* A name not already in the list: "case", then "case 2", "case 3"… */
  S.uniqueName = function (base) {
    var self = this, names = this._index().filter(function (d) { return d.id !== self.id; }).map(function (d) { return d.name; });
    if (names.indexOf(base) < 0) return base;
    var root = base.replace(/ \d+$/, '') || base;           // "case 2" taken → "case 3", not "case 2 2"
    for (var i = 2; ; i++) if (names.indexOf(root + ' ' + i) < 0) return root + ' ' + i;
  };

  S.saveNow = function () {
    if (!this.ok || this.loading) return;
    var payload = this.opts.build(), json = JSON.stringify(payload);
    if (json === this.last) return;                       // nothing changed since it was loaded or saved
    // A new design isn't kept until something in it changes, so opening
    // tabs doesn't fill the list with copies of the defaults.
    if (this.baseline !== null) {
      if (json === this.baseline) return;
      this.baseline = null;
    }
    // Someone else wrote it since (a tab that was thought gone): don't
    // overwrite their work, carry on in a copy.
    if (this.id) {
      var cur = this._entry(this.id);
      if (cur && (cur.rev || 0) !== this.rev) this._fork();
    }
    // Kept for the first time (new, copied or forked): under a name of its own.
    if (!this.id) {
      this.forked = false;
      var was = String((payload.state && payload.state.name) || 'Untitled'), nm = this.uniqueName(was);
      if (nm !== was && payload.state) {
        payload.state.name = nm;
        if (this.opts.rename) this.opts.rename(nm);
        json = JSON.stringify(payload);
      }
      this._use(WB.newId('d'), 0);
    }
    var id = this.id, name = String((payload.state && payload.state.name) || 'Untitled'), rev = this.rev + 1;
    var l = this._index().filter(function (d) { return d.id !== id; });
    l.push({ id: id, name: name, t: Date.now(), rev: rev });
    try {
      this._set('.d.' + id, json);
    } catch (e) {
      try {                                   // over quota: keep the design at least
        payload.assets = {};
        payload.assetsDropped = true;
        this._set('.d.' + id, JSON.stringify(payload));
        this._fail('This browser\'s storage is full, so the pictures in this design were not kept. Delete old designs (Designs menu) or use Save to keep a file.');
      } catch (e2) {
        this._fail('This browser\'s storage is full, so this design is not being kept here. Delete old designs (Designs menu) or use Save to keep a file.');
        return;
      }
    }
    try {
      this._set('.index', JSON.stringify(l));
    } catch (e3) {
      this._del('.d.' + id);                  // unlisted, it would only take up room
      this._fail('This browser\'s storage is full, so this design is not being kept here. Delete old designs (Designs menu) or use Save to keep a file.');
      return;
    }
    this.rev = rev;
    this.last = json;
    this.warned = false;
  };

  /* Forget what is stored for the open design (it is saved again on the next
     change, under the same id). */
  S.clear = function () {
    if (!this.ok || !this.id) return;
    this._del('.d.' + this.id);
    this.last = null;
  };

  S._read = function (id) {
    try { return JSON.parse(this._get('.d.' + id) || 'null'); } catch (e) { return null; }
  };
  /* While pictures decode the design isn't whole, so nothing is saved until
     it is in; then what's on screen counts as unchanged. */
  S._load = function (p, done) {
    var self = this;
    this.loading = true;
    this.opts.load(p, function () {
      self.loading = false;
      done(p.assetsDropped ? 'Opened your design, but its pictures were too large to keep in this browser.' : null);
      self.last = self.id ? JSON.stringify(self.opts.build()) : null;
    });
  };

  /* At start-up: this tab's design, or the latest one no other tab has open.
     Returns true when one is being opened; done(note) runs once it is in.
     Otherwise the app starts a new design. */
  S.restore = function (done) {
    if (!this.ok) return false;
    var mine = this._tab(), p = mine && this._read(mine), e;
    if (p) {
      if (this.openElsewhere(mine)) {        // a duplicated tab: carry on in a copy
        this._fork();
        this.forked = false;
        if (p.state) p.state.name = this.uniqueName(String(p.state.name || 'Untitled'));
      } else {
        e = this._entry(mine);
        this._use(mine, e ? e.rev || 0 : 0);
      }
      this._load(p, done);
      return true;
    }
    // A new tab carries on with the latest design, unless another tab has it.
    var latest = this.list()[0], free = latest && !latest.elsewhere ? latest : null;
    var fp = free && this._read(free.id);
    if (fp) { e = this._entry(free.id); this._use(free.id, e ? e.rev || 0 : 0); this._load(fp, done); return true; }
    this.startNew();
    return false;
  };

  /* From here on the tab works on a new design, kept once it changes. Call
     with the new design already on screen (or about to be, with no change). */
  S.startNew = function () {
    this._release();
    this.id = null;
    this.rev = 0;
    this.last = null;
    this.forked = false;
    this._tab(null);
    this.baseline = this.ok ? JSON.stringify(this.opts.build()) : null;
  };

  /* Call once start-up has filled in whatever it fills in, so a new design
     that nobody has touched still counts as untouched. */
  S.settled = function () {
    if (this.ok && !this.id && this.baseline !== null) this.baseline = JSON.stringify(this.opts.build());
  };

  /* Open a stored design in this tab, after saving the one on screen. */
  S.open = function (id, done) {
    var p = this._read(id), e = this._entry(id);
    if (!p) return false;
    this.saveNow();
    this.baseline = null;
    this.forked = false;
    this._use(id, e ? e.rev || 0 : 0);
    this._load(p, done || function () {});
    return true;
  };

  /* Keep working on a copy of the design on screen; the original stays.
     Also used before something from outside (a file, a link) replaces what
     is on screen, so the design it replaces stays in the list. */
  S.duplicate = function () {
    this.saveNow();
    this._release();
    this.id = null;
    this.rev = 0;
    this.last = null;
    this.forked = false;
    this._tab(null);
    this.baseline = null;
  };

  /* ── the Designs menu ──────────────────────────────────────────────
     opts: { anchor, session, open(id), create(), duplicate(), wipe() }.
     Lists what this browser keeps; the design in this tab is marked, and one
     open in another tab can't be opened here as well. */
  var menu = null;
  function closeMenu() {
    if (!menu) return;
    var el = menu; menu = null;
    el.classList.remove('in');
    setTimeout(function () { el.remove(); }, 160);
  }
  function ago(t) {
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return new Date(t).toLocaleDateString();
  }
  WB.designsMenu = function (opts) {
    if (menu) { closeMenu(); return; }
    var ses = opts.session, el = document.createElement('div');
    el.className = 'sharepop designs';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Designs in this browser');
    var head = document.createElement('div');
    head.className = 'sp-head';
    head.innerHTML = '<b>Designs in this browser</b><button type="button" class="sp-x" aria-label="Close">✕</button>';
    head.lastChild.addEventListener('click', closeMenu);
    el.appendChild(head);

    var list = document.createElement('div');
    list.className = 'ds-list';
    var rows = ses.ok ? ses.list() : [];
    if (!rows.some(function (d) { return d.here; })) {
      rows.unshift({ id: null, name: 'This design', here: true, unsaved: true });
    }
    rows.forEach(function (d) {
      var row = document.createElement('div');
      row.className = 'ds-row' + (d.here ? ' here' : '') + (d.elsewhere ? ' busy' : '');
      var pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'ds-pick';
      var nm = document.createElement('span'); nm.className = 'ds-name'; nm.textContent = d.name;
      var meta = document.createElement('span'); meta.className = 'ds-meta';
      meta.textContent = d.here ? (d.unsaved ? 'this tab · not changed yet' : 'this tab · ' + ago(d.t))
                       : d.elsewhere ? 'open in another tab' : ago(d.t);
      pick.appendChild(nm); pick.appendChild(meta);
      pick.disabled = d.here || d.elsewhere;
      pick.title = d.here ? 'Open in this tab' : d.elsewhere ? 'Open in another tab; switch to that tab to edit it' : 'Open this design here';
      pick.addEventListener('click', function () { closeMenu(); opts.open(d.id); });
      row.appendChild(pick);
      if (!d.here && d.id) {
        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'ds-del';
        del.textContent = '✕';
        del.title = 'Delete this design';
        del.setAttribute('aria-label', 'Delete ' + d.name);
        del.disabled = d.elsewhere;
        del.addEventListener('click', function () {
          if (!window.confirm('Delete "' + d.name + '" from this browser? This can\'t be undone.')) return;
          ses.remove(d.id);
          row.remove();
        });
        row.appendChild(del);
      }
      list.appendChild(row);
    });
    el.appendChild(list);

    var acts = document.createElement('div');
    acts.className = 'ds-acts';
    [['New design', 'Start a new design; this one stays in the list', function () { opts.create(); }],
     ['Duplicate', 'Carry on in a copy of this design; the original stays as it is', function () { opts.duplicate(); }]]
      .forEach(function (a) {
        var b = document.createElement('button');
        b.type = 'button'; b.textContent = a[0]; b.title = a[1];
        b.disabled = !ses.ok;
        b.addEventListener('click', function () { closeMenu(); a[2](); });
        acts.appendChild(b);
      });
    el.appendChild(acts);

    var foot = document.createElement('p');
    foot.className = 'sp-body ds-foot';
    foot.textContent = ses.ok ? 'Designs are kept in this browser only, never sent anywhere. ' : 'This browser blocks storage here, so designs are not kept. ';
    if (ses.ok) {
      var wipe = document.createElement('button');
      wipe.type = 'button'; wipe.className = 'linkish'; wipe.textContent = 'Delete all saved data';
      wipe.addEventListener('click', function () {
        if (!window.confirm('Delete every design this app has kept in this browser? Designs open in other tabs stay on their screens until closed. This can\'t be undone.')) return;
        closeMenu();
        opts.wipe();
      });
      foot.appendChild(wipe);
    }
    el.appendChild(foot);

    document.body.appendChild(el);
    var a = opts.anchor && opts.anchor.getBoundingClientRect();
    if (a) {
      el.style.top = (a.bottom + 8) + 'px';
      el.style.right = Math.max(8, window.innerWidth - a.right) + 'px';
    } else el.classList.add('centred');
    requestAnimationFrame(function () { el.classList.add('in'); });
    menu = el;
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
    document.addEventListener('pointerdown', function (e) {
      if (menu && !menu.contains(e.target) && !e.target.closest('#btn-designs')) closeMenu();
    });
  }

  S.remove = function (id) {
    this._del('.d.' + id);
    this._del('.open.' + id);
    try { this._set('.index', JSON.stringify(this._index().filter(function (d) { return d.id !== id; }))); } catch (e) { /* full */ }
    if (id === this.id) { this.id = null; this.rev = 0; this.last = null; this._tab(null); }
  };

  /* Everything this app keeps in the browser, gone. */
  S.wipe = function () {
    var pre = this.opts.key, keys = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k === pre || k.indexOf(pre + '.') === 0) keys.push(k);
      }
      keys.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) { /* blocked */ }
    this.id = null;
    this.rev = 0;
    this.last = null;
    this._tab(null);
  };

})(window.WB);
