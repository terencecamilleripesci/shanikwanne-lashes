/* ==========================================================================
   settings.js — studio settings, notifications, catalogue, backup, security.
   ========================================================================== */
(function (global) {
  'use strict';

  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  App.routes.settings = function () {
    var s = Store.settings();
    var perm = App.Notif.permission();
    var standalone = App.Notif.standalone();

    var b = '';

    /* ---- install prompt (iOS has no beforeinstallprompt) ---- */
    if (!standalone) {
      b += '<div class="alert alert-warn" style="margin-bottom:24px">' + UI.icon('info') +
        '<div><strong>Add to Home Screen</strong>' +
        (isIOS
          ? 'In Safari tap the Share button, then <em>Add to Home Screen</em>. The app then runs full-screen, works offline and can send reminders.'
          : 'Use your browser menu and choose <em>Install app</em> or <em>Add to Home Screen</em>.') +
        '</div></div>';
    }

    /* ---- studio ---- */
    b += section('Studio', 'sparkle',
      '<form data-studio novalidate>' +
      UI.field({ label: 'Studio name', name: 'studioName', value: s.studioName, required: true }) +
      UI.field({ label: 'Your name', name: 'artistName', value: s.artistName, placeholder: 'Shown on the Today screen' }) +
      UI.field({ label: 'Instagram handle', name: 'instagram', value: s.instagram || '', placeholder: '@handle',
                 help: 'Printed on before/after share cards.' }) +
      UI.field({ label: 'Currency', name: 'currency', type: 'select', value: s.currency,
                 options: ['EUR', 'GBP', 'USD'] }) +
      '<button class="btn btn-primary btn-block btn-sm" type="submit">Save studio details</button>' +
      '</form>');

    /* ---- appearance ---- */
    var theme = s.theme || 'light';
    b += section('Appearance', 'eye',
      '<div class="seg" role="tablist" style="margin-bottom:10px">' +
        [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Match iPad']].map(function (t) {
          return '<button role="tab" type="button" data-action="set-theme" data-id="' + t[0] + '" ' +
            'aria-selected="' + (theme === t[0]) + '">' + t[1] + '</button>';
        }).join('') +
      '</div>' +
      '<p class="help">“Match iPad” follows the system Light/Dark setting automatically.</p>');

    /* ---- notifications ---- */
    var notifState = perm === 'unsupported'
      ? { kind: 'neutral', text: 'Not supported on this device' }
      : perm === 'denied'
        ? { kind: 'danger', text: 'Blocked in system settings' }
        : (s.notifyEnabled && perm === 'granted')
          ? { kind: 'ok', text: 'On' }
          : { kind: 'neutral', text: 'Off' };

    b += section('Reminders', 'clock',
      '<div class="row-between" style="margin-bottom:12px">' +
        '<span style="font-weight:600">Daily reminder</span>' +
        UI.badge(notifState.kind, notifState.text, notifState.kind === 'ok' ? 'check' : 'info') +
      '</div>' +
      '<p class="help" style="margin-bottom:12px">A summary of the day — appointments, patch tests that have lapsed, and clients due a rebook.</p>' +
      '<div class="alert alert-warn" style="margin-bottom:12px">' + UI.icon('info') +
        '<div><strong>How this works</strong>This app has no server, so reminders appear <em>when you open it</em>, ' +
        'not in the background overnight. ' +
        (isIOS ? 'On iPhone and iPad it also needs the app added to your Home Screen first.' : '') +
        '</div></div>' +
      (s.notifyEnabled && perm === 'granted'
        ? '<button class="btn btn-ghost btn-block btn-sm" data-action="notif-off" type="button">Turn reminders off</button>' +
          '<button class="btn btn-quiet btn-block btn-sm" data-action="notif-test" type="button" style="margin-top:8px">Send a test</button>'
        : '<button class="btn btn-primary btn-block btn-sm" data-action="notif-on" type="button">Turn reminders on</button>'));

    /* ---- treatment rules ---- */
    b += section('Treatment rules', 'shield',
      '<form data-rules novalidate>' +
      UI.check({ label: 'Require a patch test before treatment', name: 'requirePatchTest', checked: s.requirePatchTest }) +
      UI.field({ label: 'Patch test valid for (days)', name: 'patchTestValidDays', type: 'number', min: 30, max: 730,
                 value: s.patchTestValidDays, help: 'Most insurers ask for 6 months (180 days).' }) +
      UI.field({ label: 'Minimum hours before appointment', name: 'patchTestMinHours', type: 'number', min: 12, max: 168,
                 value: s.patchTestMinHours, help: '48 hours is the industry standard.' }) +
      UI.field({ label: 'Default fill interval (days)', name: 'fillIntervalDays', type: 'number', min: 7, max: 60,
                 value: s.fillIntervalDays, help: 'Used to work out who is due a rebook.' }) +
      '<button class="btn btn-primary btn-block btn-sm" type="submit">Save rules</button>' +
      '</form>');

    /* ---- catalogue ---- */
    var cat = Store.catalog();
    b += section('Your lists', 'sliders',
      '<p class="help" style="margin-bottom:12px">The options that appear in the session form. One per line.</p>' +
      '<form data-catalog novalidate>' +
      lines('Set types', 'setTypes', cat.setTypes) +
      lines('Styles', 'styles', cat.styles) +
      lines('Curls', 'curls', cat.curls) +
      lines('Diameters', 'diameters', cat.diameters) +
      lines('Adhesives', 'adhesives', cat.adhesives) +
      '<button class="btn btn-primary btn-block btn-sm" type="submit">Save lists</button>' +
      '</form>' +
      '<hr class="divider">' +
      '<button class="btn btn-ghost btn-block btn-sm" data-action="edit-services" type="button">Services &amp; prices</button>' +
      '<button class="btn btn-ghost btn-block btn-sm" data-action="edit-consent" type="button" style="margin-top:8px">Consent form wording</button>' +
      '<button class="btn btn-ghost btn-block btn-sm" data-action="edit-aftercare" type="button" style="margin-top:8px">Aftercare advice</button>');

    /* ---- retention insight ---- */
    var byAd = Store.retentionByAdhesive();
    if (byAd.length) {
      b += section('Retention by adhesive', 'eye',
        '<p class="help" style="margin-bottom:12px">Average retention grouped by glue and batch. A batch that is clearly worse than the rest is usually the bottle, not your work.</p>' +
        '<dl style="margin:0">' + byAd.map(function (a) {
          return '<div class="kv"><dt>' + UI.esc(a.key) + ' <span style="opacity:.6">(' + a.n + ')</span></dt>' +
            '<dd style="color:' + (a.avg < 40 ? 'var(--danger)' : a.avg < 60 ? 'var(--warn)' : 'var(--ok)') + '">' +
            a.avg + '%</dd></div>';
        }).join('') + '</dl>');
    }

    /* ---- security ---- */
    var configured = Auth.isConfigured();
    var au = s.auth || {};
    var lockLabel = { 0: 'never', 5: 'after 5 minutes', 15: 'after 15 minutes', 60: 'after 1 hour' }[Number(au.autoLockMin)] || 'after 15 minutes';

    b += section('Sign-in', 'lock',
      '<div class="row-between" style="margin-bottom:12px">' +
        '<span style="font-weight:600">Passcode</span>' +
        (configured ? UI.badge('ok', 'On', 'check') : UI.badge('danger', 'Off', 'alert')) +
      '</div>' +
      (configured
        ? '<dl style="margin:0 0 12px">' +
            '<div class="kv"><dt>Keep me signed in</dt><dd>' + (au.remember ? 'Yes' : 'No') + '</dd></div>' +
            '<div class="kv"><dt>Locks again</dt><dd>' + UI.esc(lockLabel) + '</dd></div>' +
          '</dl>' +
          '<button class="btn btn-ghost btn-block btn-sm" data-action="auth-change" type="button">Change passcode</button>' +
          '<button class="btn btn-ghost btn-block btn-sm" data-action="auth-signout" type="button" style="margin-top:8px">' +
            'Sign out now</button>' +
          '<button class="btn btn-quiet btn-block btn-sm" data-action="auth-off" type="button" style="margin-top:8px">' +
            'Turn the passcode off</button>'
        : '<div class="alert alert-danger" style="margin-bottom:12px">' + UI.icon('alert') +
            '<div><strong>Client records are unprotected</strong>Anyone who opens this iPad can read ' +
            'allergies, eye conditions and client photos.</div></div>' +
          '<button class="btn btn-primary btn-block btn-sm" data-action="auth-change" type="button">' +
            UI.icon('lock') + 'Set a passcode</button>') +
      '<hr class="divider">' +
      '<p class="help"><strong>Be clear on what this does.</strong> It stops someone picking up the ' +
      'iPad and reading client records. It is a lock, not encryption — the records still sit on this ' +
      'device. For real protection also turn on the iPad\'s own passcode or Face ID, and do not lend ' +
      'the device out.' +
      (Auth.isStrongHashing()
        ? ' Your passcode is stored salted and hashed (SHA-256).'
        : ' <strong>Note:</strong> this page is not on a secure (https) connection, so a weaker ' +
          'fallback hash is in use. Once it is hosted over https the strong one takes over.') +
      '</p>');

    /* ---- demo data ---- */
    b += section('Demo client', 'info',
      Demo.isLoaded()
        ? '<p class="help" style="margin-bottom:12px">A sample record is loaded so you can try every screen — ' +
          'lash map, patch test, consent, retention chart and before/after photos. It is marked ' +
          '<strong>DEMO</strong> everywhere and is not counted as a real client.</p>' +
          '<button class="btn btn-ghost btn-block btn-sm" data-action="remove-demo" type="button">' +
          UI.icon('trash') + 'Remove the demo client</button>'
        : '<p class="help" style="margin-bottom:12px">Load a sample client with sessions, a lash map, ' +
          'a signed consent form and before/after photos, so you can see how everything works before ' +
          'putting real clients in.</p>' +
          '<button class="btn btn-primary btn-block btn-sm" data-action="load-demo" type="button">' +
          UI.icon('sparkle') + 'Load a demo client</button>');

    /* ---- backup ---- */
    b += section('Backup', 'download',
      '<div class="alert alert-warn" style="margin-bottom:12px">' + UI.icon('alert') +
        '<div><strong>Everything lives on this device only</strong>If the iPad is lost, wiped or the app is deleted, ' +
        'the records go with it. Export a backup regularly and keep it somewhere safe.</div></div>' +
      '<div data-storage class="help" style="margin-bottom:12px"></div>' +
      '<button class="btn btn-primary btn-block btn-sm" data-action="export-all" type="button">' +
        UI.icon('download') + 'Export full backup</button>' +
      '<button class="btn btn-ghost btn-block btn-sm" data-action="import-all" type="button" style="margin-top:8px">' +
        UI.icon('upload') + 'Restore from a backup</button>');

    /* ---- danger ---- */
    b += '<section class="section"><h2 style="margin-bottom:12px">Danger zone</h2>' +
      '<div class="card danger-zone">' +
      '<p style="font-size:.875rem;margin-bottom:12px">Erase every client, session and photo from this device. ' +
      'This is what to use if you are handing the device on.</p>' +
      '<button class="btn btn-danger btn-block btn-sm" data-action="erase-all" type="button">' +
        UI.icon('trash') + 'Erase everything</button></div></section>';

    b += '<p class="help" style="text-align:center;margin-top:32px">' +
      UI.esc(s.studioName) + ' · built for iPhone and iPad · works offline</p>';

    return {
      title: 'Settings',
      sub: 'Studio, reminders and backup',
      body: b,
      onMount: function (screen) {
        bindForms(screen);
        App.storageInfo().then(function (info) {
          var el = screen.querySelector('[data-storage]');
          if (!el || !info) return;
          var mb = function (n) { return (n / 1048576).toFixed(1) + ' MB'; };
          Store.photoCount().then(function (n) {
            el.textContent = n + ' photos · using ' + mb(info.usage) +
              (info.quota ? ' of about ' + mb(info.quota) + ' available' : '');
          });
        });
      }
    };
  };

  function section(title, icon, inner) {
    return '<section class="section"><div class="section-head"><h2>' + UI.esc(title) + '</h2></div>' +
      '<div class="card">' + inner + '</div></section>';
  }

  function lines(label, name, arr) {
    return UI.field({ label: label, name: name, type: 'textarea', rows: Math.min(6, arr.length + 1), value: arr.join('\n') });
  }

  /* ------------------------------------------------------------- binding */
  function bindForms(screen) {
    var s = Store.settings();

    on(screen, '[data-studio]', function (f) {
      if (!f.studioName.trim()) return { field: 'studioName', msg: 'The studio needs a name.' };
      Store.saveSettings({
        studioName: f.studioName.trim(), artistName: f.artistName.trim(),
        instagram: f.instagram.trim(), currency: f.currency
      });
      return 'Studio details saved';
    });

    on(screen, '[data-rules]', function (f) {
      var v = Number(f.patchTestValidDays), h = Number(f.patchTestMinHours), fi = Number(f.fillIntervalDays);
      if (!(v >= 30 && v <= 730)) return { field: 'patchTestValidDays', msg: 'Between 30 and 730 days.' };
      if (!(h >= 12 && h <= 168)) return { field: 'patchTestMinHours', msg: 'Between 12 and 168 hours.' };
      if (!(fi >= 7 && fi <= 60)) return { field: 'fillIntervalDays', msg: 'Between 7 and 60 days.' };
      Store.saveSettings({
        requirePatchTest: f.requirePatchTest, patchTestValidDays: v,
        patchTestMinHours: h, fillIntervalDays: fi
      });
      return 'Rules saved';
    });

    on(screen, '[data-catalog]', function (f) {
      var clean = function (t) {
        return String(t || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      };
      var patch = {};
      ['setTypes', 'styles', 'curls', 'diameters', 'adhesives'].forEach(function (k) {
        var list = clean(f[k]);
        if (list.length) patch[k] = list;
      });
      Store.saveCatalog(patch);
      return 'Lists saved';
    });

  }

  /* ----------------------------------------------------------- appearance */
  App.actions['set-theme'] = function (id) {
    UI.applyTheme(id);
    Store.saveSettings({ theme: id });
    App.render();
  };

  /* -------------------------------------------------------------- sign-in */
  App.actions['auth-change'] = function () { App.Lock.setupSheet(); };

  App.actions['auth-signout'] = function () {
    Auth.signOut();
    UI.toast('Signed out', 'ok');
    App.Lock.show();
  };

  App.actions['auth-off'] = function () {
    UI.sheet({
      title: 'Turn the passcode off?',
      body:
        '<div class="alert alert-danger" style="margin-bottom:16px">' + UI.icon('alert') +
          '<div><strong>Client records will be unprotected</strong>Anyone who opens this iPad will be ' +
          'able to read allergies, eye conditions and client photos.</div></div>' +
        '<form data-form novalidate>' +
        UI.field({ label: 'Confirm your passcode', name: 'p', type: 'password', required: true,
                   inputmode: 'numeric', autocomplete: 'current-password' }) +
        '<button class="btn btn-danger btn-block" type="submit">Turn it off</button>' +
        '<button class="btn btn-quiet btn-block" data-close type="button" style="margin-top:8px">Keep it on</button>' +
        '</form>',
      onMount: function (el, api) {
        el.querySelector('[data-form]').addEventListener('submit', function (e) {
          e.preventDefault();
          UI.clearErrors(el);
          Auth.disable(UI.formData(el).p).then(function (okd) {
            if (!okd) return UI.fieldError(el, 'p', 'That passcode is not correct.');
            api.close(true);
            UI.toast('Passcode turned off', 'ok');
            App.render();
          });
        });
      }
    });
  };

  function on(screen, sel, handler) {
    var form = screen.querySelector(sel);
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      UI.clearErrors(form);
      var res = handler(UI.formData(form));
      if (res && res.field) return UI.fieldError(form, res.field, res.msg);
      UI.toast(res || 'Saved', 'ok');
      App.render();
    });
  }

  /* --------------------------------------------------------- notifications */
  App.actions['notif-on'] = function () {
    App.Notif.enable().then(function (r) {
      if (r.ok) { UI.toast('Reminders are on', 'ok'); App.render(); }
      else UI.confirm({ title: 'Could not turn on reminders', message: r.why, okLabel: 'OK', onOk: function () {} });
    });
  };
  App.actions['notif-off'] = function () {
    App.Notif.disable();
    UI.toast('Reminders turned off', 'ok');
    App.render();
  };
  App.actions['notif-test'] = function () {
    var d = App.Notif.digest();
    App.Notif.show(Store.settings().studioName,
      d.appts.length + ' appointments today · ' + d.overdue.length + ' due a rebook', 'test');
    UI.toast('Test sent', 'ok');
  };

  /* --------------------------------------------------------- sub-editors */
  App.actions['edit-services'] = function () {
    var cat = Store.catalog();
    UI.sheet({
      title: 'Services & prices',
      body: '<p class="help" style="margin-bottom:12px">One per line: <code>Name | minutes | price</code></p>' +
        '<form data-form novalidate>' +
        UI.field({ label: 'Services', name: 'services', type: 'textarea', rows: 8,
          value: cat.services.map(function (s) { return s.name + ' | ' + s.mins + ' | ' + s.price; }).join('\n') }) +
        '<button class="btn btn-primary btn-block" type="submit">Save services</button></form>',
      onMount: function (el, api) {
        el.querySelector('[data-form]').addEventListener('submit', function (e) {
          e.preventDefault();
          var rows = UI.formData(el).services.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
          var out = [], bad = null;
          rows.forEach(function (l) {
            var p = l.split('|').map(function (x) { return x.trim(); });
            if (p.length < 3 || !p[0] || isNaN(Number(p[1])) || isNaN(Number(p[2]))) { bad = bad || l; return; }
            out.push({ name: p[0], mins: Number(p[1]), price: Number(p[2]) });
          });
          if (bad) return UI.fieldError(el, 'services', 'This line is not in "Name | minutes | price" form: ' + bad);
          if (!out.length) return UI.fieldError(el, 'services', 'Add at least one service.');
          Store.saveCatalog({ services: out });
          api.close(true);
          UI.toast('Services saved', 'ok');
          App.render();
        });
      }
    });
  };

  App.actions['edit-consent'] = function () {
    var s = Store.settings();
    UI.sheet({
      title: 'Consent wording',
      body:
        '<div class="alert alert-warn" style="margin-bottom:16px">' + UI.icon('alert') +
          '<div><strong>Changing this bumps the form version</strong>Every client will show as "not signed" until she signs the new wording. ' +
          'That is deliberate — an old signature does not cover new terms.</div></div>' +
        '<form data-form novalidate>' +
        UI.field({ label: 'Consent text', name: 'consentText', type: 'textarea', rows: 12, value: s.consentText }) +
        '<button class="btn btn-primary btn-block" type="submit">Save (version ' + (s.consentVersion + 1) + ')</button>' +
        '<button class="btn btn-quiet btn-block" data-reset type="button" style="margin-top:8px">Restore the default wording</button>' +
        '</form>',
      onMount: function (el, api) {
        el.querySelector('[data-reset]').addEventListener('click', function () {
          el.querySelector('[name=consentText]').value = Store.CONSENT_DEFAULT;
        });
        el.querySelector('[data-form]').addEventListener('submit', function (e) {
          e.preventDefault();
          var t = UI.formData(el).consentText.trim();
          if (t.length < 40) return UI.fieldError(el, 'consentText', 'That is too short to be a consent form.');
          if (t === s.consentText) { api.close(true); return UI.toast('No changes', 'ok'); }
          Store.saveSettings({ consentText: t, consentVersion: s.consentVersion + 1 });
          api.close(true);
          UI.toast('Consent updated to v' + (s.consentVersion + 1), 'ok');
          App.render();
        });
      }
    });
  };

  App.actions['edit-aftercare'] = function () {
    UI.sheet({
      title: 'Aftercare advice',
      body: '<p class="help" style="margin-bottom:12px">One point per line. This is what gets texted to the client.</p>' +
        '<form data-form novalidate>' +
        UI.field({ label: 'Aftercare points', name: 'aftercare', type: 'textarea', rows: 10, value: Store.aftercare().join('\n') }) +
        '<button class="btn btn-primary btn-block" type="submit">Save aftercare</button>' +
        '<button class="btn btn-quiet btn-block" data-reset type="button" style="margin-top:8px">Restore defaults</button>' +
        '</form>',
      onMount: function (el, api) {
        el.querySelector('[data-reset]').addEventListener('click', function () {
          el.querySelector('[name=aftercare]').value = Store.AFTERCARE_DEFAULT.join('\n');
        });
        el.querySelector('[data-form]').addEventListener('submit', function (e) {
          e.preventDefault();
          var list = UI.formData(el).aftercare.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
          if (!list.length) return UI.fieldError(el, 'aftercare', 'Add at least one point.');
          Store.saveAftercare(list);
          api.close(true);
          UI.toast('Aftercare saved', 'ok');
        });
      }
    });
  };

  /* ------------------------------------------------------------- backup */
  App.actions['export-all'] = function () {
    var close = UI.toast('Building backup…');
    Store.exportAll().then(function (pack) {
      var blob = new Blob([JSON.stringify(pack)], { type: 'application/json' });
      close();
      Photos.download(blob, 'shanikwanne-backup-' + Store.todayISO() + '.json');
      UI.toast('Backup saved — keep it somewhere safe', 'ok');
    }).catch(function (e) {
      close();
      UI.toast('Backup failed: ' + (e.message || ''), 'err');
    });
  };

  App.actions['import-all'] = function () {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(input);
    input.addEventListener('change', function () {
      var file = (input.files || [])[0];
      input.remove();
      if (!file) return;
      file.text().then(function (txt) {
        var pack;
        try { pack = JSON.parse(txt); }
        catch (e) { throw new Error('That file is not readable.'); }

        var n = ((pack.data || {}).clients || []).length;
        UI.confirm({
          title: 'Restore this backup?',
          message: 'It contains ' + n + ' client' + (n === 1 ? '' : 's') +
            ' and ' + (pack.photos || []).length + ' photos, saved ' +
            UI.date(String(pack.exportedAt || '').slice(0, 10)) + '.',
          detail: 'Anything already on this device with the same record will be kept. Nothing is overwritten.',
          okLabel: 'Restore',
          onOk: function () {
            var close = UI.toast('Restoring…');
            Store.importAll(pack, 'merge').then(function (r) {
              close();
              UI.toast('Restored — ' + r.clients + ' clients, ' + r.photos + ' photos', 'ok');
              App.render();
            }).catch(function (e) {
              close();
              UI.toast(e.message || 'Restore failed', 'err');
            });
          }
        });
      }).catch(function (e) {
        UI.toast(e.message || 'Could not read that file', 'err');
      });
    });
    input.click();
  };

  App.actions['erase-all'] = function () {
    UI.confirm({
      title: 'Erase everything?',
      message: 'Every client, session, consent form and photo will be deleted from this device.',
      detail: 'There is no undo. Export a backup first unless you are certain.',
      okLabel: 'Erase everything', danger: true,
      onOk: function () {
        // second gate — this one is genuinely irreversible
        UI.confirm({
          title: 'Really erase?',
          message: 'Last chance. This cannot be undone.',
          okLabel: 'Yes, erase it all', danger: true,
          onOk: function () {
            Store.eraseEverything().then(function () {
              UI.toast('Everything erased', 'ok');
              App.go('#/today');
              location.reload();
            });
          }
        });
      }
    });
  };

})(window);
