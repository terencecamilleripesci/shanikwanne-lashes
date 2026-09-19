/* ==========================================================================
   ui.js — rendering primitives: icons, toasts, sheets, confirm, formatting.
   No framework. Everything returns HTML strings or DOM nodes.
   ========================================================================== */
(function (global) {
  'use strict';

  var UI = {};

  /* --------------------------------------------------------------- escape */
  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  UI.esc = esc;

  /* ---------------------------------------------------------------- icons */
  UI.icon = function (name, cls) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' +
      (cls ? ' class="' + cls + '"' : '') + '><use href="#i-' + name + '"/></svg>';
  };

  /* ----------------------------------------------------------- formatting */
  UI.money = function (n) {
    var cur = Store.settings().currency || 'EUR';
    var v = Number(n) || 0;
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v);
    } catch (e) {
      return cur + ' ' + v.toFixed(0);
    }
  };

  UI.date = function (iso, style) {
    if (!iso) return '—';
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return esc(iso);
    if (style === 'long') {
      return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  UI.relDate = function (iso) {
    if (!iso) return '—';
    var d = Store.daysBetween(Store.todayISO(), iso);
    if (d === 0) return 'Today';
    if (d === 1) return 'Tomorrow';
    if (d === -1) return 'Yesterday';
    if (d > 1 && d < 7) return 'In ' + d + ' days';
    if (d < -1 && d > -7) return Math.abs(d) + ' days ago';
    return UI.date(iso);
  };

  UI.time = function (t) {
    if (!t) return '';
    var p = t.split(':');
    var h = Number(p[0]);
    var d = new Date(); d.setHours(h, Number(p[1] || 0), 0, 0);
    try { return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
    catch (e) { return t; }
  };

  UI.initials = function (name) {
    var parts = String(name || '?').trim().split(/\s+/).slice(0, 2);
    return parts.map(function (p) { return p.charAt(0).toUpperCase(); }).join('') || '?';
  };

  /* --------------------------------------------------------------- toasts */
  var toastRoot;
  UI.toast = function (msg, kind, action) {
    toastRoot = toastRoot || document.getElementById('toasts');
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    var ico = kind === 'err' ? 'alert' : kind === 'ok' ? 'check' : 'info';
    el.innerHTML = UI.icon(ico) + '<span class="grow">' + esc(msg) + '</span>';
    if (action) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = action.label;
      b.addEventListener('click', function () { action.fn(); close(); });
      el.appendChild(b);
    }
    toastRoot.appendChild(el);
    var timer = setTimeout(close, action ? 7000 : 3600);
    function close() {
      clearTimeout(timer);
      el.style.transition = 'opacity .18s, transform .18s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      setTimeout(function () { el.remove(); }, 180);
    }
    return close;
  };

  /* --------------------------------------------------------------- sheets */
  var openSheets = [];

  /**
   * UI.sheet({title, body, onMount, dirty}) — bottom sheet / modal.
   * `dirty()` returning true triggers a discard-confirm on dismiss.
   */
  UI.sheet = function (opts) {
    var root = document.getElementById('sheet-root');
    var scrim = document.createElement('div');
    scrim.className = 'scrim';
    scrim.setAttribute('role', 'dialog');
    scrim.setAttribute('aria-modal', 'true');
    scrim.setAttribute('aria-label', opts.title || 'Dialog');

    scrim.innerHTML =
      '<div class="sheet">' +
        '<div class="sheet-grip"></div>' +
        '<div class="sheet-head">' +
          '<h2>' + esc(opts.title || '') + '</h2>' +
          '<button class="icon-btn" data-close type="button" aria-label="Close">' + UI.icon('x') + '</button>' +
        '</div>' +
        '<div data-body>' + (opts.body || '') + '</div>' +
      '</div>';

    var sheet = scrim.querySelector('.sheet');
    var lastFocus = document.activeElement;

    function dismiss(force) {
      if (!force && opts.dirty && opts.dirty(sheet)) {
        UI.confirm({
          title: 'Discard changes?',
          message: 'You have unsaved changes. Close without saving?',
          okLabel: 'Discard',
          danger: true,
          onOk: function () { dismiss(true); }
        });
        return;
      }
      scrim.style.transition = 'opacity .18s';
      scrim.style.opacity = '0';
      setTimeout(function () {
        scrim.remove();
        openSheets = openSheets.filter(function (s) { return s !== api; });
        if (!openSheets.length) document.body.style.overflow = '';
        if (lastFocus && lastFocus.focus) lastFocus.focus();
      }, 180);
    }

    scrim.addEventListener('click', function (e) {
      if (e.target === scrim) dismiss();
      if (e.target.closest('[data-close]')) dismiss();
    });

    // Esc closes; Tab is trapped inside the sheet
    scrim.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); dismiss(); return; }
      if (e.key !== 'Tab') return;
      var f = sheet.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    root.appendChild(scrim);
    document.body.style.overflow = 'hidden';

    var api = { el: sheet, scrim: scrim, close: dismiss };
    openSheets.push(api);

    if (opts.onMount) opts.onMount(sheet, api);

    // focus the first real control, not the close button
    setTimeout(function () {
      var f = sheet.querySelector('input:not([type=hidden]),select,textarea,button.btn-primary');
      if (f) f.focus({ preventScroll: true }); else sheet.querySelector('[data-close]').focus();
    }, 60);

    return api;
  };

  /** True while any sheet/dialog is open — never stack a prompt on her work. */
  UI.anySheetOpen = function () { return openSheets.length > 0; };

  /* -------------------------------------------------------------- confirm */
  UI.confirm = function (opts) {
    var s = UI.sheet({
      title: opts.title || 'Are you sure?',
      body:
        '<p style="color:var(--ink-2);font-size:.9375rem">' + esc(opts.message || '') + '</p>' +
        (opts.detail ? '<div class="alert alert-warn" style="margin-bottom:16px">' + UI.icon('alert') +
          '<div>' + esc(opts.detail) + '</div></div>' : '') +
        '<div class="stack">' +
          '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + ' btn-block" data-ok type="button">' +
            esc(opts.okLabel || 'Confirm') + '</button>' +
          '<button class="btn btn-ghost btn-block" data-close type="button">Cancel</button>' +
        '</div>',
      onMount: function (el, api) {
        el.querySelector('[data-ok]').addEventListener('click', function () {
          api.close(true);
          if (opts.onOk) opts.onOk();
        });
      }
    });
    return s;
  };

  /**
   * Destructive actions that are recoverable get an Undo toast instead of a
   * dialog. Irreversible ones (erase) still use UI.confirm.
   */
  UI.undoable = function (msg, doIt, undoIt) {
    var done = false;
    doIt();
    UI.toast(msg, 'ok', {
      label: 'Undo',
      fn: function () { if (!done) { undoIt(); done = true; App.render(); } }
    });
  };

  /* ------------------------------------------------------- form utilities */
  UI.field = function (o) {
    var id = o.id || ('f-' + Math.random().toString(36).slice(2, 8));
    var h = '<div class="field">';
    h += '<label for="' + id + '">' + esc(o.label) + (o.required ? '<span class="req" aria-hidden="true">*</span>' : '') + '</label>';
    var attrs =
      'id="' + id + '" name="' + esc(o.name || id) + '"' +
      (o.required ? ' required' : '') +
      (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') +
      (o.value != null ? ' value="' + esc(o.value) + '"' : '') +
      (o.min != null ? ' min="' + o.min + '"' : '') +
      (o.max != null ? ' max="' + o.max + '"' : '') +
      (o.step ? ' step="' + o.step + '"' : '') +
      (o.autocomplete ? ' autocomplete="' + esc(o.autocomplete) + '"' : '') +
      (o.inputmode ? ' inputmode="' + esc(o.inputmode) + '"' : '') +
      (o.readonly ? ' readonly' : '');

    if (o.type === 'textarea') {
      h += '<textarea ' + attrs.replace(/ value="[^"]*"/, '') + (o.rows ? ' rows="' + o.rows + '"' : '') + '>' + esc(o.value || '') + '</textarea>';
    } else if (o.type === 'select') {
      h += '<select ' + attrs.replace(/ value="[^"]*"/, '') + '>';
      if (o.blank) h += '<option value="">' + esc(o.blank) + '</option>';
      (o.options || []).forEach(function (op) {
        var val = typeof op === 'string' ? op : op.value;
        var lab = typeof op === 'string' ? op : op.label;
        h += '<option value="' + esc(val) + '"' + (String(o.value) === String(val) ? ' selected' : '') + '>' + esc(lab) + '</option>';
      });
      h += '</select>';
    } else {
      h += '<input type="' + (o.type || 'text') + '" ' + attrs + '>';
    }
    if (o.help) h += '<span class="help">' + esc(o.help) + '</span>';
    h += '<span class="err hide" data-err-for="' + id + '" role="alert"></span>';
    h += '</div>';
    return h;
  };

  UI.check = function (o) {
    var id = o.id || ('c-' + Math.random().toString(36).slice(2, 8));
    return '<label class="check" for="' + id + '">' +
      '<input type="checkbox" id="' + id + '" name="' + esc(o.name || id) + '"' + (o.checked ? ' checked' : '') + '>' +
      '<span>' + esc(o.label) + '</span></label>';
  };

  /** Show an inline error under a field and focus it (WCAG focus-management). */
  UI.fieldError = function (scope, name, msg) {
    var input = scope.querySelector('[name="' + name + '"]');
    if (!input) return;
    input.setAttribute('aria-invalid', 'true');
    var err = scope.querySelector('[data-err-for="' + input.id + '"]');
    if (err) {
      err.innerHTML = UI.icon('alert') + '<span>' + esc(msg) + '</span>';
      err.classList.remove('hide');
    }
    input.focus({ preventScroll: false });
    input.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  UI.clearErrors = function (scope) {
    scope.querySelectorAll('[aria-invalid]').forEach(function (i) { i.removeAttribute('aria-invalid'); });
    scope.querySelectorAll('.err').forEach(function (e) { e.classList.add('hide'); e.textContent = ''; });
  };

  UI.formData = function (scope) {
    var out = {};
    scope.querySelectorAll('input,select,textarea').forEach(function (i) {
      if (!i.name) return;
      out[i.name] = i.type === 'checkbox' ? i.checked : i.value;
    });
    return out;
  };

  /* ------------------------------------------------------- shared widgets */
  UI.empty = function (o) {
    return '<div class="empty">' + UI.icon(o.icon || 'sparkle') +
      '<h3>' + esc(o.title) + '</h3><p>' + esc(o.message || '') + '</p>' +
      (o.action ? '<button class="btn btn-primary" data-action="' + esc(o.action.act) + '" type="button">' +
        UI.icon('plus') + esc(o.action.label) + '</button>' : '') + '</div>';
  };

  UI.badge = function (kind, label, ico) {
    return '<span class="badge badge-' + kind + '">' + (ico ? UI.icon(ico) : '') + esc(label) + '</span>';
  };

  /** Patch-test pill. Colour is never the only cue — each state has its own icon + words. */
  UI.patchBadge = function (st) {
    var m = {
      valid:   ['ok', 'shield'],
      soon:    ['warn', 'clock'],
      expired: ['danger', 'alert'],
      none:    ['danger', 'alert'],
      react:   ['danger', 'alert'],
      off:     ['neutral', 'info']
    }[st.state] || ['neutral', 'info'];
    return UI.badge(m[0], st.label, m[1]);
  };

  UI.avatar = function (name) {
    return '<span class="avatar" aria-hidden="true">' + esc(UI.initials(name)) + '</span>';
  };

  /* --------------------------------------------------------- misc helpers */
  UI.debounce = function (fn, ms) {
    var t;
    return function () {
      var a = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, a); }, ms || 220);
    };
  };

  UI.reducedMotion = function () {
    return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };

  /* ---------------------------------------------------------------- theme */
  /** Read a live design token — canvas work can't use CSS variables. */
  UI.token = function (name) {
    return getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim();
  };

  /** True when the resolved theme is dark (handles 'auto'). */
  UI.isDark = function () {
    var t = document.documentElement.getAttribute('data-theme');
    if (t === 'dark') return true;
    if (t === 'light') return false;
    return !!(global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches);
  };

  UI.applyTheme = function (theme) {
    if (['light', 'dark', 'auto'].indexOf(theme) < 0) theme = 'light';
    document.documentElement.setAttribute('data-theme', theme);
    // keep the iOS status bar / browser chrome in step
    var meta = document.getElementById('meta-theme-color');
    if (meta) {
      // read after the attribute change so we get the resolved value
      setTimeout(function () { meta.setAttribute('content', UI.token('bg') || '#FBF6F9'); }, 0);
    }
    return theme;
  };

  global.UI = UI;
})(window);
