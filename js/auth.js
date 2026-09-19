/* ==========================================================================
   auth.js — passcode lock with "keep me signed in".

   WHAT THIS DOES: stops anyone who picks up the iPad from reading client
   health records. That is the realistic threat in a studio.

   WHAT IT DOES NOT DO: it is a lock screen, not encryption. The records sit in
   localStorage/IndexedDB and someone with the unlocked device and developer
   tools could still read them. The real protections are the iPad's own
   passcode/Face ID and not lending the device out. The UI says this plainly —
   it must never imply more safety than it gives.

   The passcode is stored salted-and-hashed, never in plain text.
   ========================================================================== */
(function (global) {
  'use strict';

  var Auth = {};
  var SESSION_KEY = 'shanikwanne.session';

  /* ------------------------------------------------------------- hashing --- */
  function randomSalt() {
    var a = new Uint8Array(16);
    if (global.crypto && global.crypto.getRandomValues) global.crypto.getRandomValues(a);
    else for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    return Array.prototype.map.call(a, function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
  }

  function toHex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
  }

  /**
   * crypto.subtle only exists in a secure context (https / localhost). Served
   * over plain http on the tailnet it is undefined, so we need a fallback.
   * The fallback is weaker, but this is a device lock either way — see the
   * header note. Iterated to make casual guessing slow.
   */
  function weakHash(str) {
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var r = 0; r < 5000; r++) {
      for (var i = 0; i < str.length; i++) {
        h1 ^= str.charCodeAt(i);
        h1 = (h1 * 0x01000193) >>> 0;
        h2 = ((h2 << 5) - h2 + str.charCodeAt(i) + r) >>> 0;
      }
    }
    return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
  }

  function hash(passcode, salt) {
    var material = salt + '::' + passcode + '::shanikwanne';
    if (global.crypto && global.crypto.subtle && global.crypto.subtle.digest) {
      var bytes = new TextEncoder().encode(material);
      return global.crypto.subtle.digest('SHA-256', bytes)
        .then(function (buf) { return 'sha256:' + toHex(buf); })
        .catch(function () { return 'weak:' + weakHash(material); });
    }
    return Promise.resolve('weak:' + weakHash(material));
  }

  Auth.isStrongHashing = function () {
    return !!(global.crypto && global.crypto.subtle && global.crypto.subtle.digest);
  };

  /* --------------------------------------------------------------- state --- */
  function cfg() {
    var s = Store.settings();
    return s.auth || null;
  }

  Auth.isConfigured = function () {
    var a = cfg();
    return !!(a && a.hash);
  };

  /** Has she asked to stay signed in on this device? */
  Auth.remembered = function () {
    var a = cfg();
    if (!a || !a.remember) return false;
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return false;
      var sess = JSON.parse(raw);
      if (sess.token !== a.token) return false;
      // auto-lock window
      var mins = a.autoLockMin == null ? 0 : Number(a.autoLockMin);
      if (mins > 0 && sess.at && (Date.now() - sess.at) > mins * 60000) return false;
      return true;
    } catch (e) { return false; }
  };

  Auth.touch = function () {
    var a = cfg();
    if (!a || !a.remember) return;
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ token: a.token, at: Date.now() }));
    } catch (e) {}
  };

  Auth.signOut = function () {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  };

  /* --------------------------------------------------------------- setup --- */
  Auth.setup = function (passcode, remember, autoLockMin) {
    var salt = randomSalt();
    return hash(passcode, salt).then(function (h) {
      var token = randomSalt();
      Store.saveSettings({
        auth: {
          salt: salt, hash: h, token: token,
          remember: !!remember,
          autoLockMin: autoLockMin == null ? 15 : Number(autoLockMin)
        },
        // retire the old plaintext PIN fields
        pinEnabled: false, pin: ''
      });
      if (remember) Auth.touch(); else Auth.signOut();
      return true;
    });
  };

  Auth.verify = function (passcode) {
    var a = cfg();
    if (!a || !a.hash) return Promise.resolve(false);
    return hash(passcode, a.salt).then(function (h) { return h === a.hash; });
  };

  Auth.unlock = function (passcode, remember) {
    return Auth.verify(passcode).then(function (okp) {
      if (!okp) return false;
      var a = cfg();
      if (remember != null && !!remember !== !!a.remember) {
        a.remember = !!remember;
        Store.saveSettings({ auth: a });
      }
      if (cfg().remember) Auth.touch(); else Auth.signOut();
      return true;
    });
  };

  Auth.change = function (oldPass, newPass) {
    return Auth.verify(oldPass).then(function (okp) {
      if (!okp) return false;
      var a = cfg();
      return Auth.setup(newPass, a.remember, a.autoLockMin).then(function () { return true; });
    });
  };

  Auth.disable = function (passcode) {
    return Auth.verify(passcode).then(function (okp) {
      if (!okp) return false;
      Store.saveSettings({ auth: null });
      Auth.signOut();
      return true;
    });
  };

  Auth.setAutoLock = function (mins) {
    var a = cfg();
    if (!a) return false;
    a.autoLockMin = Number(mins);
    Store.saveSettings({ auth: a });
    return true;
  };

  /* ----------------------------------------------------------- migration --- */
  /** Convert an old plaintext PIN to a salted hash, once. */
  Auth.migrate = function () {
    var s = Store.settings();
    if (s.auth && s.auth.hash) return Promise.resolve(false);
    if (!s.pinEnabled || !s.pin) return Promise.resolve(false);
    return Auth.setup(String(s.pin), true, 15).then(function () {
      console.info('[auth] migrated plaintext PIN to a salted hash');
      return true;
    });
  };

  global.Auth = Auth;
})(window);
