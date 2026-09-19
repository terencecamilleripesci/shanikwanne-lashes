/* ==========================================================================
   sketch.js — freehand lash mapping for iPad / Apple Pencil.

   Typing seven numbers per eye is fine at a desk and useless mid-appointment.
   This gives her a drawable eye template she can scribble on with the Pencil,
   saved against the session alongside (not instead of) the numeric map.

   Pencil specifics that matter:
   - pressure drives stroke width (Apple Pencil reports 0..1; mouse reports 0.5)
   - palm rejection: once a pen is seen, touch input is ignored for drawing
   - touch-action:none so the page never scrolls out from under her hand
   ========================================================================== */
(function (global) {
  'use strict';

  var Sketch = {};

  /* Ink has to suit the paper: pale rose on a white template is unreadable,
     deep rose on a near-black one is equally bad. Pick per theme. */
  function palette() {
    return UI.isDark()
      ? [
          { id: 'rose', v: '#F0A5C8', label: 'Rose' },
          { id: 'lav', v: '#C4A9F5', label: 'Lavender' },
          { id: 'ink', v: '#F6EDF4', label: 'White' },
          { id: 'gold', v: '#F5C77E', label: 'Gold' }
        ]
      : [
          { id: 'rose', v: '#A8336A', label: 'Rose' },
          { id: 'lav', v: '#6B45A6', label: 'Lavender' },
          { id: 'ink', v: '#2B1F29', label: 'Black' },
          { id: 'gold', v: '#8A5A07', label: 'Gold' }
        ];
  }
  var WIDTHS = [
    { id: 'fine', v: 2, label: 'Fine' },
    { id: 'med', v: 4, label: 'Medium' },
    { id: 'bold', v: 8, label: 'Bold' }
  ];

  /* ------------------------------------------------- background template --- */
  /** Two eye outlines + zone guides, drawn faintly so her strokes read on top. */
  function drawTemplate(ctx, W, H) {
    ctx.save();
    ctx.clearRect(0, 0, W, H);

    // theme-aware paper and guide ink (canvas can't read CSS variables)
    var paper = UI.token('surface') || (UI.isDark() ? '#1E1722' : '#FFFFFF');
    var guide = UI.token('ink-2') || (UI.isDark() ? '#C9B8C6' : '#554653');
    var label = UI.token('muted') || (UI.isDark() ? '#A2919F' : '#6E5D6B');
    var brand = UI.token('primary') || (UI.isDark() ? '#F0A5C8' : '#A8336A');
    var accent = UI.token('accent') || (UI.isDark() ? '#C4A9F5' : '#6B45A6');

    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, W, H);

    var eyeW = W * 0.82;
    var eyeH = H * 0.20;

    [0.30, 0.74].forEach(function (yFrac, idx) {
      var cx = W / 2;
      var cy = H * yFrac;

      // lid
      ctx.strokeStyle = guide;
      ctx.globalAlpha = 0.42;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, eyeW / 2, eyeH / 2, 0, 0, Math.PI * 2);
      ctx.stroke();

      // iris hint
      ctx.beginPath();
      ctx.arc(cx, cy, eyeH * 0.30, 0, Math.PI * 2);
      ctx.globalAlpha = 0.24;
      ctx.stroke();

      // seven zone guides along the upper lid
      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = brand;
      ctx.globalAlpha = 0.30;
      ctx.lineWidth = 1;
      for (var z = 0; z < 7; z++) {
        var t = z / 6;
        var ang = Math.PI + t * Math.PI;
        var px = cx + Math.cos(ang) * (eyeW / 2);
        var py = cy + Math.sin(ang) * (eyeH / 2);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px, py - eyeH * 0.95);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // zone numbers + side label
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = label;
      ctx.font = '600 11px Manrope, system-ui, sans-serif';
      ctx.textAlign = 'center';
      for (var z2 = 0; z2 < 7; z2++) {
        var t2 = z2 / 6;
        var a2 = Math.PI + t2 * Math.PI;
        var lx = cx + Math.cos(a2) * (eyeW / 2);
        var ly = cy + Math.sin(a2) * (eyeH / 2);
        ctx.fillText(String(z2 + 1), lx, ly - eyeH * 1.02);
      }
      // labels sit below the lid so they never collide with the zone numbers
      ctx.textAlign = 'left';
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = accent;
      ctx.font = '700 12px Manrope, system-ui, sans-serif';
      ctx.fillText(idx === 0 ? 'LEFT EYE' : 'RIGHT EYE', W * 0.03, cy + eyeH * 0.72 + 14);

      ctx.globalAlpha = 0.65;
      ctx.fillStyle = label;
      ctx.font = '600 10px Manrope, system-ui, sans-serif';
      ctx.fillText('inner', W * 0.03, cy + eyeH * 0.72 + 30);
      ctx.textAlign = 'right';
      ctx.fillText('outer', W * 0.97, cy + eyeH * 0.72 + 30);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    });

    ctx.restore();
  }
  Sketch.drawTemplate = drawTemplate;

  /* --------------------------------------------------------------- editor --- */
  /**
   * Sketch.open({ recordId, clientId, existingBlob, onSave })
   * Full-height sheet with the template, a toolbar and undo.
   */
  Sketch.open = function (opts) {
    var COLORS = palette();
    var colour = COLORS[0].v;
    var width = WIDTHS[1].v;
    var erasing = false;
    var strokes = [];        // each: {colour,width,erase,pts:[{x,y,p}]}
    var redoStack = [];
    var penSeen = false;

    var body =
      '<p class="help" style="margin:-4px 0 12px">Draw straight onto the template with your ' +
      'Apple Pencil or a finger. Zone numbers run inner → outer.</p>' +
      '<div class="sketch-wrap">' +
        '<canvas data-sk class="sketch-canvas" aria-label="Lash map drawing area"></canvas>' +
      '</div>' +
      '<div class="sketch-tools">' +
        '<div class="chips" data-colours>' +
          COLORS.map(function (c, i) {
            return '<button type="button" class="swatch' + (i === 0 ? ' on' : '') + '" data-col="' + c.v + '" ' +
              'style="background:' + c.v + '" aria-label="' + c.label + '" aria-pressed="' + (i === 0) + '"></button>';
          }).join('') +
        '</div>' +
        '<div class="chips" data-widths>' +
          WIDTHS.map(function (w, i) {
            return '<button type="button" class="chip" data-w="' + w.v + '" aria-pressed="' + (i === 1) + '">' +
              w.label + '</button>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<div class="row" style="gap:8px;margin-top:12px;flex-wrap:wrap">' +
        '<button class="btn btn-ghost btn-sm" data-erase type="button" aria-pressed="false">Eraser</button>' +
        '<button class="btn btn-ghost btn-sm" data-undo type="button">Undo</button>' +
        '<button class="btn btn-ghost btn-sm" data-redo type="button">Redo</button>' +
        '<button class="btn btn-quiet btn-sm" data-clear type="button">Clear</button>' +
      '</div>' +
      '<button class="btn btn-primary btn-block" data-save type="button" style="margin-top:16px">Save drawing</button>' +
      (opts.existingBlob ? '<button class="btn btn-quiet btn-block btn-sm" data-remove type="button" ' +
        'style="margin-top:8px">Delete this drawing</button>' : '');

    var api = UI.sheet({
      title: 'Draw the lash map',
      body: body,
      dirty: function () { return strokes.length > 0; },
      onMount: function (el, sheetApi) {
        var canvas = el.querySelector('[data-sk]');
        var ctx = canvas.getContext('2d');
        var dpr = Math.min(global.devicePixelRatio || 1, 2);
        var CW = 0, CH = 0;
        var bgImg = null;

        function layout() {
          var r = canvas.getBoundingClientRect();
          CW = r.width; CH = r.height;
          canvas.width = Math.round(CW * dpr);
          canvas.height = Math.round(CH * dpr);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          repaint();
        }

        function repaint() {
          if (bgImg) {
            ctx.save();
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, CW, CH);
            ctx.drawImage(bgImg, 0, 0, CW, CH);
            ctx.restore();
          } else {
            drawTemplate(ctx, CW, CH);
          }
          strokes.forEach(paintStroke);
        }

        function paintStroke(s) {
          if (s.pts.length < 2) return;
          ctx.save();
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          if (s.erase) {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.strokeStyle = 'rgba(0,0,0,1)';
          } else {
            ctx.strokeStyle = s.colour;
          }
          for (var i = 1; i < s.pts.length; i++) {
            var a = s.pts[i - 1], b = s.pts[i];
            ctx.lineWidth = s.width * (0.45 + (b.p || 0.5) * 1.1);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
          ctx.restore();
        }

        // restore a previously saved drawing as the background layer
        if (opts.existingBlob) {
          var img = new Image();
          var url = URL.createObjectURL(opts.existingBlob);
          img.onload = function () {
            URL.revokeObjectURL(url);
            bgImg = img;
            repaint();
          };
          img.onerror = function () { URL.revokeObjectURL(url); };
          img.src = url;
        }

        setTimeout(layout, 60);
        global.addEventListener('resize', layout);

        /* ------------------------------ drawing ------------------------------ */
        var drawing = false, cur = null;

        function pos(e) {
          var r = canvas.getBoundingClientRect();
          return {
            x: e.clientX - r.left,
            y: e.clientY - r.top,
            // Pencil gives real pressure; mouse/touch report 0 or 0.5
            p: e.pressure && e.pressure > 0 ? e.pressure : 0.5
          };
        }

        canvas.addEventListener('pointerdown', function (e) {
          if (e.pointerType === 'pen') penSeen = true;
          // palm rejection: once she's using the Pencil, ignore stray touches
          if (penSeen && e.pointerType === 'touch') return;
          e.preventDefault();
          drawing = true;
          // must not be fatal: if capture fails the stroke should still draw
          try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
          cur = { colour: colour, width: width, erase: erasing, pts: [pos(e)] };
          redoStack = [];
        });

        canvas.addEventListener('pointermove', function (e) {
          if (!drawing || !cur) return;
          if (penSeen && e.pointerType === 'touch') return;
          e.preventDefault();
          // Coalesced events keep Pencil strokes smooth at high report rates —
          // but the list can come back EMPTY, and then the stroke silently never
          // draws. Always fall back to the event itself.
          var evts = [];
          if (e.getCoalescedEvents) {
            try { evts = e.getCoalescedEvents() || []; } catch (_) { evts = []; }
          }
          if (!evts.length) evts = [e];
          for (var i = 0; i < evts.length; i++) cur.pts.push(pos(evts[i]));
          repaint();
          paintStroke(cur);
        });

        function endStroke(e) {
          if (!drawing || !cur) return;
          drawing = false;
          try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
          if (cur.pts.length > 1) strokes.push(cur);
          cur = null;
          repaint();
        }
        canvas.addEventListener('pointerup', endStroke);
        canvas.addEventListener('pointercancel', endStroke);
        canvas.addEventListener('pointerleave', endStroke);

        /* ------------------------------ toolbar ------------------------------ */
        el.querySelector('[data-colours]').addEventListener('click', function (e) {
          var b = e.target.closest('[data-col]');
          if (!b) return;
          colour = b.dataset.col;
          erasing = false;
          el.querySelector('[data-erase]').setAttribute('aria-pressed', 'false');
          el.querySelectorAll('[data-col]').forEach(function (s) {
            s.classList.toggle('on', s === b);
            s.setAttribute('aria-pressed', String(s === b));
          });
        });

        el.querySelector('[data-widths]').addEventListener('click', function (e) {
          var b = e.target.closest('[data-w]');
          if (!b) return;
          width = Number(b.dataset.w);
          el.querySelectorAll('[data-w]').forEach(function (s) {
            s.setAttribute('aria-pressed', String(s === b));
          });
        });

        el.querySelector('[data-erase]').addEventListener('click', function () {
          erasing = !erasing;
          this.setAttribute('aria-pressed', String(erasing));
        });

        el.querySelector('[data-undo]').addEventListener('click', function () {
          if (!strokes.length) return UI.toast('Nothing to undo');
          redoStack.push(strokes.pop());
          repaint();
        });

        el.querySelector('[data-redo]').addEventListener('click', function () {
          if (!redoStack.length) return UI.toast('Nothing to redo');
          strokes.push(redoStack.pop());
          repaint();
        });

        el.querySelector('[data-clear]').addEventListener('click', function () {
          if (!strokes.length && !bgImg) return;
          UI.confirm({
            title: 'Clear the drawing?',
            message: 'Everything drawn on this template will be removed.',
            okLabel: 'Clear', danger: true,
            onOk: function () { strokes = []; redoStack = []; bgImg = null; repaint(); }
          });
        });

        var rm = el.querySelector('[data-remove]');
        if (rm) rm.addEventListener('click', function () {
          UI.confirm({
            title: 'Delete this drawing?',
            message: 'The saved lash map drawing for this session will be removed.',
            okLabel: 'Delete', danger: true,
            onOk: function () {
              sheetApi.close(true);
              if (opts.onDelete) opts.onDelete();
            }
          });
        });

        el.querySelector('[data-save]').addEventListener('click', function () {
          var btn = this;
          btn.setAttribute('aria-disabled', 'true');
          btn.innerHTML = '<span class="spin"></span>Saving…';
          // flatten onto an opaque background so it reads outside the app too
          var out = document.createElement('canvas');
          out.width = canvas.width; out.height = canvas.height;
          var octx = out.getContext('2d');
          octx.fillStyle = UI.token('surface') || (UI.isDark() ? '#1E1722' : '#FFFFFF');
          octx.fillRect(0, 0, out.width, out.height);
          octx.drawImage(canvas, 0, 0);
          out.toBlob(function (blob) {
            if (!blob) {
              btn.removeAttribute('aria-disabled');
              btn.textContent = 'Save drawing';
              return UI.toast('Could not save the drawing', 'err');
            }
            global.removeEventListener('resize', layout);
            sheetApi.close(true);
            opts.onSave(blob);
          }, 'image/png');
        });
      }
    });

    return api;
  };

  global.Sketch = Sketch;
})(window);
