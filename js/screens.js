/* ==========================================================================
   screens.js — client detail (overview / health / sessions / photos),
   the session record sheet, patch tests and consent.
   ========================================================================== */
(function (global) {
  'use strict';

  App.actions = App.actions || {};

  /* =======================================================================
     Client detail
     ======================================================================= */
  App.routes.client = function (r) {
    var c = Store.client(r.id);
    if (!c) {
      return { title: 'Not found', back: true, body: UI.empty({ icon: 'alert', title: 'Client not found', message: 'This record may have been deleted.' }) };
    }
    var tab = r.tab || 'overview';
    var TABS = ['overview', 'health', 'sessions', 'photos'];
    if (TABS.indexOf(tab) < 0) tab = 'overview';

    var b = '';
    if (c.demo) {
      b += '<div class="alert alert-ok" style="margin-bottom:16px;border-color:var(--accent);color:var(--accent);background:rgba(196,169,245,.12)">' +
        UI.icon('info') + '<div><strong>This is the demo client</strong>' +
        'A sample record so you can try every screen. Remove it in Settings when you are done.</div></div>';
    }

    b += '<div class="seg" role="tablist" style="margin-bottom:20px">' +
      TABS.map(function (t) {
        return '<button role="tab" aria-selected="' + (t === tab) + '" data-action="tab" data-id="' + t + '" type="button">' +
          t.charAt(0).toUpperCase() + t.slice(1) + '</button>';
      }).join('') + '</div>';

    b += '<div data-tabpanel>' + ({
      overview: tabOverview,
      health: tabHealth,
      sessions: tabSessions,
      photos: tabPhotos
    })[tab](c) + '</div>';

    App._client = c;
    App._tab = tab;

    /* A human summary, not a raw date string. Only surface the patch test here
       when it's a problem — the detail lives on the Health tab. */
    var nRec = Store.records(c.id).length;
    var pSt = Store.patchTestStatus(c);
    var sub;
    if (pSt.state === 'react') sub = 'Reaction on record';
    else if (pSt.state === 'expired' || pSt.state === 'none') sub = pSt.label;
    else if (!nRec) sub = 'No sessions yet';
    else sub = nRec + (nRec === 1 ? ' session' : ' sessions') +
              ' · last ' + UI.date(Store.lastRecord(c.id).date);

    return {
      title: UI.esc(c.name),
      sub: UI.esc(sub),
      back: true,
      actions:
        (c.phone ? '<a class="icon-btn" href="tel:' + UI.esc(c.phone) + '" aria-label="Call ' + UI.esc(c.name) + '">' + UI.icon('phone') + '</a>' : '') +
        '<button class="icon-btn" data-action="edit-client" type="button" aria-label="Edit client">' + UI.icon('edit') + '</button>',
      body: b,
      onMount: function (screen) {
        if (tab === 'photos') App.mountPhotos(screen, c);
      }
    };
  };

  App.actions.tab = function (id) {
    App.go('#/client/' + App._client.id + '/' + id);
  };
  App.actions['edit-client'] = function () { App.clientSheet(App._client); };

  /* ------------------------------------------------------------ overview */
  function tabOverview(c) {
    var st = Store.patchTestStatus(c);
    var last = Store.lastRecord(c.id);
    var due = Store.nextDue(c.id);
    var over = due ? Store.daysBetween(due, Store.todayISO()) : null;
    var consentOK = Store.consentCurrent(c);
    var upcoming = Store.appointments({ clientId: c.id, from: Store.todayISO(), status: 'booked' });

    var b = '';

    /* blockers first */
    if (st.state === 'react') {
      b += '<div class="alert alert-danger" style="margin-bottom:16px">' + UI.icon('alert') +
        '<div><strong>Reaction on record</strong>Do not lash without checking the notes and taking advice.</div></div>';
    } else if (st.state === 'none' || st.state === 'expired') {
      b += '<div class="alert alert-danger" style="margin-bottom:16px">' + UI.icon('alert') +
        '<div><strong>' + UI.esc(st.label) + '</strong>A valid patch test is needed at least ' +
        Store.settings().patchTestMinHours + 'h before the appointment.' +
        '<div style="margin-top:8px"><button class="btn btn-sm btn-danger" data-action="add-patch" type="button">Record a patch test</button></div></div></div>';
    } else if (st.state === 'soon') {
      b += '<div class="alert alert-warn" style="margin-bottom:16px">' + UI.icon('clock') +
        '<div><strong>Patch test ' + UI.esc(st.label.toLowerCase()) + '</strong>Expires ' + UI.date(st.expires) + '.</div></div>';
    }
    if (!consentOK) {
      b += '<div class="alert alert-warn" style="margin-bottom:16px">' + UI.icon('clipboard') +
        '<div><strong>Consent not signed</strong>' +
        (Store.latestConsent(c) ? 'The form has been updated since she last signed.' : 'No signed consent form on file.') +
        '<div style="margin-top:8px"><button class="btn btn-sm btn-ghost" data-action="sign-consent" type="button">Get signature</button></div></div></div>';
    }

    /* primary action */
    b += '<button class="btn btn-primary btn-block" data-action="new-session" type="button" style="margin-bottom:12px">' +
      UI.icon('sparkle') + (last ? 'Start fill' : 'Start first set') + '</button>';
    b += '<div class="row" style="gap:8px;margin-bottom:24px">' +
      '<button class="btn btn-ghost btn-sm grow" data-action="book" type="button">' + UI.icon('calendar') + 'Book</button>' +
      (c.phone ? '<a class="btn btn-ghost btn-sm grow" href="sms:' + UI.esc(c.phone) + '">' + UI.icon('phone') + 'Message</a>' : '') +
      '<button class="btn btn-ghost btn-sm grow" data-action="aftercare" type="button">' + UI.icon('note') + 'Aftercare</button>' +
      '</div>';

    /* next appointment / due */
    b += '<div class="card" style="margin-bottom:16px"><dl style="margin:0">';
    if (upcoming.length) {
      b += kv('Next appointment', UI.relDate(upcoming[0].date) + ' · ' + UI.time(upcoming[0].time));
    } else if (due) {
      b += kv('Next fill due', over > 0
        ? UI.date(due) + ' (' + over + 'd overdue)'
        : UI.relDate(due));
    }
    b += kv('Patch test', st.label);
    b += kv('Consent', consentOK ? 'Signed ' + UI.date((Store.latestConsent(c) || {}).date) : 'Not current');
    b += kv('Sessions', String(Store.records(c.id).length));
    if (c.phone) b += kv('Mobile', c.phone);
    if (c.instagram) b += kv('Instagram', c.instagram);
    b += '</dl></div>';

    /* last set — the "so each fill goes exactly as planned" card */
    if (last) {
      b += '<section class="section"><div class="section-head"><h2>Last set</h2>' +
        '<span class="eyebrow">' + UI.date(last.date) + '</span></div>' +
        '<div class="card"><dl style="margin:0">' +
        kv('Type', [last.setType, last.style].filter(Boolean).join(' · ')) +
        kv('Curl / diameter', [last.curl, last.diameter, last.fans].filter(Boolean).join(' · ')) +
        kv('Map', LashMap.summary(last.map)) +
        kv('Adhesive', (last.adhesive || {}).brand + ((last.adhesive || {}).batch ? ' · ' + last.adhesive.batch : '')) +
        (last.notes ? kv('Notes', last.notes) : '') +
        '</dl></div></section>';
    }

    /* retention trend */
    var series = Store.retentionSeries(c.id, 8);
    if (series.length >= 2) {
      b += '<section class="section"><div class="section-head"><h2>Retention</h2>' +
        '<span class="eyebrow">last ' + series.length + ' fills</span></div><div class="card">' +
        '<div class="bars" role="img" aria-label="Retention over the last ' + series.length + ' fills: ' +
          series.map(function (p) { return UI.date(p.date) + ' ' + p.pct + '%'; }).join(', ') + '">' +
        series.map(function (p) {
          var cls = p.pct < 40 ? 'low' : p.pct < 60 ? 'mid' : '';
          return '<span class="b ' + cls + '"><i style="height:' + Math.max(3, p.pct) + '%"></i>' +
            '<span>' + p.pct + '</span></span>';
        }).join('') +
        '</div><p class="help" style="margin:8px 0 0">Percentage of lashes still on at each fill. Under 40% usually means aftercare or adhesive, not application.</p>' +
        '</div></section>';
    }

    if (c.notes) {
      b += '<section class="section"><h2 style="margin-bottom:12px">Notes</h2>' +
        '<div class="card" style="white-space:pre-wrap;font-size:.9375rem;color:var(--ink-2)">' + UI.esc(c.notes) + '</div></section>';
    }

    return b;
  }

  function kv(k, v) {
    return '<div class="kv"><dt>' + UI.esc(k) + '</dt><dd>' + UI.esc(v || '—') + '</dd></div>';
  }

  /* -------------------------------------------------------------- health */
  function tabHealth(c) {
    var h = c.health || {};
    var st = Store.patchTestStatus(c);
    var b = '';

    b += '<div class="card" style="margin-bottom:16px">' +
      '<div class="row-between" style="margin-bottom:12px"><h3>Health</h3>' +
      '<button class="btn btn-sm btn-ghost" data-action="edit-health" type="button">' + UI.icon('edit') + 'Edit</button></div>' +
      '<dl style="margin:0">' +
      kv('Allergies', h.allergies) +
      kv('Eye conditions', h.conditions) +
      kv('Medication', h.medications) +
      kv('Contact lenses', h.contactLenses ? 'Yes' : 'No') +
      kv('Sensitive eyes', h.sensitiveEyes ? 'Yes' : 'No') +
      kv('Pregnant / nursing', h.pregnant ? 'Yes' : 'No') +
      (h.updatedAt ? kv('Last reviewed', UI.date(String(h.updatedAt).slice(0, 10))) : '') +
      '</dl></div>';

    /* patch tests */
    b += '<section class="section"><div class="section-head"><h2>Patch tests</h2>' + UI.patchBadge(st) + '</div>';
    var tests = (c.patchTests || []).slice().sort(function (a, b2) { return b2.date.localeCompare(a.date); });
    if (!tests.length) {
      b += '<div class="card" style="text-align:center;color:var(--muted);padding:24px 16px;font-size:.875rem">No patch tests recorded.</div>';
    } else {
      b += '<div class="list">' + tests.map(function (t) {
        var m = { pass: ['ok', 'check', 'No reaction'], react: ['danger', 'alert', 'Reaction'], pending: ['warn', 'clock', 'Pending'] }[t.result] || ['neutral', 'info', t.result];
        return '<div class="item" style="cursor:default">' +
          '<span class="grow"><span class="title">' + UI.date(t.date) + '</span>' +
          '<span class="meta truncate">' + UI.esc(t.product || 'Adhesive') + (t.notes ? ' · ' + UI.esc(t.notes) : '') + '</span></span>' +
          UI.badge(m[0], m[2], m[1]) + '</div>';
      }).join('') + '</div>';
    }
    b += '<button class="btn btn-ghost btn-block" data-action="add-patch" type="button" style="margin-top:12px">' +
      UI.icon('plus') + 'Record a patch test</button></section>';

    /* consent */
    var con = Store.latestConsent(c);
    b += '<section class="section"><div class="section-head"><h2>Consent</h2>' +
      (Store.consentCurrent(c) ? UI.badge('ok', 'Current', 'check') : UI.badge('danger', 'Not signed', 'alert')) + '</div>';
    if (con) {
      b += '<div class="card"><dl style="margin:0">' +
        kv('Signed', UI.date(con.date)) +
        kv('Signed by', con.name) +
        kv('Form version', 'v' + con.version + (con.version !== Store.settings().consentVersion ? ' (superseded)' : '')) +
        kv('Photos for social', con.photoConsent ? 'Allowed' : 'Not allowed') +
        kv('Marketing messages', con.marketingConsent ? 'Allowed' : 'Not allowed') +
        '</dl>' +
        (con.signature ? '<img src="' + con.signature + '" alt="Signature of ' + UI.esc(con.name) + '" ' +
          'style="width:100%;max-width:280px;margin-top:12px;background:#fff;border-radius:8px;padding:6px">' : '') +
        '<div class="row" style="margin-top:12px;gap:8px">' +
        '<button class="btn btn-sm btn-ghost" data-action="sign-consent" type="button">Re-sign</button>' +
        '<button class="btn btn-sm btn-quiet" data-action="print-consent" type="button">' + UI.icon('print') + 'Print</button>' +
        '</div></div>';
    } else {
      b += '<div class="card" style="text-align:center;padding:24px 16px">' +
        '<p style="color:var(--muted);font-size:.875rem">No signed consent form on file.</p>' +
        '<button class="btn btn-primary" data-action="sign-consent" type="button">Get signature</button></div>';
    }
    b += '</section>';

    /* GDPR */
    b += '<section class="section"><h2 style="margin-bottom:12px">Her data</h2>' +
      '<div class="card"><p class="help" style="margin-bottom:12px">She can ask for a copy of her record or for it to be deleted. Both are her right under GDPR.</p>' +
      '<div class="row" style="gap:8px;flex-wrap:wrap">' +
      '<button class="btn btn-sm btn-ghost" data-action="export-client" type="button">' + UI.icon('download') + 'Export her record</button>' +
      '<button class="btn btn-sm btn-danger" data-action="erase-client" type="button">' + UI.icon('trash') + 'Erase permanently</button>' +
      '</div></div></section>';

    return b;
  }

  /* ------------------------------------------------------------ sessions */
  function tabSessions(c) {
    var recs = Store.records(c.id);
    var b = '<button class="btn btn-primary btn-block" data-action="new-session" type="button" style="margin-bottom:16px">' +
      UI.icon('sparkle') + (recs.length ? 'Start fill' : 'Start first set') + '</button>';

    if (!recs.length) {
      return b + UI.empty({ icon: 'sparkle', title: 'No sessions yet', message: 'Once you record a set, the next one starts pre-filled from it.' });
    }

    b += '<div class="list">' + recs.map(function (r) {
      return '<button class="item" data-action="view-session" data-id="' + r.id + '" type="button">' +
        '<span class="grow"><span class="title">' + UI.date(r.date) + (r.isFill ? ' · Fill' : ' · Full set') + '</span>' +
        '<span class="meta truncate">' + UI.esc([r.setType, r.style, r.curl, LashMap.summary(r.map)].filter(Boolean).join(' · ')) + '</span></span>' +
        (r.retentionPct !== '' && r.retentionPct != null
          ? UI.badge(Number(r.retentionPct) < 40 ? 'danger' : Number(r.retentionPct) < 60 ? 'warn' : 'ok', r.retentionPct + '%')
          : '') +
        '<span class="chev">' + UI.icon('chev-right') + '</span></button>';
    }).join('') + '</div>';

    return b;
  }

  /* -------------------------------------------------------------- photos */
  function tabPhotos(c) {
    return '<div class="row" style="gap:8px;margin-bottom:16px">' +
        '<button class="btn btn-primary btn-sm grow" data-action="shoot-before" type="button">' + UI.icon('camera') + 'Before</button>' +
        '<button class="btn btn-accent btn-sm grow" data-action="shoot-after" type="button">' + UI.icon('camera') + 'After</button>' +
      '</div>' +
      '<div data-photos><div class="skel" style="height:180px"></div></div>';
  }

  App.mountPhotos = function (screen, c) {
    var host = screen.querySelector('[data-photos]');
    if (!host) return;
    Store.photosForClient(c.id).then(function (list) {
      if (!list.length) {
        host.innerHTML = UI.empty({ icon: 'image', title: 'No photos yet', message: 'Shoot a before and after and the app will pair them for you.' });
        return;
      }
      // group by session (recordId), newest first
      var groups = {};
      list.forEach(function (p) { (groups[p.recordId || 'loose'] = groups[p.recordId || 'loose'] || []).push(p); });

      var html = '';
      Object.keys(groups).forEach(function (rid) {
        var g = groups[rid];
        var rec = rid === 'loose' ? null : Store.record(rid);
        var before = g.filter(function (p) { return p.kind === 'before'; });
        var after = g.filter(function (p) { return p.kind === 'after'; });

        html += '<section class="section" style="margin-top:20px"><div class="section-head">' +
          '<h3>' + (rec ? UI.date(rec.date) : 'Unfiled') + '</h3>' +
          (rec ? '<span class="eyebrow">' + UI.esc([rec.setType, rec.style].filter(Boolean).join(' · ')) + '</span>' : '') +
          '</div>';

        if (before.length && after.length) {
          html += '<div data-compare="' + UI.esc(rid) + '" style="margin-bottom:12px"></div>' +
            '<button class="btn btn-ghost btn-sm btn-block" data-action="share-card" data-id="' + UI.esc(rid) + '" type="button">' +
            UI.icon('share') + 'Make a before/after card</button>';
        }

        html += '<div class="photo-grid" style="margin-top:12px">' + g.map(function (p) {
          return '<div class="photo-pair">' +
            '<img class="thumb" src="' + Photos.url(p) + '" alt="' + UI.esc(p.kind) + ' photo, ' +
              UI.date(String(p.takenAt).slice(0, 10)) + '" loading="lazy" width="300" height="300">' +
            '<div class="cap"><span>' + UI.esc(p.kind) + '</span>' +
            '<button class="icon-btn" style="width:32px;height:32px;flex:0 0 32px" data-action="del-photo" data-id="' + p.id + '" ' +
            'type="button" aria-label="Delete this photo">' + UI.icon('trash') + '</button></div></div>';
        }).join('') + '</div></section>';
      });

      host.innerHTML = html;

      // mount the compare sliders
      Object.keys(groups).forEach(function (rid) {
        var el = host.querySelector('[data-compare="' + rid + '"]');
        if (!el) return;
        var g = groups[rid];
        var b = g.filter(function (p) { return p.kind === 'before'; })[0];
        var a = g.filter(function (p) { return p.kind === 'after'; })[0];
        if (b && a) Photos.compare(el, Photos.url(b), Photos.url(a));
      });
    }).catch(function (e) {
      host.innerHTML = '<div class="alert alert-danger">' + UI.icon('alert') +
        '<div><strong>Could not load photos</strong>' + UI.esc(e.message || '') + '</div></div>';
    });
  };

  /* ---------------------------------------------------- photo actions */
  function shoot(kind) {
    var c = App._client;
    var last = Store.lastRecord(c.id);
    Photos.capture({
      clientId: c.id,
      recordId: last ? last.id : null,
      kind: kind,
      camera: true,
      multiple: true
    }).then(function (saved) { if (saved.length) App.render(); });
  }
  App.actions['shoot-before'] = function () { shoot('before'); };
  App.actions['shoot-after'] = function () { shoot('after'); };

  App.actions['del-photo'] = function (id) {
    UI.confirm({
      title: 'Delete this photo?',
      message: 'It will be removed from this device permanently.',
      okLabel: 'Delete', danger: true,
      onOk: function () {
        Store.deletePhoto(id).then(function () { UI.toast('Photo deleted', 'ok'); App.render(); });
      }
    });
  };

  App.actions['share-card'] = function (rid) {
    var c = App._client;
    var con = Store.latestConsent(c);
    if (!con || !con.photoConsent) {
      UI.confirm({
        title: 'No photo consent',
        message: c.name + ' has not agreed to her photos being used publicly.',
        detail: 'Posting without consent is a GDPR breach. Get her written consent first — you can update it on the Health tab.',
        okLabel: 'Open consent',
        onOk: function () { App.go('#/client/' + c.id + '/health'); }
      });
      return;
    }
    Store.photosFor(rid).then(function (g) {
      var b = g.filter(function (p) { return p.kind === 'before'; })[0];
      var a = g.filter(function (p) { return p.kind === 'after'; })[0];
      if (!b || !a) return UI.toast('Need both a before and an after photo.', 'err');
      var rec = Store.record(rid) || {};
      var s = Store.settings();
      var close = UI.toast('Building card…');
      Photos.shareCard(b.blob, a.blob, {
        studio: s.studioName,
        setType: rec.setType, style: rec.style,
        detail: [rec.curl && rec.curl + ' curl', rec.diameter, LashMap.summary(rec.map)].filter(Boolean).join('  ·  '),
        handle: s.instagram || ''
      }).then(function (blob) {
        close();
        return Photos.share(blob, 'before-after.jpg', s.studioName || '');
      }).then(function (how) {
        if (how === 'downloaded') UI.toast('Card saved to your downloads', 'ok');
      }).catch(function (e) {
        close();
        UI.toast(e.message || 'Could not build the card', 'err');
      });
    });
  };

  /* =======================================================================
     Health edit
     ======================================================================= */
  App.actions['edit-health'] = function () {
    var c = App._client;
    var h = c.health || {};
    UI.sheet({
      title: 'Health details',
      body:
        '<form data-form novalidate>' +
        '<div class="alert alert-warn" style="margin-bottom:16px">' + UI.icon('shield') +
          '<div>This is health information. It stays on this device and is never uploaded.</div></div>' +
        UI.field({ label: 'Allergies', name: 'allergies', type: 'textarea', rows: 2, value: h.allergies,
                   placeholder: 'Cyanoacrylate, latex, medical tape, plasters…' }) +
        UI.field({ label: 'Eye conditions', name: 'conditions', type: 'textarea', rows: 2, value: h.conditions,
                   placeholder: 'Blepharitis, dry eye, styes, recent surgery…' }) +
        UI.field({ label: 'Medication', name: 'medications', type: 'textarea', rows: 2, value: h.medications,
                   placeholder: 'Anything affecting skin, healing or lash growth.' }) +
        '<fieldset><legend>Also check</legend>' +
        UI.check({ label: 'Wears contact lenses', name: 'contactLenses', checked: h.contactLenses }) +
        UI.check({ label: 'Sensitive or watery eyes', name: 'sensitiveEyes', checked: h.sensitiveEyes }) +
        UI.check({ label: 'Pregnant or nursing', name: 'pregnant', checked: h.pregnant }) +
        '</fieldset>' +
        '<button class="btn btn-primary btn-block" type="submit">Save health details</button>' +
        '</form>',
      onMount: function (el, api) {
        el.querySelector('[data-form]').addEventListener('submit', function (e) {
          e.preventDefault();
          var f = UI.formData(el);
          c.health = {
            allergies: f.allergies.trim(), conditions: f.conditions.trim(), medications: f.medications.trim(),
            contactLenses: f.contactLenses, sensitiveEyes: f.sensitiveEyes, pregnant: f.pregnant,
            updatedAt: new Date().toISOString()
          };
          if (!Store.saveClient(c)) return UI.toast('Could not save.', 'err');
          api.close(true);
          UI.toast('Health details saved', 'ok');
          App.render();
        });
      }
    });
  };

  /* =======================================================================
     Patch test
     ======================================================================= */
  App.actions['add-patch'] = function () {
    var c = App._client;
    var cat = Store.catalog();
    UI.sheet({
      title: 'Record a patch test',
      body:
        '<form data-form novalidate>' +
        UI.field({ label: 'Date applied', name: 'date', type: 'date', value: Store.todayISO(), required: true,
                   help: 'Must be at least ' + Store.settings().patchTestMinHours + 'h before her appointment.' }) +
        UI.field({ label: 'Product tested', name: 'product', type: 'select', options: cat.adhesives, value: cat.adhesives[0] }) +
        UI.field({ label: 'Result', name: 'result', type: 'select', value: 'pending', options: [
          { value: 'pending', label: 'Pending — waiting on 48h' },
          { value: 'pass', label: 'No reaction — cleared' },
          { value: 'react', label: 'Reaction — do not proceed' }
        ] }) +
        UI.field({ label: 'Notes', name: 'notes', type: 'textarea', rows: 2, placeholder: 'Any redness, itching, swelling…' }) +
        '<button class="btn btn-primary btn-block" type="submit">Save patch test</button>' +
        '</form>',
      onMount: function (el, api) {
        el.querySelector('[data-form]').addEventListener('submit', function (e) {
          e.preventDefault();
          UI.clearErrors(el);
          var f = UI.formData(el);
          if (!f.date) return UI.fieldError(el, 'date', 'Pick the date it was applied.');
          if (f.date > Store.todayISO()) return UI.fieldError(el, 'date', 'That date is in the future.');
          Store.addPatchTest(c.id, { date: f.date, product: f.product, result: f.result, notes: f.notes.trim() });
          api.close(true);
          UI.toast(f.result === 'react' ? 'Reaction recorded' : 'Patch test saved', f.result === 'react' ? 'err' : 'ok');
          App.render();
        });
      }
    });
  };

  /* =======================================================================
     Consent + signature
     ======================================================================= */
  App.actions['sign-consent'] = function () {
    var c = App._client;
    var s = Store.settings();
    UI.sheet({
      title: 'Consent form',
      body:
        '<div class="card card-2" style="max-height:220px;overflow-y:auto;margin-bottom:16px;white-space:pre-wrap;' +
          'font-size:.875rem;line-height:1.6;color:var(--ink-2)">' + UI.esc(s.consentText) + '</div>' +
        '<form data-form novalidate>' +
        UI.field({ label: 'Client name (as signed)', name: 'name', value: c.name, required: true }) +
        '<fieldset><legend>She also agrees to</legend>' +
        UI.check({ label: 'Photos of my lashes may be used on social media', name: 'photoConsent' }) +
        UI.check({ label: 'I may be sent booking reminders and offers', name: 'marketingConsent' }) +
        '<p class="help">Both are optional. She can say no to these and still have the treatment.</p>' +
        '</fieldset>' +
        '<div class="field"><label for="sig">Signature<span class="req">*</span></label>' +
          '<div class="sigpad-wrap">' +
            '<canvas id="sig" class="sigpad"></canvas>' +
            '<div class="sigpad-hint" data-hint>Sign here with a finger or Apple Pencil</div>' +
          '</div>' +
          '<div class="row" style="margin-top:8px"><button class="btn btn-quiet btn-sm" data-clear type="button">Clear signature</button></div>' +
          '<span class="err hide" data-err-sig role="alert"></span>' +
        '</div>' +
        '<button class="btn btn-primary btn-block" type="submit">Save signed consent</button>' +
        '</form>',
      onMount: function (el, api) {
        var canvas = el.querySelector('#sig');
        var hint = el.querySelector('[data-hint]');
        var ctx = canvas.getContext('2d');
        var drawn = false;

        function size() {
          var r = canvas.getBoundingClientRect();
          var dpr = global.devicePixelRatio || 1;
          canvas.width = r.width * dpr;
          canvas.height = r.height * dpr;
          ctx.scale(dpr, dpr);
          ctx.lineWidth = 2.2;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.strokeStyle = '#F6EDF4';
        }
        setTimeout(size, 40);

        var drawing = false;
        function pos(e) {
          var r = canvas.getBoundingClientRect();
          return { x: e.clientX - r.left, y: e.clientY - r.top };
        }
        canvas.addEventListener('pointerdown', function (e) {
          drawing = true; drawn = true;
          hint.style.display = 'none';
          canvas.setPointerCapture(e.pointerId);
          var p = pos(e);
          ctx.beginPath(); ctx.moveTo(p.x, p.y);
        });
        canvas.addEventListener('pointermove', function (e) {
          if (!drawing) return;
          e.preventDefault();
          var p = pos(e);
          ctx.lineTo(p.x, p.y); ctx.stroke();
        });
        canvas.addEventListener('pointerup', function () { drawing = false; });
        canvas.addEventListener('pointercancel', function () { drawing = false; });

        el.querySelector('[data-clear]').addEventListener('click', function () {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          drawn = false;
          hint.style.display = '';
        });

        el.querySelector('[data-form]').addEventListener('submit', function (e) {
          e.preventDefault();
          UI.clearErrors(el);
          var f = UI.formData(el);
          if (!f.name.trim()) return UI.fieldError(el, 'name', 'Enter the name she is signing under.');
          if (!drawn) {
            var err = el.querySelector('[data-err-sig]');
            err.innerHTML = UI.icon('alert') + '<span>A signature is required.</span>';
            err.classList.remove('hide');
            canvas.scrollIntoView({ block: 'center', behavior: 'smooth' });
            return;
          }
          // flatten onto white so it prints and exports readably
          var out = document.createElement('canvas');
          out.width = canvas.width; out.height = canvas.height;
          var octx = out.getContext('2d');
          octx.fillStyle = '#ffffff';
          octx.fillRect(0, 0, out.width, out.height);
          octx.globalCompositeOperation = 'difference';
          octx.drawImage(canvas, 0, 0);

          Store.addConsent(c.id, {
            date: Store.todayISO(),
            name: f.name.trim(),
            photoConsent: f.photoConsent,
            marketingConsent: f.marketingConsent,
            signature: out.toDataURL('image/png'),
            text: s.consentText
          });
          api.close(true);
          UI.toast('Consent signed and saved', 'ok');
          App.render();
        });
      }
    });
  };

  App.actions['print-consent'] = function () {
    var c = App._client;
    var con = Store.latestConsent(c);
    if (!con) return;
    var w = global.open('', '_blank');
    if (!w) return UI.toast('Allow pop-ups to print.', 'err');
    w.document.write(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Consent — ' + UI.esc(c.name) + '</title>' +
      '<style>body{font:14px/1.6 -apple-system,system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 20px;color:#111}' +
      'h1{font-size:20px} .m{color:#555;font-size:12px} pre{white-space:pre-wrap;font:inherit} ' +
      'img{width:260px;border:1px solid #ddd;margin-top:8px}</style></head><body>' +
      '<h1>' + UI.esc(Store.settings().studioName) + ' — Treatment consent</h1>' +
      '<p class="m">Client: <strong>' + UI.esc(c.name) + '</strong><br>Signed: ' + UI.date(con.date) +
      '<br>Form version: v' + con.version + '</p><hr><pre>' + UI.esc(con.text || '') + '</pre>' +
      '<p class="m">Photos for social media: <strong>' + (con.photoConsent ? 'Agreed' : 'Not agreed') + '</strong><br>' +
      'Marketing messages: <strong>' + (con.marketingConsent ? 'Agreed' : 'Not agreed') + '</strong></p>' +
      '<p class="m">Signature of ' + UI.esc(con.name) + ':</p>' +
      (con.signature ? '<img src="' + con.signature + '" alt="signature">' : '') +
      '</body></html>'
    );
    w.document.close();
    setTimeout(function () { w.print(); }, 400);
  };

  /* =======================================================================
     Aftercare card
     ======================================================================= */
  App.actions.aftercare = function () {
    var c = App._client;
    var list = Store.aftercare();
    UI.sheet({
      title: 'Aftercare',
      body:
        '<ul style="padding-left:20px;margin:0 0 16px;color:var(--ink-2);font-size:.9375rem;line-height:1.7">' +
        list.map(function (l) { return '<li style="margin-bottom:6px">' + UI.esc(l) + '</li>'; }).join('') +
        '</ul>' +
        '<div class="stack">' +
        (c.phone ? '<a class="btn btn-primary btn-block" href="sms:' + UI.esc(c.phone) +
          '?&body=' + encodeURIComponent(Store.settings().studioName + ' — lash aftercare:\n\n' +
            list.map(function (l, i) { return (i + 1) + '. ' + l; }).join('\n')) + '">' +
          UI.icon('phone') + 'Text it to ' + UI.esc(c.name.split(' ')[0]) + '</a>' : '') +
        '<button class="btn btn-ghost btn-block" data-copy type="button">Copy to clipboard</button>' +
        '</div>',
      onMount: function (el, api) {
        el.querySelector('[data-copy]').addEventListener('click', function () {
          var txt = Store.settings().studioName + ' — lash aftercare:\n\n' +
            list.map(function (l, i) { return (i + 1) + '. ' + l; }).join('\n');
          (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject())
            .then(function () { UI.toast('Copied', 'ok'); api.close(true); })
            .catch(function () { UI.toast('Could not copy on this device', 'err'); });
        });
      }
    });
  };

  /* =======================================================================
     GDPR: export / erase one client
     ======================================================================= */
  App.actions['export-client'] = function () {
    var c = App._client;
    var pack = {
      client: c,
      appointments: Store.appointments({ clientId: c.id }),
      records: Store.records(c.id),
      exportedAt: new Date().toISOString(),
      studio: Store.settings().studioName
    };
    var blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
    Photos.download(blob, 'record-' + c.name.replace(/\W+/g, '-').toLowerCase() + '.json');
    UI.toast('Record exported', 'ok');
  };

  App.actions['erase-client'] = function () {
    var c = App._client;
    UI.confirm({
      title: 'Erase ' + c.name + '?',
      message: 'This deletes her profile, health details, consent, every session and every photo.',
      detail: 'This cannot be undone and there is no backup unless you have exported one.',
      okLabel: 'Erase permanently', danger: true,
      onOk: function () {
        Store.eraseClient(c.id).then(function () {
          UI.toast('Record erased', 'ok');
          App.go('#/clients');
        });
      }
    });
  };

  global.App = App;
})(window);
