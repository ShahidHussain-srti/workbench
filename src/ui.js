/* Workbench — shared parts for browser-based maker tools.
 * Copyright (C) 2026 shahidhussain2k13@gmail.com
 * SPDX-License-Identifier: GPL-3.0-or-later — see LICENSE. */
/* ui.js — interface pieces every tool needs:
 *
 *   WB.scrubbable(input, label)   number fields you can drag, as in Unity
 *   WB.Warnings(box)              the warnings strip, with dismissible notices
 *   WB.History(opts)              undo / redo with coalesced bursts
 *   WB.Session(opts)              the design kept in localStorage across refreshes
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
        if (inTextEntry() && k === 'z') return;
        e.preventDefault(); self.redo();
      }
    });
    this.paint();
  };

  /* ── session ────────────────────────────────────────────────────────
     The design survives a refresh via localStorage. Pictures are stored too,
     but dropped rather than losing the design if the quota is hit.

     opts: { key, build() → payload, load(payload, done) } */
  WB.Session = function (opts) {
    this.opts = opts;
    this.ok = (function () {
      try {
        localStorage.setItem(opts.key + '.probe', '1');
        localStorage.removeItem(opts.key + '.probe');
        return true;
      } catch (e) { return false; }
    })();
    var self = this;
    this.save = WB.debounce(function () { self.saveNow(); }, 900);
  };
  WB.Session.prototype.saveNow = function () {
    if (!this.ok) return;
    var payload = this.opts.build();
    try {
      localStorage.setItem(this.opts.key, JSON.stringify(payload));
    } catch (e) {
      try {                                   // over quota: keep the design at least
        payload.assets = {};
        payload.assetsDropped = true;
        localStorage.setItem(this.opts.key, JSON.stringify(payload));
      } catch (e2) { /* give up quietly; the design is still on screen */ }
    }
  };
  WB.Session.prototype.clear = function () {
    if (!this.ok) return;
    try { localStorage.removeItem(this.opts.key); } catch (e) { /* nothing to undo */ }
  };
  /* Returns true when a stored design is being restored; done(note) runs once
     it is in place, with a note to show if its pictures had to be dropped. */
  WB.Session.prototype.restore = function (done) {
    if (!this.ok) return false;
    var raw;
    try { raw = localStorage.getItem(this.opts.key); } catch (e) { return false; }
    if (!raw) return false;
    try {
      var p = JSON.parse(raw);
      this.opts.load(p, function () {
        done(p.assetsDropped ? 'Restored your last session, but the pictures were too large to keep.' : null);
      });
      return true;
    } catch (e) {
      this.clear();
      return false;
    }
  };

})(window.WB);
