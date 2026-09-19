/* ==========================================================================
   photos.js — capture, downscale, compare, share card.
   Photos of a client's face are personal data: they never leave the device
   unless SHE explicitly taps Share, and only if the client ticked photo consent.
   ========================================================================== */
(function (global) {
  'use strict';

  var MAX_EDGE = 1600;   // plenty for before/after, keeps IndexedDB sane
  var QUALITY = 0.82;

  var Photos = {};
  var urlCache = {};     // id -> objectURL, revoked on screen change

  /* ------------------------------------------------------------ downscale */
  function downscale(file) {
    return new Promise(function (res, rej) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, MAX_EDGE / Math.max(w, h));
        var cw = Math.round(w * scale), ch = Math.round(h * scale);
        var c = document.createElement('canvas');
        c.width = cw; c.height = ch;
        var ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, cw, ch);
        c.toBlob(function (blob) {
          if (blob) res(blob); else rej(new Error('Could not process that image.'));
        }, 'image/jpeg', QUALITY);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        rej(new Error('That file is not a readable image.'));
      };
      img.src = url;
    });
  }
  Photos.downscale = downscale;

  /* -------------------------------------------------------------- capture */
  /**
   * Opens the camera (or library) and stores the result.
   * iOS honours `capture` only on iPhone; iPad falls back to the picker, which
   * is fine — she often shoots on the phone and imports on the iPad.
   */
  Photos.capture = function (opts) {
    return new Promise(function (res) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      if (opts.camera) input.setAttribute('capture', 'environment');
      input.multiple = !!opts.multiple;
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      document.body.appendChild(input);

      input.addEventListener('change', function () {
        var files = Array.prototype.slice.call(input.files || []);
        input.remove();
        if (!files.length) return res([]);

        var close = UI.toast('Processing ' + files.length + ' photo' + (files.length > 1 ? 's' : '') + '…');
        Promise.all(files.map(function (f) {
          return downscale(f).then(function (blob) {
            return Store.addPhoto({
              clientId: opts.clientId,
              recordId: opts.recordId,
              kind: opts.kind,
              blob: blob
            });
          });
        })).then(function (saved) {
          close();
          UI.toast('Saved ' + saved.length + ' photo' + (saved.length > 1 ? 's' : ''), 'ok');
          res(saved);
        }).catch(function (e) {
          close();
          UI.toast(e.message || 'Could not save photo', 'err');
          res([]);
        });
      });

      // iOS fires no event if the sheet is cancelled — clean up on refocus
      window.addEventListener('focus', function cleanup() {
        setTimeout(function () {
          if (document.body.contains(input) && !(input.files || []).length) {
            input.remove();
            res([]);
          }
          window.removeEventListener('focus', cleanup);
        }, 700);
      });

      input.click();
    });
  };

  /* ----------------------------------------------------------------- urls */
  Photos.url = function (photo) {
    if (!urlCache[photo.id]) urlCache[photo.id] = URL.createObjectURL(photo.blob);
    return urlCache[photo.id];
  };
  Photos.releaseAll = function () {
    Object.keys(urlCache).forEach(function (k) { URL.revokeObjectURL(urlCache[k]); });
    urlCache = {};
  };

  /* -------------------------------------------------------- compare slide */
  /**
   * Before/after drag comparison. Pointer events cover touch + Apple Pencil +
   * mouse in one path. Keyboard-accessible via arrow keys (it's a slider).
   */
  Photos.compare = function (host, beforeUrl, afterUrl) {
    host.innerHTML =
      '<div class="compare" tabindex="0" role="slider" aria-label="Before and after comparison" ' +
           'aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">' +
        '<img src="' + beforeUrl + '" alt="Before treatment">' +
        '<div class="after-wrap"><img src="' + afterUrl + '" alt="After treatment"></div>' +
        '<span class="tag l">Before</span><span class="tag r">After</span>' +
        '<div class="handle"><span class="knob">' + UI.icon('arrows') + '</span></div>' +
      '</div>';

    var box = host.querySelector('.compare');
    var wrap = box.querySelector('.after-wrap');
    var handle = box.querySelector('.handle');
    var pct = 50;

    function set(p) {
      pct = Math.max(0, Math.min(100, p));
      wrap.style.clipPath = 'inset(0 0 0 ' + pct + '%)';
      handle.style.left = pct + '%';
      box.setAttribute('aria-valuenow', Math.round(pct));
    }
    set(50);

    function fromEvent(e) {
      var r = box.getBoundingClientRect();
      set(((e.clientX - r.left) / r.width) * 100);
    }

    var dragging = false;
    box.addEventListener('pointerdown', function (e) {
      dragging = true;
      box.setPointerCapture(e.pointerId);
      fromEvent(e);
    });
    box.addEventListener('pointermove', function (e) { if (dragging) fromEvent(e); });
    box.addEventListener('pointerup', function (e) {
      dragging = false;
      try { box.releasePointerCapture(e.pointerId); } catch (_) {}
    });
    box.addEventListener('pointercancel', function () { dragging = false; });
    box.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { set(pct - 4); e.preventDefault(); }
      if (e.key === 'ArrowRight') { set(pct + 4); e.preventDefault(); }
      if (e.key === 'Home') { set(0); e.preventDefault(); }
      if (e.key === 'End') { set(100); e.preventDefault(); }
    });

    return { set: set };
  };

  /* ---------------------------------------------------------- share card */
  /**
   * Builds a 1080x1920 before/after card for Reels/TikTok/Stories.
   * Gated on the client's photoConsent — see app.js.
   */
  Photos.shareCard = function (beforeBlob, afterBlob, meta) {
    return Promise.all([blobImg(beforeBlob), blobImg(afterBlob)]).then(function (imgs) {
      var W = 1080, H = 1920;
      var c = document.createElement('canvas');
      c.width = W; c.height = H;
      var x = c.getContext('2d');

      // Deliberately dark in BOTH app themes: this is a branded asset for
      // Reels/TikTok, where a dark card reads as premium and matches the feed.
      // It is an export, not app chrome, so it does not follow --bg.
      x.fillStyle = '#140F16';
      x.fillRect(0, 0, W, H);

      var padT = 210, gap = 8;
      var paneH = Math.round((H - padT - 300 - gap) / 2);

      drawCover(x, imgs[0], 0, padT, W, paneH);
      drawCover(x, imgs[1], 0, padT + paneH + gap, W, paneH);

      // labels
      function pill(text, cx, cy) {
        x.font = '700 34px Manrope, system-ui, sans-serif';
        var w = x.measureText(text).width + 52;
        x.fillStyle = 'rgba(10,6,12,.72)';
        roundRect(x, cx, cy, w, 60, 30);
        x.fill();
        x.fillStyle = '#F6EDF4';
        x.textBaseline = 'middle';
        x.fillText(text, cx + 26, cy + 31);
      }
      pill('BEFORE', 36, padT + 30);
      pill('AFTER', 36, padT + paneH + gap + 30);

      // header
      x.textAlign = 'center';
      x.fillStyle = '#F0A5C8';
      x.font = '600 66px Fraunces, Georgia, serif';
      x.fillText(meta.studio || 'Shanikwanne Lashes', W / 2, 108);

      x.fillStyle = '#A2919F';
      x.font = '600 32px Manrope, system-ui, sans-serif';
      x.fillText((meta.setType || '') + (meta.style ? ' · ' + meta.style : ''), W / 2, 162);

      // footer
      var fy = H - 190;
      x.fillStyle = '#C9B8C6';
      x.font = '500 34px Manrope, system-ui, sans-serif';
      if (meta.detail) x.fillText(meta.detail, W / 2, fy);
      if (meta.handle) {
        x.fillStyle = '#C4A9F5';
        x.font = '700 38px Manrope, system-ui, sans-serif';
        x.fillText(meta.handle, W / 2, fy + 58);
      }

      return new Promise(function (res) {
        c.toBlob(function (b) { res(b); }, 'image/jpeg', 0.9);
      });
    });
  };

  Photos.share = function (blob, filename, text) {
    var file = new File([blob], filename, { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file], text: text || '' })
        .then(function () { return 'shared'; })
        .catch(function (e) {
          if (e && e.name === 'AbortError') return 'cancelled';
          return download(blob, filename);
        });
    }
    return Promise.resolve(download(blob, filename));
  };

  function download(blob, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    return 'downloaded';
  }
  Photos.download = download;

  /* -------------------------------------------------------------- helpers */
  function blobImg(blob) {
    return new Promise(function (res, rej) {
      var img = new Image();
      var u = URL.createObjectURL(blob);
      img.onload = function () { URL.revokeObjectURL(u); res(img); };
      img.onerror = function () { URL.revokeObjectURL(u); rej(new Error('bad image')); };
      img.src = u;
    });
  }

  function drawCover(ctx, img, dx, dy, dw, dh) {
    var ir = img.width / img.height, dr = dw / dh;
    var sw, sh, sx, sy;
    if (ir > dr) { sh = img.height; sw = sh * dr; sx = (img.width - sw) / 2; sy = 0; }
    else { sw = img.width; sh = sw / dr; sx = 0; sy = (img.height - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  global.Photos = Photos;
})(window);
