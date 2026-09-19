/* ==========================================================================
   sessions.js — the session record sheet (pre-filled from the last set),
   the saved-session view, booking, and the Calendar screen.
   ========================================================================== */
(function (global) {
  'use strict';

  /* =======================================================================
     Session record sheet
     This is the spine of the app: a new session starts as a copy of the last
     one so a fill "goes exactly as planned". Only what genuinely changes
     (retention, room, notes, duration) is blanked out.
     ======================================================================= */
  App.actions['new-session'] = function () {
    var c = App._client;
    var chk = Store.patchTestOKFor(c, Store.todayISO());
    if (!chk.ok) {
      UI.confirm({
        title: 'Patch test problem',
        message: chk.why,
        detail: 'Working without a valid patch test can invalidate your insurance. Only continue if you know what you are doing.',
        okLabel: 'Continue anyway', danger: true,
        onOk: function () { App.sessionSheet(Store.draftFromLast(c.id), c); }
      });
      return;
    }
    App.sessionSheet(Store.draftFromLast(c.id), c);
  };

  App.actions['view-session'] = function (id) {
    var r = Store.record(id);
    if (r) App.sessionView(r, App._client);
  };

  App.sessionSheet = function (draft, c) {
    var cat = Store.catalog();
    var isNew = !draft.id;
    var mapRef = { map: draft.map || { left: [], right: [] } };

    var body =
      (draft.prefilledFrom
        ? '<div class="alert alert-ok" style="margin-bottom:16px">' + UI.icon('sparkle') +
          '<div><strong>Pre-filled from ' + UI.date(draft.prefilledFrom) + '</strong>' +
          'Same map, curl and adhesive as her last set. Change whatever is different.</div></div>'
        : '') +
      '<form data-form novalidate>' +
      UI.field({ label: 'Date', name: 'date', type: 'date', value: draft.date, required: true }) +
      '<div class="field"><label>Session type</label>' +
        '<div class="seg" role="tablist">' +
          '<button type="button" role="tab" data-fill="0" aria-selected="' + (!draft.isFill) + '">Full set</button>' +
          '<button type="button" role="tab" data-fill="1" aria-selected="' + (!!draft.isFill) + '">Fill</button>' +
        '</div><input type="hidden" name="isFill" value="' + (draft.isFill ? '1' : '0') + '"></div>' +

      (draft.isFill
        ? UI.field({ label: 'Retention on arrival', name: 'retentionPct', type: 'number', min: 0, max: 100,
                     value: draft.retentionPct, inputmode: 'numeric', placeholder: 'e.g. 65',
                     help: 'Roughly what % of the last set was still on. This is what builds her retention trend.' })
        : '') +

      '<fieldset><legend>The set</legend>' +
      UI.field({ label: 'Set type', name: 'setType', type: 'select', options: cat.setTypes, value: draft.setType }) +
      UI.field({ label: 'Style', name: 'style', type: 'select', options: cat.styles, value: draft.style }) +
      '<div class="row" style="gap:8px;align-items:flex-start">' +
        '<div class="grow">' + UI.field({ label: 'Curl', name: 'curl', type: 'select', options: cat.curls, value: draft.curl }) + '</div>' +
        '<div class="grow">' + UI.field({ label: 'Diameter', name: 'diameter', type: 'select', options: cat.diameters, value: draft.diameter }) + '</div>' +
        '<div class="grow">' + UI.field({ label: 'Fan', name: 'fans', type: 'select', blank: '—', options: cat.fans, value: draft.fans }) + '</div>' +
      '</div>' +
      '</fieldset>' +

      '<div data-map style="margin-bottom:16px"></div>' +

      '<fieldset><legend>Adhesive</legend>' +
      UI.field({ label: 'Brand', name: 'adBrand', type: 'select', options: cat.adhesives, value: (draft.adhesive || {}).brand }) +
      UI.field({ label: 'Batch / lot', name: 'adBatch', value: (draft.adhesive || {}).batch,
                 help: 'Worth logging — if retention drops across several clients at once it is usually the bottle.' }) +
      UI.field({ label: 'Bottle opened', name: 'adOpened', type: 'date', value: (draft.adhesive || {}).openedOn }) +
      '<div class="row" style="gap:8px;align-items:flex-start">' +
        '<div class="grow">' + UI.field({ label: 'Room temp °C', name: 'tempC', type: 'number', inputmode: 'decimal', value: (draft.room || {}).tempC }) + '</div>' +
        '<div class="grow">' + UI.field({ label: 'Humidity %', name: 'humidity', type: 'number', inputmode: 'numeric', value: (draft.room || {}).humidity }) + '</div>' +
      '</div>' +
      '</fieldset>' +

      '<div class="row" style="gap:8px;align-items:flex-start">' +
        '<div class="grow">' + UI.field({ label: 'Duration (min)', name: 'durationMin', type: 'number', inputmode: 'numeric', value: draft.durationMin }) + '</div>' +
        '<div class="grow">' + UI.field({ label: 'Price', name: 'price', type: 'number', inputmode: 'decimal', step: '0.01', value: draft.price }) + '</div>' +
      '</div>' +
      UI.field({ label: 'Notes', name: 'notes', type: 'textarea', rows: 3, value: draft.notes,
                 placeholder: 'Anything to remember for next time — sensitive inner corners, sparse patch, she wants longer next visit…' }) +

      '<button class="btn btn-primary btn-block" type="submit">' + (isNew ? 'Save session' : 'Save changes') + '</button>' +
      (isNew ? '<p class="help" style="text-align:center;margin-top:12px">You can add before/after photos from the Photos tab.</p>' : '') +
      '</form>';

    UI.sheet({
      title: isNew ? (draft.isFill ? 'New fill' : 'New set') : 'Edit session',
      body: body,
      dirty: function () { return isNew; },
      onMount: function (el, api) {
        LashMap.mount(el.querySelector('[data-map]'), mapRef.map, function (m) { mapRef.map = m; });

        // full set / fill toggle
        el.querySelectorAll('[data-fill]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            el.querySelectorAll('[data-fill]').forEach(function (b) { b.setAttribute('aria-selected', 'false'); });
            btn.setAttribute('aria-selected', 'true');
            el.querySelector('[name=isFill]').value = btn.dataset.fill;
          });
        });

        el.querySelector('[data-form]').addEventListener('submit', function (e) {
          e.preventDefault();
          UI.clearErrors(el);
          var f = UI.formData(el);
          if (!f.date) return UI.fieldError(el, 'date', 'Pick a date.');
          if (f.retentionPct !== undefined && f.retentionPct !== '' &&
              (Number(f.retentionPct) < 0 || Number(f.retentionPct) > 100)) {
            return UI.fieldError(el, 'retentionPct', 'Retention must be between 0 and 100.');
          }

          var rec = Object.assign({}, draft, {
            clientId: c.id,
            date: f.date,
            isFill: f.isFill === '1',
            retentionPct: f.retentionPct === undefined ? draft.retentionPct : f.retentionPct,
            setType: f.setType, style: f.style, curl: f.curl, diameter: f.diameter, fans: f.fans,
            map: mapRef.map,
            adhesive: { brand: f.adBrand, batch: (f.adBatch || '').trim(), openedOn: f.adOpened },
            room: { tempC: f.tempC, humidity: f.humidity },
            durationMin: f.durationMin, price: f.price,
            notes: (f.notes || '').trim()
          });
          delete rec.prefilledFrom;

          var saved = Store.saveRecord(rec);
          if (!saved) return UI.toast('Could not save — storage may be full.', 'err');

          api.close(true);
          UI.toast('Session saved', 'ok');

          if (isNew) App.offerRebook(c, saved);
          App.render();
        });
      }
    });
  };

  /* --------------------------------------------------- rebook prompt ---- */
  /** Rebooking on the spot is the single biggest retention lever. Ask every time. */
  App.offerRebook = function (c, rec) {
    var iv = c.fillIntervalDays || Store.settings().fillIntervalDays;
    var suggested = Store.addDays(rec.date, iv);
    setTimeout(function () {
      UI.sheet({
        title: 'Book her next fill?',
        body:
          '<p style="color:var(--ink-2);font-size:.9375rem">Clients who rebook before they leave are far less likely to drift. ' +
          'Suggested: <strong>' + UI.date(suggested, 'long') + '</strong> (' + iv + ' days).</p>' +
          '<form data-form novalidate>' +
          UI.field({ label: 'Date', name: 'date', type: 'date', value: suggested, required: true }) +
          UI.field({ label: 'Time', name: 'time', type: 'time', value: '10:00' }) +
          '<button class="btn btn-primary btn-block" type="submit">Book it</button>' +
          '<button class="btn btn-quiet btn-block" data-close type="button" style="margin-top:8px">Not now</button>' +
          '</form>',
        onMount: function (el, api) {
          el.querySelector('[data-form]').addEventListener('submit', function (e) {
            e.preventDefault();
            var f = UI.formData(el);
            if (!f.date) return UI.fieldError(el, 'date', 'Pick a date.');
            Store.saveAppointment({
              clientId: c.id, date: f.date, time: f.time,
              service: 'Fill', durationMin: 60, status: 'booked'
            });
            api.close(true);
            UI.toast('Booked for ' + UI.date(f.date), 'ok');
            App.render();
          });
        }
      });
    }, 320);
  };

  /* ----------------------------------------------------- saved session -- */
  App.sessionView = function (r, c) {
    UI.sheet({
      title: UI.date(r.date) + (r.isFill ? ' · Fill' : ' · Full set'),
      body:
        '<div class="card card-2" style="margin-bottom:16px"><dl style="margin:0">' +
        row('Type', [r.setType, r.style].filter(Boolean).join(' · ')) +
        row('Curl / diameter / fan', [r.curl, r.diameter, r.fans].filter(Boolean).join(' · ')) +
        (r.retentionPct !== '' && r.retentionPct != null ? row('Retention on arrival', r.retentionPct + '%') : '') +
        row('Adhesive', (r.adhesive || {}).brand + ((r.adhesive || {}).batch ? ' · batch ' + r.adhesive.batch : '')) +
        ((r.room || {}).tempC || (r.room || {}).humidity
          ? row('Room', [(r.room.tempC ? r.room.tempC + '°C' : ''), (r.room.humidity ? r.room.humidity + '% RH' : '')].filter(Boolean).join(' · '))
          : '') +
        (r.durationMin ? row('Duration', r.durationMin + ' min') : '') +
        (r.price ? row('Price', UI.money(r.price)) : '') +
        '</dl></div>' +
        LashMap.preview(r.map) +
        (r.notes ? '<div class="card" style="margin-top:16px;white-space:pre-wrap;font-size:.9375rem;color:var(--ink-2)">' +
          UI.esc(r.notes) + '</div>' : '') +
        '<div class="row" style="gap:8px;margin-top:20px">' +
          '<button class="btn btn-ghost grow" data-edit type="button">' + UI.icon('edit') + 'Edit</button>' +
          '<button class="btn btn-danger grow" data-del type="button">' + UI.icon('trash') + 'Delete</button>' +
        '</div>',
      onMount: function (el, api) {
        el.querySelector('[data-edit]').addEventListener('click', function () {
          api.close(true);
          setTimeout(function () { App.sessionSheet(r, c); }, 220);
        });
        el.querySelector('[data-del]').addEventListener('click', function () {
          UI.confirm({
            title: 'Delete this session?',
            message: 'The record and any photos attached to it will be removed.',
            okLabel: 'Delete', danger: true,
            onOk: function () {
              Store.deleteRecord(r.id).then(function () {
                api.close(true);
                UI.toast('Session deleted', 'ok');
                App.render();
              });
            }
          });
        });
      }
    });
  };

  function row(k, v) {
    return '<div class="kv"><dt>' + UI.esc(k) + '</dt><dd>' + UI.esc(v || '—') + '</dd></div>';
  }

  /* =======================================================================
     Booking
     ======================================================================= */
  App.actions.book = function () { App.bookSheet(App._client); };

  App.bookSheet = function (client, presetDate) {
    var cat = Store.catalog();
    var clients = Store.clients();
    var svcOptions = cat.services.map(function (s) { return { value: s.name, label: s.name }; });

    UI.sheet({
      title: 'New appointment',
      body:
        '<form data-form novalidate>' +
        (client
          ? '<div class="card card-2 row" style="margin-bottom:16px">' + UI.avatar(client.name) +
            '<span class="grow"><strong>' + UI.esc(client.name) + '</strong></span></div>' +
            '<input type="hidden" name="clientId" value="' + client.id + '">'
          : UI.field({ label: 'Client', name: 'clientId', type: 'select', required: true, blank: 'Choose a client…',
              options: clients.map(function (c) { return { value: c.id, label: c.name }; }) })) +
        UI.field({ label: 'Service', name: 'service', type: 'select', options: svcOptions, value: svcOptions[0] && svcOptions[0].value }) +
        '<div class="row" style="gap:8px;align-items:flex-start">' +
          '<div class="grow">' + UI.field({ label: 'Date', name: 'date', type: 'date', value: presetDate || Store.todayISO(), required: true }) + '</div>' +
          '<div class="grow">' + UI.field({ label: 'Time', name: 'time', type: 'time', value: '10:00' }) + '</div>' +
        '</div>' +
        '<div class="row" style="gap:8px;align-items:flex-start">' +
          '<div class="grow">' + UI.field({ label: 'Duration (min)', name: 'durationMin', type: 'number', inputmode: 'numeric', value: 120 }) + '</div>' +
          '<div class="grow">' + UI.field({ label: 'Price', name: 'price', type: 'number', inputmode: 'decimal', step: '0.01' }) + '</div>' +
        '</div>' +
        UI.field({ label: 'Deposit taken', name: 'deposit', type: 'number', inputmode: 'decimal', step: '0.01',
                   help: 'Deposits are the main defence against no-shows.' }) +
        UI.field({ label: 'Notes', name: 'notes', type: 'textarea', rows: 2 }) +
        '<div data-warn></div>' +
        '<button class="btn btn-primary btn-block" type="submit">Book appointment</button>' +
        '</form>',
      onMount: function (el, api) {
        var form = el.querySelector('[data-form]');
        var warn = el.querySelector('[data-warn]');

        // auto-fill duration + price from the service catalogue
        var svcSel = el.querySelector('[name=service]');
        if (svcSel) {
          svcSel.addEventListener('change', function () {
            var s = cat.services.filter(function (x) { return x.name === svcSel.value; })[0];
            if (!s) return;
            el.querySelector('[name=durationMin]').value = s.mins;
            el.querySelector('[name=price]').value = s.price;
          });
          svcSel.dispatchEvent(new Event('change'));
        }

        // live patch-test check as soon as client + date are known
        function checkPatch() {
          var f = UI.formData(el);
          var c = Store.client(f.clientId);
          warn.innerHTML = '';
          if (!c || !f.date) return;
          var chk = Store.patchTestOKFor(c, f.date);
          if (!chk.ok) {
            warn.innerHTML = '<div class="alert alert-warn" style="margin-bottom:16px">' + UI.icon('alert') +
              '<div><strong>Patch test</strong>' + UI.esc(chk.why) + '</div></div>';
          }
        }
        el.addEventListener('change', checkPatch);
        checkPatch();

        form.addEventListener('submit', function (e) {
          e.preventDefault();
          UI.clearErrors(el);
          var f = UI.formData(el);
          if (!f.clientId) return UI.fieldError(el, 'clientId', 'Choose a client.');
          if (!f.date) return UI.fieldError(el, 'date', 'Pick a date.');

          // clash check — same day, overlapping window
          var mins = Number(f.durationMin) || 0;
          var start = toMin(f.time);
          var clash = Store.appointments({ date: f.date, status: 'booked' }).filter(function (a) {
            var s2 = toMin(a.time), e2 = s2 + (Number(a.durationMin) || 0);
            return start < e2 && (start + mins) > s2;
          });
          if (clash.length) {
            var other = Store.client(clash[0].clientId);
            return UI.fieldError(el, 'time', 'Clashes with ' + ((other && other.name) || 'another booking') + ' at ' + UI.time(clash[0].time) + '.');
          }

          Store.saveAppointment({
            clientId: f.clientId, date: f.date, time: f.time,
            service: f.service, durationMin: f.durationMin, price: f.price,
            deposit: f.deposit, notes: (f.notes || '').trim(), status: 'booked'
          });
          api.close(true);
          UI.toast('Booked for ' + UI.date(f.date), 'ok');
          App.render();
        });
      }
    });
  };

  function toMin(t) {
    if (!t) return 0;
    var p = String(t).split(':');
    return Number(p[0]) * 60 + Number(p[1] || 0);
  }

  /* =======================================================================
     Screen: Calendar
     ======================================================================= */
  App.routes.calendar = function () {
    var sel = App._calDate || Store.todayISO();
    var today = Store.todayISO();

    // 14-day strip starting yesterday
    var strip = '';
    for (var i = -1; i < 13; i++) {
      var d = Store.addDays(today, i);
      var dt = new Date(d + 'T00:00:00');
      var count = Store.appointments({ date: d, status: 'booked' }).length;
      var on = d === sel;
      strip += '<button type="button" data-action="cal-day" data-id="' + d + '" ' +
        'aria-pressed="' + on + '" aria-label="' + UI.date(d, 'long') + ', ' + count + ' appointments" ' +
        'style="flex:0 0 58px;min-height:72px;border-radius:14px;border:1px solid ' +
        (on ? 'var(--primary)' : 'var(--border)') + ';background:' +
        (on ? 'var(--primary)' : 'var(--surface)') + ';color:' +
        (on ? 'var(--on-primary)' : 'var(--ink)') + ';display:flex;flex-direction:column;' +
        'align-items:center;justify-content:center;gap:2px;cursor:pointer">' +
        '<span style="font-size:.625rem;text-transform:uppercase;opacity:.75;font-weight:700">' +
          dt.toLocaleDateString(undefined, { weekday: 'short' }) + '</span>' +
        '<span class="num" style="font-size:1.125rem;font-weight:700">' + dt.getDate() + '</span>' +
        (count ? '<span style="width:4px;height:4px;border-radius:50%;background:' +
          (on ? 'var(--on-primary)' : 'var(--primary)') + '"></span>' : '<span style="height:4px"></span>') +
        '</button>';
    }

    var appts = Store.appointments({ date: sel });
    var b = '<div class="row" style="gap:8px;overflow-x:auto;padding-bottom:8px;margin-bottom:20px;' +
      'scrollbar-width:none;-webkit-overflow-scrolling:touch">' + strip + '</div>';

    b += '<div class="section-head"><h2>' + UI.relDate(sel) + '</h2>' +
      '<span class="eyebrow">' + UI.date(sel) + '</span></div>';

    if (!appts.length) {
      b += '<div class="card" style="text-align:center;color:var(--muted);padding:32px 16px">' +
        UI.icon('calendar') + '<p style="margin:8px 0 16px;font-size:.875rem">Nothing booked.</p>' +
        '<button class="btn btn-primary btn-sm" data-action="book-on" data-id="' + sel + '" type="button">' +
        UI.icon('plus') + 'Add appointment</button></div>';
    } else {
      b += '<div class="list">' + appts.map(function (a) {
        var c = Store.client(a.clientId);
        var cancelled = a.status !== 'booked';
        return '<div class="item" style="cursor:default' + (cancelled ? ';opacity:.5' : '') + '">' +
          '<span style="flex:0 0 66px;text-align:center;white-space:nowrap"><span class="num" style="font-weight:700;color:var(--primary)">' +
            UI.time(a.time) + '</span><span style="display:block;font-size:.6875rem;color:var(--muted)">' +
            (a.durationMin || 0) + 'm</span></span>' +
          '<span class="grow"><span class="title truncate">' + UI.esc(c ? c.name : 'Unknown') + '</span>' +
          '<span class="meta truncate">' + UI.esc(a.service || '') +
            (a.deposit ? ' · dep ' + UI.money(a.deposit) : '') +
            (cancelled ? ' · ' + a.status : '') + '</span></span>' +
          (c ? '<a class="icon-btn" href="#/client/' + c.id + '" aria-label="Open ' + UI.esc(c.name) + '">' + UI.icon('chev-right') + '</a>' : '') +
          '<button class="icon-btn" data-action="appt-menu" data-id="' + a.id + '" type="button" aria-label="Appointment options">' +
            UI.icon('sliders') + '</button>' +
          '</div>';
      }).join('') + '</div>';
    }

    return {
      title: 'Calendar',
      sub: appts.length + ' on ' + UI.date(sel),
      body: b + '<button class="fab" data-action="book-on" data-id="' + sel + '" type="button" aria-label="Add appointment">' +
        UI.icon('plus') + '</button>'
    };
  };

  App.actions['cal-day'] = function (d) { App._calDate = d; App.render(); };
  App.actions['book-on'] = function (d) { App.bookSheet(null, d); };

  App.actions['appt-menu'] = function (id) {
    var a = Store.appointment(id);
    if (!a) return;
    var c = Store.client(a.clientId);
    UI.sheet({
      title: (c ? c.name : 'Appointment') + ' · ' + UI.time(a.time),
      body: '<div class="stack">' +
        (a.status === 'booked'
          ? '<button class="btn btn-primary btn-block" data-done type="button">' + UI.icon('check') + 'Mark as done</button>' +
            '<button class="btn btn-ghost btn-block" data-noshow type="button">Mark as no-show</button>' +
            '<button class="btn btn-ghost btn-block" data-cancel type="button">Cancel appointment</button>'
          : '<button class="btn btn-ghost btn-block" data-rebook type="button">Restore to booked</button>') +
        '<button class="btn btn-danger btn-block" data-del type="button">' + UI.icon('trash') + 'Delete</button>' +
        '</div>',
      onMount: function (el, api) {
        function setStatus(s, msg) {
          a.status = s;
          Store.saveAppointment(a);
          api.close(true);
          UI.toast(msg, 'ok');
          App.render();
        }
        var m = {
          '[data-done]': function () {
            api.close(true);
            if (c) { App._client = c; setTimeout(function () { App.sessionSheet(Store.draftFromLast(c.id), c); }, 200); }
            a.status = 'done';
            Store.saveAppointment(a);
          },
          '[data-noshow]': function () { setStatus('noshow', 'Marked as no-show'); },
          '[data-cancel]': function () { setStatus('cancelled', 'Appointment cancelled'); },
          '[data-rebook]': function () { setStatus('booked', 'Restored'); },
          '[data-del]': function () {
            Store.deleteAppointment(a.id);
            api.close(true);
            UI.toast('Appointment deleted', 'ok');
            App.render();
          }
        };
        Object.keys(m).forEach(function (sel) {
          var btn = el.querySelector(sel);
          if (btn) btn.addEventListener('click', m[sel]);
        });
      }
    });
  };

})(window);
