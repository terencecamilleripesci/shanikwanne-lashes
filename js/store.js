/* ==========================================================================
   store.js — data layer
   Everything lives ON THIS DEVICE. Nothing is sent anywhere, ever.
     - records/settings  -> localStorage (small, synchronous, easy to export)
     - photos            -> IndexedDB    (blobs; localStorage would blow the ~5MB quota)
   Health data (allergies, reactions, patch tests) is GDPR special-category,
   so: no network calls in this file, and erase() must really erase.
   ========================================================================== */
(function (global) {
  'use strict';

  var LS_KEY = 'shanikwanne.v1';
  var DB_NAME = 'shanikwanne-photos';
  var DB_VER = 1;
  var STORE = 'photos';

  /* ---------------------------------------------------------------- utils */
  function uid() {
    // crypto.randomUUID isn't on older Android WebViews
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  /**
   * All dates are LOCAL calendar dates, never UTC.
   * toISOString() would convert to UTC first — east of Greenwich that rolls the
   * date back a day (Malta is UTC+2 in summer), so every fill-due date, patch
   * expiry and "today" would silently be off by one, and between midnight and
   * 02:00 the app would think today was yesterday.
   */
  function fmtDate(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }
  function todayISO() { return fmtDate(new Date()); }
  function daysBetween(a, b) {
    // Math.round absorbs the 23h/25h days either side of a DST change.
    return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
  }
  function addDays(iso, n) {
    var d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return fmtDate(d);
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ------------------------------------------------------------- defaults */
  // Editable in Settings — Lash Dash's "custom selection options" idea.
  var DEFAULT_CATALOG = {
    setTypes: ['Classic', 'Hybrid', 'Volume', 'Mega Volume', 'Lash Lift', 'Removal'],
    styles: ['Natural', 'Cat Eye', 'Doll Eye', 'Wispy', 'Kim K', 'Squirrel'],
    curls: ['J', 'B', 'C', 'CC', 'D', 'L', 'M'],
    diameters: ['0.03', '0.05', '0.07', '0.10', '0.12', '0.15'],
    fans: ['2D', '3D', '4D', '5D', '6D', '7D+'],
    adhesives: ['Lash Affair Forte', 'London Lash Royal', 'Sky Glue S+', 'Other'],
    services: [
      { name: 'Full Set — Classic', mins: 120, price: 55 },
      { name: 'Full Set — Hybrid', mins: 135, price: 65 },
      { name: 'Full Set — Volume', mins: 150, price: 75 },
      { name: 'Fill — 2 week', mins: 60, price: 30 },
      { name: 'Fill — 3 week', mins: 75, price: 38 },
      { name: 'Removal', mins: 30, price: 15 }
    ]
  };

  var DEFAULT_SETTINGS = {
    studioName: 'Shanikwanne Lashes',
    artistName: '',
    phone: '',
    currency: 'EUR',
    fillIntervalDays: 21,      // nudge for a rebook
    patchTestValidDays: 180,   // 6 months is the common insurer requirement
    patchTestMinHours: 48,     // must be done >=48h BEFORE the appointment
    requirePatchTest: true,
    pinEnabled: false,
    pin: '',
    consentVersion: 1,
    consentText: '',           // filled from CONSENT_DEFAULT on first run
    lockOnBackground: true
  };

  var CONSENT_DEFAULT =
    'I confirm that I have been informed about the eyelash extension procedure and its ' +
    'aftercare requirements.\n\n' +
    'I confirm the information I have given about my health, allergies, medication and eye ' +
    'conditions is true and complete, and I will tell my technician if anything changes.\n\n' +
    'I understand that a patch test is required at least 48 hours before my first appointment, ' +
    'and that reactions are still possible even after a negative patch test.\n\n' +
    'I understand that I must follow the aftercare advice given, and that retention varies ' +
    'between individuals and is affected by aftercare, skin type and lifestyle.\n\n' +
    'I agree to my personal and health details being stored by the studio for the purpose of ' +
    'carrying out my treatments safely. I understand my records are kept on the studio\'s own ' +
    'device, are not shared with third parties, and that I may ask to see, correct, export or ' +
    'delete them at any time.';

  var AFTERCARE_DEFAULT = [
    'Keep lashes completely dry for the first 24 hours — no water, steam or sweat.',
    'No saunas, steam rooms, sunbeds or hot yoga for 48 hours.',
    'Cleanse daily with a lash-safe foaming cleanser — clean lashes last longer.',
    'Brush gently with the spoolie each morning, never when wet.',
    'No oil-based products, makeup wipes or waterproof mascara.',
    'Never pick, pull or twist your lashes — you will pull out your natural ones.',
    'Sleep on your back or use a silk pillowcase if you can.',
    'Book your fill at 2–3 weeks, before you drop below 50%.'
  ];

  /* ----------------------------------------------------------------- root */
  var db = null;

  function blank() {
    return {
      v: 1,
      clients: [],
      appointments: [],
      records: [],
      settings: clone(DEFAULT_SETTINGS),
      catalog: clone(DEFAULT_CATALOG),
      aftercare: AFTERCARE_DEFAULT.slice()
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return blank();
      var d = JSON.parse(raw);
      var base = blank();
      // shallow-merge so a new release adding a setting doesn't wipe the salon's data
      d.settings = Object.assign({}, base.settings, d.settings || {});
      d.catalog = Object.assign({}, base.catalog, d.catalog || {});
      d.clients = d.clients || [];
      d.appointments = d.appointments || [];
      d.records = d.records || [];
      d.aftercare = d.aftercare || base.aftercare;
      return d;
    } catch (e) {
      console.error('[store] load failed, starting empty', e);
      return blank();
    }
  }

  var data = load();
  if (!data.settings.consentText) data.settings.consentText = CONSENT_DEFAULT;

  var listeners = [];
  var saveTimer = null;

  function persist() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      // QuotaExceeded is the realistic failure. Must NOT fail silently —
      // a silent save failure means she thinks a client is booked when they aren't.
      console.error('[store] SAVE FAILED', e);
      listeners.forEach(function (fn) { try { fn('error', e); } catch (_) {} });
      return false;
    }
  }

  function commit() {
    var ok = persist();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      listeners.forEach(function (fn) { try { fn('change'); } catch (_) {} });
    }, 0);
    return ok;
  }

  /* ------------------------------------------------------------ IndexedDB */
  function openDB() {
    return new Promise(function (res, rej) {
      if (db) return res(db);
      if (!global.indexedDB) return rej(new Error('IndexedDB unavailable'));
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains(STORE)) {
          var os = d.createObjectStore(STORE, { keyPath: 'id' });
          os.createIndex('clientId', 'clientId', { unique: false });
          os.createIndex('recordId', 'recordId', { unique: false });
        }
      };
      req.onsuccess = function () { db = req.result; res(db); };
      req.onerror = function () { rej(req.error); };
    });
  }

  function tx(mode) {
    return openDB().then(function (d) { return d.transaction(STORE, mode).objectStore(STORE); });
  }
  function wrap(req) {
    return new Promise(function (res, rej) {
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error); };
    });
  }

  /* =======================================================================
     Public API
     ======================================================================= */
  var Store = {
    uid: uid,
    todayISO: todayISO,
    daysBetween: daysBetween,
    addDays: addDays,
    CONSENT_DEFAULT: CONSENT_DEFAULT,
    AFTERCARE_DEFAULT: AFTERCARE_DEFAULT,

    onChange: function (fn) { listeners.push(fn); },
    raw: function () { return data; },
    settings: function () { return data.settings; },
    catalog: function () { return data.catalog; },
    aftercare: function () { return data.aftercare; },

    saveSettings: function (patch) {
      Object.assign(data.settings, patch);
      return commit();
    },
    saveCatalog: function (patch) {
      Object.assign(data.catalog, patch);
      return commit();
    },
    saveAftercare: function (list) { data.aftercare = list; return commit(); },

    /* ---------------------------------------------------------- clients */
    clients: function (opts) {
      opts = opts || {};
      var list = data.clients.filter(function (c) { return opts.archived ? c.archived : !c.archived; });
      if (opts.q) {
        var q = opts.q.toLowerCase();
        list = list.filter(function (c) {
          return (c.name || '').toLowerCase().indexOf(q) > -1 ||
                 (c.phone || '').indexOf(q) > -1 ||
                 (c.instagram || '').toLowerCase().indexOf(q) > -1;
        });
      }
      return list.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    },

    client: function (id) {
      return data.clients.filter(function (c) { return c.id === id; })[0] || null;
    },

    saveClient: function (c) {
      if (!c.id) {
        c.id = uid();
        c.createdAt = new Date().toISOString();
        c.patchTests = c.patchTests || [];
        c.consents = c.consents || [];
        c.health = c.health || {};
        c.prefs = c.prefs || {};
        data.clients.push(c);
      } else {
        var i = data.clients.findIndex(function (x) { return x.id === c.id; });
        if (i > -1) data.clients[i] = c; else data.clients.push(c);
      }
      return commit() ? c : null;
    },

    archiveClient: function (id, yes) {
      var c = Store.client(id);
      if (!c) return false;
      c.archived = !!yes;
      return commit();
    },

    /** GDPR erasure: client + their appointments + records + photo blobs. */
    eraseClient: function (id) {
      data.clients = data.clients.filter(function (c) { return c.id !== id; });
      data.appointments = data.appointments.filter(function (a) { return a.clientId !== id; });
      data.records = data.records.filter(function (r) { return r.clientId !== id; });
      var ok = commit();
      return Store.deletePhotosFor(id).then(function () { return ok; });
    },

    /* ----------------------------------------------------- patch testing */
    patchTestStatus: function (client) {
      var s = data.settings;
      if (!s.requirePatchTest) return { state: 'off', label: 'Not required' };
      var passes = (client.patchTests || [])
        .filter(function (p) { return p.result === 'pass'; })
        .sort(function (a, b) { return b.date.localeCompare(a.date); });
      var reacted = (client.patchTests || []).filter(function (p) { return p.result === 'react'; });
      if (reacted.length) {
        var last = reacted.sort(function (a, b) { return b.date.localeCompare(a.date); })[0];
        return { state: 'react', label: 'Reaction recorded', date: last.date, test: last };
      }
      if (!passes.length) return { state: 'none', label: 'No patch test' };
      var latest = passes[0];
      var expires = addDays(latest.date, s.patchTestValidDays);
      var left = daysBetween(todayISO(), expires);
      if (left < 0) return { state: 'expired', label: 'Patch test expired', date: latest.date, expires: expires, days: left };
      if (left <= 21) return { state: 'soon', label: 'Expires in ' + left + 'd', date: latest.date, expires: expires, days: left };
      return { state: 'valid', label: 'Valid to ' + expires, date: latest.date, expires: expires, days: left };
    },

    /** A patch test must be >=48h old AND unexpired at the time of the appointment. */
    patchTestOKFor: function (client, whenISO) {
      var s = data.settings;
      if (!s.requirePatchTest) return { ok: true };
      var st = Store.patchTestStatus(client);
      if (st.state === 'react') return { ok: false, why: 'A reaction is on file for this client.' };
      if (st.state === 'none') return { ok: false, why: 'No patch test on record.' };
      var hrs = (new Date(whenISO + 'T00:00:00') - new Date(st.date + 'T00:00:00')) / 3600000;
      if (hrs < s.patchTestMinHours) {
        return { ok: false, why: 'Patch test must be at least ' + s.patchTestMinHours + 'h before the appointment.' };
      }
      if (daysBetween(whenISO, st.expires) < 0) {
        return { ok: false, why: 'Patch test expired on ' + st.expires + '.' };
      }
      return { ok: true };
    },

    addPatchTest: function (clientId, t) {
      var c = Store.client(clientId);
      if (!c) return false;
      c.patchTests = c.patchTests || [];
      t.id = uid();
      c.patchTests.push(t);
      return commit();
    },

    /* ---------------------------------------------------------- consent */
    latestConsent: function (client) {
      var list = (client.consents || []).slice()
        .sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
      return list[0] || null;
    },
    consentCurrent: function (client) {
      var c = Store.latestConsent(client);
      return !!(c && c.version === data.settings.consentVersion);
    },
    addConsent: function (clientId, consent) {
      var c = Store.client(clientId);
      if (!c) return false;
      c.consents = c.consents || [];
      consent.id = uid();
      consent.version = data.settings.consentVersion;
      c.consents.push(consent);
      return commit();
    },

    /* ----------------------------------------------------- appointments */
    appointments: function (opts) {
      opts = opts || {};
      var list = data.appointments.slice();
      if (opts.clientId) list = list.filter(function (a) { return a.clientId === opts.clientId; });
      if (opts.date) list = list.filter(function (a) { return a.date === opts.date; });
      if (opts.from) list = list.filter(function (a) { return a.date >= opts.from; });
      if (opts.to) list = list.filter(function (a) { return a.date <= opts.to; });
      if (opts.status) list = list.filter(function (a) { return a.status === opts.status; });
      return list.sort(function (a, b) {
        return (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''));
      });
    },
    appointment: function (id) {
      return data.appointments.filter(function (a) { return a.id === id; })[0] || null;
    },
    saveAppointment: function (a) {
      if (!a.id) {
        a.id = uid();
        a.status = a.status || 'booked';
        a.createdAt = new Date().toISOString();
        data.appointments.push(a);
      } else {
        var i = data.appointments.findIndex(function (x) { return x.id === a.id; });
        if (i > -1) data.appointments[i] = a; else data.appointments.push(a);
      }
      return commit() ? a : null;
    },
    deleteAppointment: function (id) {
      data.appointments = data.appointments.filter(function (a) { return a.id !== id; });
      return commit();
    },

    /* --------------------------------------------------------- records */
    records: function (clientId) {
      return data.records
        .filter(function (r) { return !clientId || r.clientId === clientId; })
        .sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    },
    record: function (id) {
      return data.records.filter(function (r) { return r.id === id; })[0] || null;
    },
    lastRecord: function (clientId) { return Store.records(clientId)[0] || null; },

    saveRecord: function (r) {
      if (!r.id) {
        r.id = uid();
        r.createdAt = new Date().toISOString();
        data.records.push(r);
      } else {
        var i = data.records.findIndex(function (x) { return x.id === r.id; });
        if (i > -1) data.records[i] = r; else data.records.push(r);
      }
      return commit() ? r : null;
    },
    deleteRecord: function (id) {
      var r = Store.record(id);
      data.records = data.records.filter(function (x) { return x.id !== id; });
      var ok = commit();
      return Store.deletePhotosForRecord(id).then(function () { return ok && !!r; });
    },

    /**
     * THE core flow every good lash app has: a new session starts pre-filled
     * from the last one, so a fill "goes exactly as planned".
     */
    draftFromLast: function (clientId) {
      var last = Store.lastRecord(clientId);
      var cat = data.catalog;
      if (!last) {
        return {
          clientId: clientId, date: todayISO(),
          setType: cat.setTypes[0], style: cat.styles[0],
          curl: 'C', diameter: '0.07', fans: '3D',
          map: { left: ['', '', '', '', '', '', ''], right: ['', '', '', '', '', '', ''] },
          adhesive: { brand: cat.adhesives[0], batch: '', openedOn: '' },
          room: { tempC: '', humidity: '' },
          isFill: false, retentionPct: '', durationMin: '', price: '', notes: ''
        };
      }
      var d = clone(last);
      delete d.id; delete d.createdAt; delete d.appointmentId;
      d.date = todayISO();
      d.isFill = true;
      d.retentionPct = '';     // measured THIS visit, never carried over
      d.notes = '';
      d.durationMin = '';
      d.room = { tempC: '', humidity: '' };
      d.prefilledFrom = last.date;
      return d;
    },

    /* -------------------------------------------------- derived / alerts */
    nextDue: function (clientId) {
      var last = Store.lastRecord(clientId);
      if (!last) return null;
      var c = Store.client(clientId);
      var iv = (c && c.fillIntervalDays) || data.settings.fillIntervalDays;
      return addDays(last.date, iv);
    },

    /** Clients overdue for a fill and with nothing booked — the rebook list. */
    overdue: function () {
      var today = todayISO();
      return Store.clients().map(function (c) {
        var due = Store.nextDue(c.id);
        if (!due) return null;
        var booked = Store.appointments({ clientId: c.id, from: today, status: 'booked' });
        if (booked.length) return null;
        var over = daysBetween(due, today);
        if (over < 0) return null;
        return { client: c, due: due, daysOver: over };
      }).filter(Boolean).sort(function (a, b) { return b.daysOver - a.daysOver; });
    },

    /** Booked appointments whose patch test won't be valid on the day. */
    patchAlerts: function () {
      var today = todayISO();
      return Store.appointments({ from: today, status: 'booked' }).map(function (a) {
        var c = Store.client(a.clientId);
        if (!c) return null;
        var chk = Store.patchTestOKFor(c, a.date);
        if (chk.ok) return null;
        return { appointment: a, client: c, why: chk.why };
      }).filter(Boolean);
    },

    /** Retention trend — the number that tells her if her work/glue is off. */
    retentionSeries: function (clientId, n) {
      return Store.records(clientId)
        .filter(function (r) { return r.retentionPct !== '' && r.retentionPct != null; })
        .slice(0, n || 8).reverse()
        .map(function (r) { return { date: r.date, pct: Number(r.retentionPct) }; });
    },

    /** Average retention grouped by adhesive batch — catches a bad bottle. */
    retentionByAdhesive: function () {
      var by = {};
      data.records.forEach(function (r) {
        if (r.retentionPct === '' || r.retentionPct == null) return;
        var ad = r.adhesive || {};
        var key = (ad.brand || 'Unknown') + (ad.batch ? ' · ' + ad.batch : '');
        (by[key] = by[key] || []).push(Number(r.retentionPct));
      });
      return Object.keys(by).map(function (k) {
        var a = by[k];
        return { key: k, n: a.length, avg: Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length) };
      }).sort(function (a, b) { return b.n - a.n; });
    },

    stats: function () {
      var today = todayISO();
      var month = today.slice(0, 7);
      var done = data.records.filter(function (r) { return (r.date || '').slice(0, 7) === month; });
      var revenue = done.reduce(function (s, r) { return s + (Number(r.price) || 0); }, 0);
      return {
        todayCount: Store.appointments({ date: today, status: 'booked' }).length,
        clients: Store.clients().length,
        monthSessions: done.length,
        monthRevenue: revenue
      };
    },

    /* ---------------------------------------------------------- photos */
    addPhoto: function (rec) {
      rec.id = rec.id || uid();
      rec.takenAt = rec.takenAt || new Date().toISOString();
      return tx('readwrite').then(function (os) { return wrap(os.add(rec)); }).then(function () { return rec; });
    },
    photosFor: function (recordId) {
      return tx('readonly').then(function (os) {
        return wrap(os.index('recordId').getAll(recordId));
      }).then(function (list) {
        return (list || []).sort(function (a, b) { return (a.takenAt || '').localeCompare(b.takenAt || ''); });
      });
    },
    photosForClient: function (clientId) {
      return tx('readonly').then(function (os) {
        return wrap(os.index('clientId').getAll(clientId));
      }).then(function (list) {
        return (list || []).sort(function (a, b) { return (b.takenAt || '').localeCompare(a.takenAt || ''); });
      });
    },
    deletePhoto: function (id) {
      return tx('readwrite').then(function (os) { return wrap(os.delete(id)); });
    },
    deletePhotosFor: function (clientId) {
      return Store.photosForClient(clientId).then(function (list) {
        return Promise.all(list.map(function (p) { return Store.deletePhoto(p.id); }));
      }).catch(function () { return null; });
    },
    deletePhotosForRecord: function (recordId) {
      return Store.photosFor(recordId).then(function (list) {
        return Promise.all(list.map(function (p) { return Store.deletePhoto(p.id); }));
      }).catch(function () { return null; });
    },
    photoCount: function () {
      return tx('readonly').then(function (os) { return wrap(os.count()); }).catch(function () { return 0; });
    },

    /* --------------------------------------------------- backup / erase */
    /** Full backup INCLUDING photos (base64). This is her only safety net. */
    exportAll: function () {
      return tx('readonly').then(function (os) { return wrap(os.getAll()); })
        .catch(function () { return []; })
        .then(function (photos) {
          return Promise.all((photos || []).map(function (p) {
            return blobToDataURL(p.blob).then(function (d) {
              return { id: p.id, clientId: p.clientId, recordId: p.recordId, kind: p.kind, takenAt: p.takenAt, data: d };
            });
          }));
        }).then(function (photos) {
          return {
            app: 'shanikwanne-lashes', v: 1,
            exportedAt: new Date().toISOString(),
            data: data, photos: photos
          };
        });
    },

    importAll: function (payload, mode) {
      if (!payload || payload.app !== 'shanikwanne-lashes') {
        return Promise.reject(new Error('That file is not a Shanikwanne Lashes backup.'));
      }
      var incoming = payload.data || {};
      if (mode === 'replace') {
        data = Object.assign(blank(), incoming);
      } else {
        // merge by id — never clobber an existing record silently
        ['clients', 'appointments', 'records'].forEach(function (k) {
          var seen = {};
          data[k].forEach(function (x) { seen[x.id] = true; });
          (incoming[k] || []).forEach(function (x) { if (!seen[x.id]) data[k].push(x); });
        });
        data.settings = Object.assign({}, data.settings, incoming.settings || {});
        data.catalog = Object.assign({}, data.catalog, incoming.catalog || {});
      }
      if (!commit()) return Promise.reject(new Error('Could not save — storage may be full.'));

      var photos = payload.photos || [];
      if (!photos.length) return Promise.resolve({ clients: data.clients.length, photos: 0 });
      return Promise.all(photos.map(function (p) {
        return dataURLToBlob(p.data).then(function (blob) {
          return tx('readwrite').then(function (os) {
            return wrap(os.put({ id: p.id, clientId: p.clientId, recordId: p.recordId, kind: p.kind, takenAt: p.takenAt, blob: blob }));
          });
        }).catch(function () { return null; });
      })).then(function () { return { clients: data.clients.length, photos: photos.length }; });
    },

    eraseEverything: function () {
      data = blank();
      data.settings.consentText = CONSENT_DEFAULT;
      localStorage.removeItem(LS_KEY);
      commit();
      return openDB().then(function (d) {
        return new Promise(function (res) {
          var t = d.transaction(STORE, 'readwrite');
          t.objectStore(STORE).clear();
          t.oncomplete = function () { res(true); };
          t.onerror = function () { res(false); };
        });
      }).catch(function () { return false; });
    }
  };

  /* ------------------------------------------------------------ helpers */
  function blobToDataURL(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = function () { rej(fr.error); };
      fr.readAsDataURL(blob);
    });
  }
  function dataURLToBlob(url) {
    return fetch(url).then(function (r) { return r.blob(); });
  }
  Store.blobToDataURL = blobToDataURL;

  global.Store = Store;
})(window);
