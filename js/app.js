/* ==========================================================================
   app.js — boot, router, navigation, notifications, Today + Clients screens.
   Screens for client detail / session / calendar / settings live in screens.js.
   ========================================================================== */
(function (global) {
  'use strict';

  var App = { routes: {} };

  /* =======================================================================
     Notifications
     Honest scope: with no server there is no background push. On iOS a PWA can
     only show a notification while it is running, and only once installed to
     the Home Screen (iOS 16.4+). So we fire a catch-up digest on open rather
     than pretend to ping her overnight. The UI says exactly that.
     ======================================================================= */
  var Notif = {
    supported: function () {
      return 'Notification' in global && 'serviceWorker' in navigator;
    },
    standalone: function () {
      return global.matchMedia('(display-mode: standalone)').matches ||
             global.navigator.standalone === true;
    },
    permission: function () {
      return Notif.supported() ? Notification.permission : 'unsupported';
    },

    /** Must be called from a user gesture — iOS rejects it otherwise. */
    enable: function () {
      if (!Notif.supported()) {
        return Promise.resolve({ ok: false, why: 'This device or browser does not support notifications.' });
      }
      if (!Notif.standalone() && /iPad|iPhone|iPod/.test(navigator.userAgent)) {
        return Promise.resolve({
          ok: false,
          why: 'On iPhone and iPad you must first add this app to your Home Screen, then turn notifications on from there.'
        });
      }
      return Notification.requestPermission().then(function (p) {
        if (p === 'granted') {
          Store.saveSettings({ notifyEnabled: true });
          return { ok: true };
        }
        Store.saveSettings({ notifyEnabled: false });
        return {
          ok: false,
          why: p === 'denied'
            ? 'Notifications are blocked. Turn them back on in Settings › Notifications for this app.'
            : 'Permission was dismissed.'
        };
      });
    },

    disable: function () { Store.saveSettings({ notifyEnabled: false }); },

    show: function (title, body, tag) {
      if (Notif.permission() !== 'granted' || !Store.settings().notifyEnabled) return;
      try {
        navigator.serviceWorker.ready.then(function (reg) {
          reg.showNotification(title, {
            body: body,
            tag: tag,
            icon: 'icons/icon-192.png',
            badge: 'icons/icon-192.png',
            renotify: false
          });
        });
      } catch (e) { /* never let a notification break the app */ }
    },

    /** Build today's digest. Also used to render the in-app alert cards. */
    digest: function () {
      var today = Store.todayISO();
      var appts = Store.appointments({ date: today, status: 'booked' });
      var patch = Store.patchAlerts();
      var over = Store.overdue();
      return { appts: appts, patch: patch, overdue: over };
    },

    /** Fire at most once per calendar day so she isn't spammed on every open. */
    runDaily: function () {
      var s = Store.settings();
      if (!s.notifyEnabled || Notif.permission() !== 'granted') return;
      var today = Store.todayISO();
      if (s.lastNotifyDate === today) return;

      var d = Notif.digest();
      var lines = [];
      if (d.appts.length) lines.push(d.appts.length + ' appointment' + (d.appts.length > 1 ? 's' : '') + ' today');
      if (d.patch.length) lines.push(d.patch.length + ' patch-test problem' + (d.patch.length > 1 ? 's' : ''));
      if (d.overdue.length) lines.push(d.overdue.length + ' client' + (d.overdue.length > 1 ? 's' : '') + ' due a rebook');

      if (lines.length) {
        Notif.show(Store.settings().studioName || 'Studio', lines.join(' · '), 'daily-' + today);
        Store.saveSettings({ lastNotifyDate: today });
      }
    }
  };
  App.Notif = Notif;

  /* =======================================================================
     Storage durability — iOS can evict IndexedDB/localStorage from a PWA.
     For a records app that is data loss, so ask for persistent storage.
     ======================================================================= */
  function requestPersistence() {
    if (!navigator.storage || !navigator.storage.persist) return Promise.resolve(null);
    return navigator.storage.persisted().then(function (already) {
      if (already) return true;
      return navigator.storage.persist();
    }).catch(function () { return null; });
  }
  App.requestPersistence = requestPersistence;

  App.storageInfo = function () {
    if (!navigator.storage || !navigator.storage.estimate) return Promise.resolve(null);
    return navigator.storage.estimate().then(function (e) {
      return { usage: e.usage || 0, quota: e.quota || 0 };
    }).catch(function () { return null; });
  };

  /* =======================================================================
     Router
     ======================================================================= */
  var NAV = [
    { id: 'today', label: 'Today', icon: 'home', hash: '#/today' },
    { id: 'clients', label: 'Clients', icon: 'users', hash: '#/clients' },
    { id: 'calendar', label: 'Calendar', icon: 'calendar', hash: '#/calendar' },
    { id: 'settings', label: 'Settings', icon: 'settings', hash: '#/settings' }
  ];

  App.parse = function () {
    var h = (location.hash || '#/today').replace(/^#\/?/, '');
    var parts = h.split('/').filter(Boolean);
    return { name: parts[0] || 'today', id: parts[1] || null, tab: parts[2] || null };
  };

  App.go = function (hash) { location.hash = hash; };

  App.render = function () {
    var r = App.parse();
    var screen = document.getElementById('screen');
    var topbar = document.getElementById('topbar');

    Photos.releaseAll();

    var fn = App.routes[r.name] || App.routes.today;
    var out = fn(r) || { title: '', body: '' };

    topbar.innerHTML =
      (out.back ? '<button class="icon-btn" data-back type="button" aria-label="Back">' + UI.icon('chev-left') + '</button>' : '') +
      '<div class="grow"><h1 class="truncate">' + out.title + '</h1>' +
        (out.sub ? '<span class="sub truncate">' + out.sub + '</span>' : '') + '</div>' +
      (out.actions || '');

    screen.innerHTML = out.body;
    App.renderNav(r.name);

    // move focus to the content region on route change (WCAG)
    if (App._lastRoute && App._lastRoute !== location.hash) {
      screen.focus({ preventScroll: true });
      screen.scrollTop = 0;
      global.scrollTo(0, 0);
    }
    App._lastRoute = location.hash;

    if (out.onMount) out.onMount(screen);
  };

  App.renderNav = function (active) {
    document.getElementById('nav').innerHTML = NAV.map(function (n) {
      var on = n.id === active;
      return '<a href="' + n.hash + '"' + (on ? ' aria-current="page"' : '') + '>' +
        UI.icon(n.icon) + '<span>' + n.label + '</span></a>';
    }).join('');
  };

  /* =======================================================================
     Screen: Today
     ======================================================================= */
  App.routes.today = function () {
    var s = Store.stats();
    var d = Notif.digest();
    var set = Store.settings();
    var hour = new Date().getHours();
    var greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    var b = '';

    /* --- hero: the one thing she needs to know right now --- */
    var now = new Date();
    var nowMin = now.getHours() * 60 + now.getMinutes();
    var next = d.appts.filter(function (a) {
      var p = String(a.time || '0:0').split(':');
      return (Number(p[0]) * 60 + Number(p[1] || 0)) >= nowMin - 30;
    })[0] || d.appts[0];

    if (next) {
      var nc = Store.client(next.clientId);
      b += '<div class="hero">' +
        '<span class="eyebrow" style="color:var(--primary)">' +
          (d.appts.indexOf(next) === 0 && nowMin < 720 ? 'First in today' : 'Next in') + '</span>' +
        '<div class="row" style="gap:12px;align-items:center;margin-top:8px">' +
          (nc ? UI.avatar(nc.name) : '') +
          '<span class="grow" style="min-width:0">' +
            '<span class="who truncate" style="display:block">' + UI.esc(nc ? nc.name : 'Unknown') + '</span>' +
            '<span class="what truncate" style="display:block">' + UI.esc(next.service || 'Appointment') + '</span>' +
          '</span>' +
        '</div>' +
        '<span class="when">' + UI.time(next.time) +
          '<small>' + (next.durationMin || 0) + ' min' +
          (next.price ? ' · ' + UI.money(next.price) : '') + '</small></span>' +
        '<div class="hero-actions">' +
          (nc ? '<a class="btn btn-primary" href="#/client/' + nc.id + '">' + UI.icon('sparkle') + 'Open client</a>' : '') +
          (nc && nc.phone ? '<a class="btn btn-ghost" href="tel:' + UI.esc(nc.phone) + '" aria-label="Call ' + UI.esc(nc.name) + '">' + UI.icon('phone') + 'Call</a>' : '') +
        '</div>' +
      '</div>';
    } else {
      b += '<div class="hero">' +
        '<span class="eyebrow" style="color:var(--primary)">' + UI.date(Store.todayISO()) + '</span>' +
        '<div class="who">Nothing booked today</div>' +
        '<div class="what">A good day to chase the rebooks below.</div>' +
        '<div class="hero-actions">' +
          '<a class="btn btn-primary" href="#/calendar">' + UI.icon('plus') + 'Add an appointment</a>' +
        '</div>' +
      '</div>';
    }

    /* --- alerts: these are the things that ruin a day --- */
    if (d.patch.length) {
      b += '<div class="stack" style="margin-bottom:24px">';
      d.patch.forEach(function (p) {
        b += '<div class="alert alert-danger">' + UI.icon('alert') +
          '<div class="grow"><strong>' + UI.esc(p.client.name) + ' — ' + UI.relDate(p.appointment.date) + '</strong>' +
          UI.esc(p.why) +
          '<div style="margin-top:8px"><a href="#/client/' + p.client.id + '/health" class="btn btn-sm btn-ghost">Open record</a></div>' +
          '</div></div>';
      });
      b += '</div>';
    }

    /* --- stats --- */
    b += '<div class="stats">' +
      '<div class="stat"><div class="v num">' + s.todayCount + '</div><div class="k">Today</div></div>' +
      '<div class="stat"><div class="v num">' + s.clients + '</div><div class="k">Clients</div></div>' +
      '<div class="stat"><div class="v num">' + s.monthSessions + '</div><div class="k">This month</div></div>' +
      '<div class="stat accent"><div class="v num">' + UI.money(s.monthRevenue) + '</div><div class="k">Revenue</div></div>' +
      '</div>';

    /* --- today's appointments --- */
    b += '<section class="section"><div class="section-head">' +
      '<h2>Today</h2><span class="eyebrow">' + UI.date(Store.todayISO()) + '</span></div>';

    if (!d.appts.length) {
      b += '<div class="card" style="text-align:center;color:var(--muted);padding:32px 16px">' +
        UI.icon('calendar', '') + '<p style="margin:8px 0 0;font-size:.875rem">No appointments booked today.</p></div>';
    } else {
      b += '<div class="list">' + d.appts.map(apptRow).join('') + '</div>';
    }
    b += '</section>';

    /* --- rebook list: the money feature --- */
    if (d.overdue.length) {
      b += '<section class="section"><div class="section-head">' +
        '<h2>Due a rebook</h2>' + UI.badge('warn', d.overdue.length + ' client' + (d.overdue.length > 1 ? 's' : ''), 'clock') +
        '</div><div class="list">';
      d.overdue.slice(0, 8).forEach(function (o) {
        b += '<a class="item" href="#/client/' + o.client.id + '">' +
          UI.avatar(o.client.name) +
          '<span class="grow"><span class="title truncate">' + UI.esc(o.client.name) + '</span>' +
          '<span class="meta">' + o.daysOver + ' day' + (o.daysOver === 1 ? '' : 's') + ' past due · last fill ' + UI.date(Store.lastRecord(o.client.id).date) + '</span></span>' +
          '<span class="chev">' + UI.icon('chev-right') + '</span></a>';
      });
      b += '</div></section>';
    }

    return {
      title: greet + (set.artistName ? ', ' + UI.esc(set.artistName.split(' ')[0]) : ''),
      sub: UI.esc(set.studioName || 'Shanikwanne Lashes'),
      body: b + '<button class="fab" data-action="new-client" type="button" aria-label="Add client">' + UI.icon('plus') + '</button>'
    };
  };

  function apptRow(a) {
    var c = Store.client(a.clientId);
    var name = c ? c.name : 'Unknown client';
    return '<a class="item" href="#/client/' + (c ? c.id : '') + '">' +
      '<span style="flex:0 0 58px;text-align:center;white-space:nowrap">' +
        '<span class="num" style="font-weight:700;color:var(--primary);font-size:.9375rem">' + UI.time(a.time) + '</span>' +
        '<span style="display:block;font-size:.6875rem;color:var(--muted)">' + (a.durationMin || 0) + 'm</span>' +
      '</span>' +
      (c ? UI.avatar(c.name) : '') +
      '<span class="grow"><span class="title truncate">' + UI.esc(name) + '</span>' +
      '<span class="meta truncate">' + UI.esc(a.service || 'Appointment') +
        (a.price ? ' · ' + UI.money(a.price) : '') + '</span></span>' +
      '<span class="chev">' + UI.icon('chev-right') + '</span></a>';
  }
  App.apptRow = apptRow;

  /* =======================================================================
     Screen: Clients
     ======================================================================= */
  App.routes.clients = function () {
    var q = App._clientQuery || '';
    var list = Store.clients({ q: q });

    var b =
      '<div class="field" style="margin-bottom:16px">' +
        '<label for="cq" style="position:absolute;left:-9999px">Search clients</label>' +
        '<input id="cq" type="search" placeholder="Search name, phone or Instagram" value="' + UI.esc(q) + '" autocomplete="off">' +
      '</div>';

    if (!list.length) {
      b += q
        ? UI.empty({ icon: 'search', title: 'No matches', message: 'Nothing found for "' + q + '".' })
        : UI.empty({
            icon: 'users', title: 'No clients yet',
            message: 'Add your first client and the app will start tracking her maps, patch tests and fills.',
            action: { act: 'new-client', label: 'Add a client' }
          }) +
          (Demo.isLoaded() ? '' :
            '<p class="help" style="text-align:center;margin-top:-8px">or ' +
            '<button class="btn btn-quiet btn-sm" data-action="load-demo" type="button" ' +
            'style="text-decoration:underline">load a demo client to look around</button></p>');
    } else {
      b += '<div class="list">' + list.map(function (c) {
        var st = Store.patchTestStatus(c);
        var due = Store.nextDue(c.id);
        var over = due ? Store.daysBetween(due, Store.todayISO()) : null;
        var meta = due
          ? (over > 0 ? over + 'd past due' : over === 0 ? 'Due today' : 'Next fill ' + UI.date(due))
          : 'No sessions yet';
        var warn = (st.state === 'expired' || st.state === 'none' || st.state === 'react');
        return '<a class="item" href="#/client/' + c.id + '">' +
          UI.avatar(c.name) +
          '<span class="grow"><span class="title truncate">' + UI.esc(c.name) + '</span>' +
          '<span class="meta truncate">' + UI.esc(meta) + '</span></span>' +
          (c.demo ? UI.badge('demo', 'DEMO') : '') +
          (warn ? UI.badge('danger', st.state === 'react' ? 'Reaction' : 'Patch test', 'alert') : '') +
          '<span class="chev">' + UI.icon('chev-right') + '</span></a>';
      }).join('') + '</div>';
    }

    return {
      title: 'Clients',
      sub: list.length + (q ? ' match' + (list.length === 1 ? '' : 'es') : ' total'),
      body: b + '<button class="fab" data-action="new-client" type="button" aria-label="Add client">' + UI.icon('plus') + '</button>',
      onMount: function (screen) {
        var input = screen.querySelector('#cq');
        if (!input) return;
        input.addEventListener('input', UI.debounce(function () {
          App._clientQuery = input.value;
          var pos = input.selectionStart;
          App.render();
          var again = document.getElementById('cq');
          if (again) { again.focus(); again.setSelectionRange(pos, pos); }
        }, 200));
      }
    };
  };

  /* =======================================================================
     Client add / edit sheet
     ======================================================================= */
  App.clientSheet = function (client) {
    var isNew = !client;
    var c = client || {};
    UI.sheet({
      title: isNew ? 'New client' : 'Edit client',
      body:
        '<form data-form novalidate>' +
        UI.field({ label: 'Full name', name: 'name', value: c.name, required: true, autocomplete: 'name', placeholder: 'e.g. Maria Borg' }) +
        UI.field({ label: 'Mobile', name: 'phone', type: 'tel', value: c.phone, inputmode: 'tel', autocomplete: 'tel', help: 'Used for the call and message shortcuts.' }) +
        UI.field({ label: 'Instagram', name: 'instagram', value: c.instagram, placeholder: '@handle' }) +
        UI.field({ label: 'Email', name: 'email', type: 'email', value: c.email, autocomplete: 'email' }) +
        UI.field({ label: 'Date of birth', name: 'dob', type: 'date', value: c.dob, help: 'Optional — for birthday offers.' }) +
        UI.field({ label: 'Fill interval', name: 'fillIntervalDays', type: 'number', min: 7, max: 60,
                   value: c.fillIntervalDays || '', placeholder: String(Store.settings().fillIntervalDays),
                   help: 'Days between fills for this client. Blank uses the studio default.' }) +
        UI.field({ label: 'Notes', name: 'notes', type: 'textarea', value: c.notes, rows: 3,
                   placeholder: 'Preferences, how she likes her coffee, anything worth remembering.' }) +
        '<button class="btn btn-primary btn-block" type="submit">' + (isNew ? 'Add client' : 'Save changes') + '</button>' +
        '</form>',
      dirty: function (el) {
        var f = UI.formData(el);
        return isNew ? !!f.name : (f.name !== (c.name || '') || f.phone !== (c.phone || ''));
      },
      onMount: function (el, api) {
        el.querySelector('[data-form]').addEventListener('submit', function (e) {
          e.preventDefault();
          UI.clearErrors(el);
          var f = UI.formData(el);
          if (!f.name.trim()) return UI.fieldError(el, 'name', 'A name is required.');

          var dup = Store.clients().filter(function (x) {
            return x.id !== c.id && x.name.trim().toLowerCase() === f.name.trim().toLowerCase();
          });
          if (dup.length && isNew) {
            return UI.fieldError(el, 'name', 'You already have a client with this name.');
          }

          var out = Object.assign({}, c, {
            name: f.name.trim(),
            phone: f.phone.trim(),
            instagram: f.instagram.trim(),
            email: f.email.trim(),
            dob: f.dob,
            notes: f.notes.trim(),
            fillIntervalDays: f.fillIntervalDays ? Number(f.fillIntervalDays) : null
          });

          var saved = Store.saveClient(out);
          if (!saved) return UI.toast('Could not save — storage may be full.', 'err');

          api.close(true);
          UI.toast(isNew ? 'Client added' : 'Saved', 'ok');
          if (isNew) App.go('#/client/' + saved.id); else App.render();
        });
      }
    });
  };

  /* =======================================================================
     Global event delegation
     ======================================================================= */
  document.addEventListener('click', function (e) {
    var back = e.target.closest('[data-back]');
    if (back) { history.back(); return; }

    var act = e.target.closest('[data-action]');
    if (!act) return;
    var name = act.dataset.action;
    var id = act.dataset.id;

    if (name === 'new-client') { App.clientSheet(null); return; }

    if (name === 'load-demo') {
      var close = UI.toast('Building the demo record…');
      Demo.load().then(function () {
        close();
        UI.toast('Demo client added — remove it any time in Settings', 'ok');
        App.render();
      }).catch(function (err) {
        close();
        UI.toast('Could not build the demo: ' + (err.message || ''), 'err');
      });
      return;
    }

    if (name === 'remove-demo') {
      UI.confirm({
        title: 'Remove the demo client?',
        message: 'The sample record, its sessions and its photos will be deleted. Your real clients are untouched.',
        okLabel: 'Remove demo', danger: true,
        onOk: function () {
          Demo.remove().then(function (n) {
            UI.toast(n ? 'Demo removed' : 'Nothing to remove', 'ok');
            App.go('#/clients');
            App.render();
          });
        }
      });
      return;
    }

    if (App.actions && App.actions[name]) { App.actions[name](id, act, e); }
  });

  /* =======================================================================
     Lock screen (optional PIN)
     ======================================================================= */
  var Lock = {
    el: null,
    show: function () {
      Lock.el = Lock.el || document.getElementById('lockscreen');
      Lock.el.classList.remove('hide');
      document.body.style.overflow = 'hidden';
      setTimeout(function () { document.getElementById('pin-input').focus(); }, 80);
    },
    hide: function () {
      if (Lock.el) Lock.el.classList.add('hide');
      document.body.style.overflow = '';
      App._locked = false;
    },
    init: function () {
      var input = document.getElementById('pin-input');
      var err = document.getElementById('pin-err');
      function tryPin() {
        if (input.value === Store.settings().pin) {
          err.classList.add('hide');
          input.value = '';
          Lock.hide();
        } else {
          err.textContent = 'Wrong PIN.';
          err.classList.remove('hide');
          input.value = '';
          input.focus();
        }
      }
      document.getElementById('pin-go').addEventListener('click', tryPin);
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') tryPin(); });
    },
    maybeLock: function () {
      var s = Store.settings();
      if (s.pinEnabled && s.pin) { App._locked = true; Lock.show(); }
    }
  };
  App.Lock = Lock;

  /* =======================================================================
     Boot
     ======================================================================= */
  function boot() {
    Lock.init();

    global.addEventListener('hashchange', App.render);

    Store.onChange(function (kind, e) {
      if (kind === 'error') {
        UI.toast('Could not save — device storage may be full. Export a backup now.', 'err');
      }
    });

    // re-lock when she puts the iPad down
    document.addEventListener('visibilitychange', function () {
      var s = Store.settings();
      if (document.hidden && s.pinEnabled && s.pin && s.lockOnBackground) {
        App._locked = true;
      } else if (!document.hidden && App._locked) {
        Lock.show();
      }
    });

    requestPersistence();
    if (!location.hash) location.hash = '#/today';
    App.render();
    Lock.maybeLock();

    // daily digest, after the first paint
    setTimeout(function () { Notif.runDaily(); }, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.App = App;
})(window);
