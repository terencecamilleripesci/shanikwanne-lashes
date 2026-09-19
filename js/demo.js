/* ==========================================================================
   demo.js — one fully-populated demo client so every screen can be tried
   without typing anything in.

   Deliberately explicit: the client is tagged `demo:true`, shown with a DEMO
   badge everywhere, and removable in one tap. Fake records must never be
   mistakable for a real client in an app that holds medical history.
   ========================================================================== */
(function (global) {
  'use strict';

  var Demo = {};

  /* ----------------------------------------------------- sample imagery ---
     Drawn on canvas rather than shipped as JPEGs: keeps the repo small, and
     gives us a genuine before/after pair so the compare slider and the share
     card are testable. Clearly illustrative, not a photo of a real person.   */
  function eyeImage(opts) {
    var W = 900, H = 1200;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var x = c.getContext('2d');

    // skin backdrop
    var g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, opts.after ? '#3a2b2b' : '#332727');
    g.addColorStop(1, '#1d1618');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);

    // framed as a close-up: a small eye floating in a big empty frame reads as
    // a placeholder, which is exactly what we're trying not to look like
    var cx = W / 2, cy = H * 0.56;
    var lidW = 800, lidH = 300;

    // eye white
    x.save();
    x.beginPath();
    x.ellipse(cx, cy, lidW / 2, lidH / 2, 0, 0, Math.PI * 2);
    x.clip();
    x.fillStyle = '#efe6e2';
    x.fillRect(cx - lidW / 2, cy - lidH / 2, lidW, lidH);
    // iris
    x.fillStyle = '#5b4632';
    x.beginPath(); x.arc(cx, cy, 104, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#2a1f16';
    x.beginPath(); x.arc(cx, cy, 48, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(255,255,255,.85)';
    x.beginPath(); x.arc(cx - 36, cy - 36, 19, 0, Math.PI * 2); x.fill();
    x.restore();

    // lid line
    x.strokeStyle = '#241a1c';
    x.lineWidth = 9;
    x.lineCap = 'round';
    x.beginPath();
    x.ellipse(cx, cy, lidW / 2, lidH / 2, 0, Math.PI, Math.PI * 2);
    x.stroke();

    // lashes along the upper lid
    var n = opts.after ? 34 : 19;
    for (var i = 0; i < n; i++) {
      var t = i / (n - 1);
      var ang = Math.PI + t * Math.PI;
      var bx = cx + Math.cos(ang) * (lidW / 2) * 0.97;
      var by = cy + Math.sin(ang) * (lidH / 2) * 0.97;

      // cat-eye: longest toward the outer (right) corner
      var base = opts.after ? 150 : 70;
      var len = base * (0.55 + 0.85 * Math.pow(t, 1.5));
      if (!opts.after) len *= 0.72 + 0.28 * Math.sin(i * 2.7); // uneven = grown out

      var lean = (t - 0.3) * 86;
      x.strokeStyle = '#14100f';
      x.lineWidth = opts.after ? 8 : 6;
      x.beginPath();
      x.moveTo(bx, by);
      x.quadraticCurveTo(bx + lean * 0.35, by - len * 0.62, bx + lean, by - len);
      x.stroke();
    }

    // lower lashes (subtle)
    for (var j = 0; j < 14; j++) {
      var t2 = j / 13;
      var a2 = t2 * Math.PI;
      var lx = cx - Math.cos(a2) * (lidW / 2) * 0.86;
      var ly = cy + Math.sin(a2) * (lidH / 2) * 0.92;
      x.strokeStyle = 'rgba(20,16,15,.75)';
      x.lineWidth = 3;
      x.beginPath();
      x.moveTo(lx, ly);
      x.lineTo(lx + 4, ly + (opts.after ? 20 : 13));
      x.stroke();
    }

    // brow
    x.strokeStyle = 'rgba(48,34,30,.9)';
    x.lineWidth = 44;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(cx - 360, cy - 330);
    x.quadraticCurveTo(cx - 30, cy - 420, cx + 350, cy - 300);
    x.stroke();

    return new Promise(function (res) {
      c.toBlob(function (b) { res(b); }, 'image/jpeg', 0.86);
    });
  }

  /* ------------------------------------------------------------- loader --- */
  Demo.isLoaded = function () {
    return Store.clients().some(function (c) { return c.demo; }) ||
           Store.clients({ archived: true }).some(function (c) { return c.demo; });
  };

  Demo.load = function () {
    if (Demo.isLoaded()) return Promise.resolve(null);

    var T = Store.todayISO();
    var A = Store.addDays;

    var c = Store.saveClient({
      demo: true,
      name: 'Demo Client',
      phone: '',
      instagram: '@demo.client',
      email: '',
      notes: 'This is a sample record so you can see how everything works. ' +
             'Remove it from Settings whenever you like — it will not affect your real clients.',
      health: {
        allergies: 'None known. Tolerated cyanoacrylate at patch test.',
        conditions: 'Slightly watery eyes in pollen season.',
        medications: 'None',
        contactLenses: true,
        sensitiveEyes: true,
        pregnant: false,
        updatedAt: new Date().toISOString()
      }
    });

    // a patch test that is valid and comfortably older than 48h
    Store.addPatchTest(c.id, {
      date: A(T, -45), product: 'Sky Glue S+', result: 'pass',
      notes: 'No redness or irritation at 48 hours.'
    });

    // signed consent, with photo permission so the share card is testable
    Store.addConsent(c.id, {
      date: A(T, -45),
      name: 'Demo Client',
      photoConsent: true,
      marketingConsent: true,
      signature: signatureDataURL(),
      text: Store.settings().consentText
    });

    // three sessions: a full set, then two fills with falling retention
    // dated so the most recent fill lands in the CURRENT month — otherwise the
    // Today stats read 0 sessions / €0 and the app looks dead on first open
    var sessions = [
      { d: -56, fill: false, set: 'Hybrid', style: 'Cat Eye', curl: 'D', dia: '0.07', fan: '3D',
        map: [8, 9, 10, 11, 12, 12, 13], ret: '', price: 65, mins: 135, batch: 'B-77',
        temp: 21, hum: 48, note: 'First set. Loved the outer-corner length — go a touch longer next time.' },
      { d: -31, fill: true, set: 'Hybrid', style: 'Cat Eye', curl: 'D', dia: '0.07', fan: '3D',
        map: [8, 9, 10, 11, 12, 13, 14], ret: 72, price: 38, mins: 75, batch: 'B-77',
        temp: 22, hum: 50, note: 'Good retention. Went 1mm longer on zones 6 and 7.' },
      { d: -10, fill: true, set: 'Hybrid', style: 'Cat Eye', curl: 'D', dia: '0.07', fan: '3D',
        map: [8, 9, 10, 11, 12, 13, 14], ret: 54, price: 38, mins: 80, batch: 'B-91',
        temp: 26, hum: 71, note: 'Retention down. Humid room and a new glue batch — watch this one.' }
    ];

    var lastRecId = null;
    sessions.forEach(function (s) {
      var r = Store.saveRecord({
        clientId: c.id,
        date: A(T, s.d),
        isFill: s.fill,
        setType: s.set, style: s.style, curl: s.curl, diameter: s.dia, fans: s.fan,
        map: { left: s.map.slice(), right: s.map.slice() },
        adhesive: { brand: 'Sky Glue S+', batch: s.batch, openedOn: A(T, s.d - 5) },
        room: { tempC: s.temp, humidity: s.hum },
        retentionPct: s.ret, durationMin: s.mins, price: s.price, notes: s.note
      });
      lastRecId = r.id;
    });

    // one appointment today, one upcoming fill
    Store.saveAppointment({
      clientId: c.id, date: T, time: '14:00',
      service: 'Fill — 3 week', durationMin: 75, price: 38, deposit: 10,
      status: 'booked', notes: 'Sample appointment.'
    });

    // before/after pair on the most recent session
    return Promise.all([eyeImage({ after: false }), eyeImage({ after: true })])
      .then(function (blobs) {
        return Promise.all([
          Store.addPhoto({ clientId: c.id, recordId: lastRecId, kind: 'before', blob: blobs[0] }),
          Store.addPhoto({ clientId: c.id, recordId: lastRecId, kind: 'after', blob: blobs[1] })
        ]);
      })
      .catch(function (e) {
        // photos are a bonus — never fail the whole demo load over them
        console.warn('[demo] photo generation failed', e);
        return null;
      })
      .then(function () { return c; });
  };

  Demo.remove = function () {
    var ids = Store.clients().concat(Store.clients({ archived: true }))
      .filter(function (c) { return c.demo; })
      .map(function (c) { return c.id; });
    return Promise.all(ids.map(function (id) { return Store.eraseClient(id); }))
      .then(function () { return ids.length; });
  };

  /* A scribbled signature so the consent record looks complete. */
  function signatureDataURL() {
    var c = document.createElement('canvas');
    c.width = 520; c.height = 200;
    var x = c.getContext('2d');
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, c.width, c.height);
    x.strokeStyle = '#1a1a1a';
    x.lineWidth = 3.4;
    x.lineCap = 'round';
    x.lineJoin = 'round';
    x.beginPath();
    x.moveTo(52, 132);
    x.bezierCurveTo(92, 52, 126, 156, 162, 104);
    x.bezierCurveTo(188, 66, 196, 148, 226, 120);
    x.bezierCurveTo(258, 90, 250, 150, 292, 112);
    x.bezierCurveTo(330, 78, 352, 142, 400, 96);
    x.stroke();
    x.lineWidth = 2.4;
    x.beginPath();
    x.moveTo(60, 152);
    x.quadraticCurveTo(230, 170, 418, 140);
    x.stroke();
    return c.toDataURL('image/png');
  }

  // exposed so the sample artwork can be inspected without going through
  // IndexedDB (which stalls under headless virtual time)
  Demo._eyeImage = eyeImage;

  global.Demo = Demo;
})(window);
