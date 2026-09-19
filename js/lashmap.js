/* ==========================================================================
   lashmap.js — the lash map builder.
   Seven zones per eye, inner -> outer, lengths in mm. The SVG redraws live so
   she can see the shape she's describing (a cat eye should LOOK like a cat eye).
   ========================================================================== */
(function (global) {
  'use strict';

  var ZONES = ['1', '2', '3', '4', '5', '6', '7'];

  // Classic mapping presets. Inner corner short -> outer long.
  var PRESETS = {
    'Natural':  [8, 9, 10, 11, 11, 10, 9],
    'Cat Eye':  [7, 8, 9, 10, 11, 12, 13],
    'Doll Eye': [9, 10, 11, 13, 13, 11, 9],
    'Wispy':    [8, 11, 9, 12, 10, 13, 10],
    'Kim K':    [8, 11, 8, 12, 9, 13, 10],
    'Squirrel': [8, 9, 10, 12, 12, 11, 10]
  };

  var MIN = 5, MAX = 18;

  function clampLen(v) {
    var n = parseFloat(v);
    if (isNaN(n)) return '';
    return Math.min(MAX, Math.max(MIN, n));
  }

  /**
   * Draw one eye. `side` is 'left'|'right' — the outer corner flips so the two
   * eyes mirror each other the way they do on an actual face.
   */
  function eyeSVG(lengths, side) {
    var W = 260, H = 96;
    var baseY = 74;
    var flip = side === 'left';

    var lashes = '';
    for (var i = 0; i < 7; i++) {
      var idx = flip ? 6 - i : i;
      var len = parseFloat(lengths[idx]);
      var x = 26 + i * ((W - 52) / 6);
      // no value yet -> faint stub so the zone is still visibly "there"
      var h = isNaN(len) ? 8 : ((len - MIN) / (MAX - MIN)) * 46 + 12;
      // fan outward from centre, and lean harder at the corners
      var lean = ((i - 3) / 3) * 13 * (flip ? -1 : 1);
      lashes += '<path class="lash" d="M' + x.toFixed(1) + ' ' + baseY +
        ' Q' + (x + lean * 0.4).toFixed(1) + ' ' + (baseY - h * 0.6).toFixed(1) +
        ' ' + (x + lean).toFixed(1) + ' ' + (baseY - h).toFixed(1) + '"' +
        (isNaN(len) ? ' opacity=".25"' : '') + '/>';
    }

    return '<svg class="eye-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" ' +
      'aria-label="' + side + ' eye lash map preview">' +
      lashes +
      '<path class="lid" d="M14 ' + baseY + ' Q' + (W / 2) + ' ' + (baseY + 16) + ' ' + (W - 14) + ' ' + baseY + '"/>' +
      '<text x="18" y="' + (H - 4) + '" font-size="9" fill="currentColor" opacity=".5">' +
        (flip ? 'outer' : 'inner') + '</text>' +
      '<text x="' + (W - 18) + '" y="' + (H - 4) + '" font-size="9" text-anchor="end" fill="currentColor" opacity=".5">' +
        (flip ? 'inner' : 'outer') + '</text>' +
    '</svg>';
  }

  function zoneInputs(side, lengths) {
    var h = '<div class="zones">';
    ZONES.forEach(function (z, i) {
      var id = 'z-' + side + '-' + i;
      h += '<div class="zone">' +
        '<label for="' + id + '">' + z + '</label>' +
        '<input id="' + id + '" type="number" inputmode="decimal" step="0.5" ' +
        'min="' + MIN + '" max="' + MAX + '" data-side="' + side + '" data-i="' + i + '" ' +
        'aria-label="' + side + ' eye zone ' + z + ' length in millimetres" ' +
        'value="' + (lengths[i] != null ? lengths[i] : '') + '">' +
        '</div>';
    });
    return h + '</div>';
  }

  var LashMap = {
    PRESETS: PRESETS,
    ZONES: ZONES,

    /** Render the builder into `host`. `map` is {left:[],right:[]}. */
    mount: function (host, map, onChange) {
      map = map || {};
      map.left = (map.left || []).slice(0, 7);
      map.right = (map.right || []).slice(0, 7);
      while (map.left.length < 7) map.left.push('');
      while (map.right.length < 7) map.right.push('');

      function paint() {
        host.querySelector('[data-eye="left"]').innerHTML =
          '<div class="eye-label">Left eye</div>' + eyeSVG(map.left, 'left') + zoneInputs('left', map.left);
        host.querySelector('[data-eye="right"]').innerHTML =
          '<div class="eye-label">Right eye</div>' + eyeSVG(map.right, 'right') + zoneInputs('right', map.right);
      }

      host.innerHTML =
        '<div class="lashmap">' +
          '<div class="row-between" style="margin-bottom:12px">' +
            '<span class="eyebrow">Lash map · mm</span>' +
            '<span class="help" style="font-size:.75rem">inner → outer</span>' +
          '</div>' +
          '<div data-eye="left" style="margin-bottom:16px"></div>' +
          '<div data-eye="right"></div>' +
          '<div class="map-actions">' +
            '<button class="btn btn-ghost btn-sm" type="button" data-mirror>' +
              UI.icon('arrows') + 'Mirror L→R</button>' +
            '<button class="btn btn-ghost btn-sm" type="button" data-clear>Clear</button>' +
          '</div>' +
          '<div style="margin-top:12px">' +
            '<span class="eyebrow" style="display:block;margin-bottom:8px">Start from a style</span>' +
            '<div class="chips">' +
              Object.keys(PRESETS).map(function (p) {
                return '<button type="button" class="chip" data-preset="' + UI.esc(p) + '">' + UI.esc(p) + '</button>';
              }).join('') +
            '</div>' +
          '</div>' +
        '</div>';

      paint();

      host.addEventListener('input', function (e) {
        var i = e.target.closest('input[data-side]');
        if (!i) return;
        var side = i.dataset.side, idx = Number(i.dataset.i);
        map[side][idx] = i.value === '' ? '' : i.value;
        // repaint only the SVG so we never steal focus from the input she's typing in
        var wrap = host.querySelector('[data-eye="' + side + '"]');
        var old = wrap.querySelector('svg');
        var tmp = document.createElement('div');
        tmp.innerHTML = eyeSVG(map[side], side);
        old.replaceWith(tmp.firstChild);
        if (onChange) onChange(map);
      });

      host.addEventListener('blur', function (e) {
        var i = e.target.closest('input[data-side]');
        if (!i || i.value === '') return;
        var c = clampLen(i.value);
        if (String(c) !== i.value) { i.value = c; map[i.dataset.side][Number(i.dataset.i)] = c; }
      }, true);

      host.addEventListener('click', function (e) {
        var p = e.target.closest('[data-preset]');
        if (p) {
          var vals = PRESETS[p.dataset.preset];
          map.left = vals.slice();
          map.right = vals.slice();
          paint();
          host.querySelectorAll('[data-preset]').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
          p.setAttribute('aria-pressed', 'true');
          if (onChange) onChange(map);
          return;
        }
        if (e.target.closest('[data-mirror]')) {
          map.right = map.left.slice();
          paint();
          UI.toast('Left map copied to right', 'ok');
          if (onChange) onChange(map);
          return;
        }
        if (e.target.closest('[data-clear]')) {
          map.left = ['', '', '', '', '', '', ''];
          map.right = ['', '', '', '', '', '', ''];
          paint();
          if (onChange) onChange(map);
        }
      });

      return { map: map, repaint: paint };
    },

    /** Compact read-only view for the record list / client history. */
    summary: function (map) {
      if (!map) return '—';
      var l = (map.left || []).filter(Boolean);
      var r = (map.right || []).filter(Boolean);
      if (!l.length && !r.length) return '—';
      var all = l.concat(r).map(Number);
      return Math.min.apply(null, all) + '–' + Math.max.apply(null, all) + 'mm';
    },

    /** Read-only preview used on a saved record. */
    preview: function (map) {
      if (!map || (!(map.left || []).filter(Boolean).length && !(map.right || []).filter(Boolean).length)) {
        return '<p class="help">No map recorded.</p>';
      }
      return '<div class="lashmap">' +
        '<div class="eye-label">Left</div>' + eyeSVG(map.left || [], 'left') +
        '<div class="row" style="gap:4px;margin-bottom:12px">' +
          (map.left || []).map(function (v) {
            return '<span class="num" style="flex:1;text-align:center;font-size:.75rem;color:var(--primary)">' + (v || '–') + '</span>';
          }).join('') +
        '</div>' +
        '<div class="eye-label">Right</div>' + eyeSVG(map.right || [], 'right') +
        '<div class="row" style="gap:4px">' +
          (map.right || []).map(function (v) {
            return '<span class="num" style="flex:1;text-align:center;font-size:.75rem;color:var(--primary)">' + (v || '–') + '</span>';
          }).join('') +
        '</div>' +
      '</div>';
    }
  };

  global.LashMap = LashMap;
})(window);
