/* V5 workbench: v4's bounded, overlapping local jobs with three revised tools:
   a layer-by-layer portrait print, a pencil that traces the real headline glyphs,
   and a mill whose tip bores holes and engraves the caption it is touching. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const hero = $('#workbench');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const controls = $('.build-controls'), skip = $('#skip-build'), replay = $('#replay-build');
  const readout = $('#build-readout'), status = $('#build-status');
  const ns = 'http://www.w3.org/2000/svg';
  const effects = [], titleLines = [$('#title-a'), $('#title-b')];
  let raf = 0, watchdog = 0, running = false, starting = false, epoch = 0, generation = 0, pageReplayPending = false;
  const clamp = x => Math.max(0, Math.min(1, x));
  const ease = x => x*x*(3-2*x);
  const smooth = x => { x = clamp(x); return x*x*x*(x*(x*6-15)+10); };
  const phase = (t, start, end) => clamp((t-start)/(end-start));
  // Position along a move with a trapezoidal velocity profile: accelerate, cruise, decelerate.
  function trap(u, a=.18) {
    u = clamp(u); const v = 1/(1-a);
    if (u < a) return v*u*u/(2*a);
    if (u > 1-a) return 1 - v*(1-u)*(1-u)/(2*a);
    return v*(u - a/2);
  }
  function svg(tag, attrs, parent, before) {
    const el = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([key,value]) => el.setAttribute(key,value));
    if (parent) before ? parent.insertBefore(el, before) : parent.append(el);
    return el;
  }
  const assembly = $('.assembly-svg'), defs = $('.assembly-svg defs'), tileGroup = $('#portrait-tiles');

  /* ---------- (1) Portrait printed bottom-to-top in accumulating layers ---------- */
  // The real photo is revealed only where the nozzle has already deposited a layer.
  // 24 layers over 7.5 s keeps per-frame nozzle travel below the nozzle's own width (no strobing).
  const P = {x0:62, x1:422, top:72, bottom:532, layers:24, start:3.0, end:10.5, dep:.86};
  P.h = (P.bottom-P.top)/P.layers; P.dur = (P.end-P.start)/P.layers;
  const printMask = svg('clipPath', {id:'print-mask'}, defs);
  const doneRect = svg('rect', {x:P.x0, y:P.bottom, width:P.x1-P.x0, height:0}, printMask);
  const frontRect = svg('rect', {x:P.x0, y:P.bottom, width:0, height:0}, printMask);
  svg('image', {href:'assets/portrait-1200.webp', x:62, y:72, width:360, height:460, preserveAspectRatio:'xMidYMid slice', 'clip-path':'url(#print-mask)'}, tileGroup);
  // Faint layer seams sit only on printed area, then relax away so the settled photo is untouched.
  const seams = svg('g', {'clip-path':'url(#print-mask)', stroke:'#f4f3ec', 'stroke-width':.6, fill:'none'}, tileGroup);
  for (let k = 1; k < P.layers; k++) svg('path', {d:`M${P.x0} ${(P.bottom-k*P.h).toFixed(2)}H${P.x1}`}, seams);
  const bead = svg('path', {fill:'none', stroke:'#e3b462', 'stroke-width':1.6, 'stroke-linecap':'round', d:'M0 0'}, tileGroup);
  const nozzleLabel = $('#nozzle text');
  nozzleLabel.setAttribute('text-anchor','middle');
  function printer(t) {
    if (t < P.start) { // curved travel in from above, landing on layer 1
      const u = ease(phase(t, P.start-.38, P.start));
      return {x:P.x0-46+46*u, y:P.bottom-P.h-70+70*u-Math.sin(u*Math.PI)*12, done:0, front:null, layer:1};
    }
    if (t >= P.end) { // already lifted 6 units at the end of the last layer: continue from there to the rail start
      const sy = P.top-6, u = ease(phase(t, P.end, 10.6));
      return {x:P.x0+(48-P.x0)*u, y:sy+(80-sy)*u-Math.sin(u*Math.PI)*16, done:P.layers, front:null, layer:P.layers};
    }
    const k = Math.min(P.layers-1, Math.floor((t-P.start)/P.dur));
    const u = (t-P.start)/P.dur - k, dir = k%2 === 0 ? 1 : -1;
    const top = P.bottom-(k+1)*P.h, sx = dir > 0 ? P.x0 : P.x1, ex = dir > 0 ? P.x1 : P.x0;
    if (u < P.dep) {
      const x = sx + (ex-sx)*trap(u/P.dep, .12);
      return {x, y:top, done:k, front:[Math.min(sx,x), top, Math.abs(x-sx)], dir, layer:k+1};
    }
    // Layer finished: brief dwell, small Z-hop, step up one layer height (last layer just lifts).
    const v = (u-P.dep)/(1-P.dep), w = phase(v, .2, 1);
    const rise = k === P.layers-1 ? 6*ease(v) : P.h*ease(w)+Math.sin(w*Math.PI)*3.5;
    return {x:ex, y:top-rise, done:k+1, front:null, layer:k+1};
  }

  function route(d) {
    const p = svg('path',{d,fill:'none',stroke:'none'},assembly);
    effects.push(p);
    return {path:p,length:p.getTotalLength()};
  }
  // Curved approaches and retreats; local working strokes have intentional rests.
  const sketch = route('M56 538 Q42 370 58 66 Q180 58 430 69 Q420 300 425 539 Q220 550 56 538 M56 538 Q180 540 250 536 Q300 532 330 536');
  const cad = route('M62 72 L80 54 H440 V514 L422 532 V72 H62 V532 H422 M422 72 L440 54');
  const rail = route('M48 80 V546 H420');
  const wire = route('M74 560 H142 L155 573 H278 L291 560 H348');
  function point(route,p) { return route.path.getPointAtLength(route.length*clamp(p)); }
  function tool(el,x,y,angle=0,opacity=1) {
    el.setAttribute('transform',`translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${angle.toFixed(2)})`);
    el.style.opacity=opacity;
  }
  function draw(el,p) { el.style.strokeDasharray='1'; el.style.strokeDashoffset=1-clamp(p); }
  // Round-capped dashes render a dot even at zero length; keep unstarted strokes fully hidden.
  function stroke(el,p) { draw(el,p); el.style.visibility = p > 0 ? 'visible' : 'hidden'; }
  function opacity(el,p) { el.style.opacity=clamp(p); }
  const pencil=$('#pencil'), cursor=$('#cad'), nozzle=$('#nozzle'), mill=$('#mill'), iron=$('#iron');
  const rough=$('.rough-frame'), cadFrame=$('.cad-frame'), dims=$('.dimension-lines');
  const printed=$('#printed-rail'), circuit=$('#circuit'), pads=$('#solder-pads');
  const mounts=[...$('#mounts').children];

  /* ---------- (3) Mill: contact-driven boring and engraving on the frame/caption ---------- */
  const millBody = $('#mill .mill-body'), millShadow = $('#mill .mill-shadow'), flutes = $('#mill .flutes');
  const millLabel = $('#mill text'), signature = $('.portrait-signature');
  const engraveMask = svg('mask', {id:'engrave-mask', maskUnits:'userSpaceOnUse', x:0, y:0, width:500, height:620, fill:'none', stroke:'#fff', 'stroke-linecap':'round', 'stroke-linejoin':'round'}, defs);
  const chipGroup = svg('g', {class:'tool chips', fill:'#7d878a'}, mill.parentNode, mill);
  const chips = Array.from({length:30}, () => ({el:svg('rect',{width:1.8,height:1,x:-.9,y:-.5},chipGroup), life:0}));
  const Z = 24, TOOL_R = 2, HOLE_R = 4, ENGRAVE_R = 1.3;
  engraveMask.setAttribute('stroke-width', ENGRAVE_R*2);
  let plan = null, chipClock = 0, emitAcc = 0, seed = 1;
  const rand = () => { seed = (seed*16807) % 2147483647; return (seed-1)/2147483646; };
  function buildMillPlan() {
    engraveMask.replaceChildren();
    const segs = [], holes = [], engr = [], start = {x:24, y:8, z:Z};
    let t = 6.85, cur = {...start};
    const push = (dur, kind, fn, extra={}) => { const s = {t0:t, t1:t+dur, kind, fn, ...extra}; segs.push(s); t += dur; cur = fn(1); return s; };
    const rapid = (x, y, z=Z, min=.14) => { const a = {...cur}, d = Math.hypot(x-a.x, y-a.y);
      push(min+d/1800, 'rapid', u => { const s = smooth(u); return {x:a.x+(x-a.x)*s, y:a.y+(y-a.y)*s, z:a.z+(z-a.z)*s+Math.sin(u*Math.PI)*Math.min(12,d*.04)}; }); };
    const plunge = (dur, z=0) => { const a = {...cur}; push(dur, 'plunge', u => ({x:a.x, y:a.y, z:a.z+(z-a.z)*(1-(1-u)*(1-u))})); };
    const retract = (dur, z=Z) => { const a = {...cur}; push(dur, 'retract', u => ({x:a.x, y:a.y, z:a.z+(z-a.z)*ease(u)})); };
    mounts.forEach(m => {
      const cx = +m.getAttribute('cx'), cy = +m.getAttribute('cy');
      rapid(cx, cy); plunge(.13);
      const dw = push(.08, 'dwell', () => ({x:cx, y:cy, z:0}));
      // Helical interpolation: the tool orbit grows from centre, so the bore widens under the tip.
      const bore = push(.4, 'bore', u => { const ro = (HOLE_R-TOOL_R)*smooth(u/.45), a = u*Math.PI*5;
        return {x:cx+ro*Math.cos(a), y:cy+ro*Math.sin(a), z:0}; });
      const last = {...cur};
      push(.06, 'center', u => ({x:last.x+(cx-last.x)*ease(u), y:last.y+(cy-last.y)*ease(u), z:0}));
      retract(.12);
      holes.push({el:m, contact:dw.t0, bore0:bore.t0, bore1:bore.t1});
    });
    // Engrave the existing caption word by word. The cutter follows a zig-zag raster across each glyph
    // cell; a mask stroke of the cutter's width follows exactly the same polyline, so a letter is
    // marked only where the cutter has actually swept (mask ∩ glyph ink). Lifts over each space.
    const text = signature.textContent, box = signature.getBBox();
    const ext = i => { try { return signature.getExtentOfChar(i); } catch { return null; } };
    const words = []; let word = null;
    for (let i = 0; i < text.length; i++) {
      const e = ext(i);
      if (/\s/.test(text[i]) || !e) { word = null; continue; }
      if (!word) words.push(word = []);
      word.push(e);
    }
    words.forEach((cells, wi) => {
      const pts = [];
      cells.forEach(e => {
        const y0 = e.y+ENGRAVE_R*.8, y1 = e.y+e.height-ENGRAVE_R*.8, n = Math.max(3, Math.ceil((e.width-1)/(ENGRAVE_R*1.25))+1);
        for (let j = 0; j < n; j++) pts.push([e.x+.5+(e.width-1)*j/(n-1), (pts.length%2) ? y1 : y0]);
      });
      const cum = [0]; for (let j = 1; j < pts.length; j++) cum.push(cum[j-1]+Math.hypot(pts[j][0]-pts[j-1][0], pts[j][1]-pts[j-1][1]));
      const poly = {pts, cum, len:cum.at(-1)};
      const path = svg('path', {d:'M'+pts.map(q => q[0].toFixed(2)+' '+q[1].toFixed(2)).join('L'), pathLength:1}, engraveMask);
      stroke(path, 0);
      if (wi === 0) rapid(pts[0][0], pts[0][1]); else rapid(pts[0][0], pts[0][1], 3.5, .04);
      plunge(wi === 0 ? .1 : .03);
      engr.push(push(Math.max(.1, poly.len/480), 'engrave', u => { const p = pointOn(poly, trap(u, .1)); return {x:p[0], y:p[1], z:0}; }, {path}));
      retract(wi === words.length-1 ? .14 : .03, wi === words.length-1 ? Z : 3.5);
    });
    const endAt = t; rapid(cur.x+70, cur.y-90, Z+10, .3);
    return {segs, holes, engr, endAt, box, start};
  }
  function millAt(t) {
    const segs = plan.segs;
    if (t < segs[0].t0) return {...plan.start, kind:'rapid'};
    for (const s of segs) if (t < s.t1) return {...s.fn(phase(t, s.t0, s.t1)), kind:s.kind};
    return {...segs[segs.length-1].fn(1), kind:'done'};
  }
  function chipsStep(t, tip, cutting) {
    const dt = Math.max(0, Math.min(.05, t-chipClock)); chipClock = t;
    if (cutting) { emitAcc += dt*60; while (emitAcc >= 1) { emitAcc--; const c = chips.find(c => c.life <= 0); if (!c) break;
      const a = rand()*Math.PI*2; Object.assign(c, {x:tip.x, y:tip.y, vx:Math.cos(a)*(50+rand()*70), vy:-(50+rand()*90), r:rand()*360, life:.45+rand()*.2}); } }
    chips.forEach(c => {
      if (c.life <= 0) { c.el.style.opacity = 0; return; }
      c.life -= dt; c.vy += 420*dt; c.x += c.vx*dt; c.y += c.vy*dt; c.r += 900*dt;
      c.el.setAttribute('transform', `translate(${c.x.toFixed(1)} ${c.y.toFixed(1)}) rotate(${c.r.toFixed(0)})`);
      c.el.style.opacity = clamp(c.life*2.4);
    });
  }

  /* ---------- (2) Headline: pencil traces the rendered glyph outlines ---------- */
  const titleWork = $('.title-work'), titleSvg = $('.title-draw'), strokeGroup = $('.title-strokes'), copyPencil = $('#copy-pencil');
  let title = null;
  // Rasterise one glyph with the headline's own computed font, then marching-squares its edge.
  function traceGlyph(ch, font, left, top, height, S) {
    const c = document.createElement('canvas'), ctx = c.getContext('2d', {willReadFrequently:true});
    ctx.font = font; const m = ctx.measureText(ch);
    const asc = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent, desc = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent;
    const pad = Math.ceil(height*.2);
    const W = Math.ceil((m.width+pad*2)*S), H = Math.ceil((asc+desc+pad*2)*S);
    c.width = W; c.height = H;
    ctx.scale(S, S); ctx.font = font; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#000';
    ctx.fillText(ch, pad, pad+asc);
    const raw = ctx.getImageData(0, 0, W, H).data, A = new Float32Array(W*H);
    for (let i = 0; i < W*H; i++) A[i] = raw[i*4+3]/255;
    const baseline = top + (height-(asc+desc))/2 + asc;   // content box centred in the range box
    const ox = left - pad, oy = baseline - asc - pad, iso = .5;
    // Alpha samples are pixel centres, so a sample at index (x,y) sits at (x+.5, y+.5) device px.
    const pt = id => { const k = id>>1, x = k%W + .5, y = ((k/W)|0) + .5;
      if (id & 1) { const a = A[k], b = A[k+W]; return [x/S+ox, (y+(iso-a)/((b-a)||1))/S+oy]; }
      const a = A[k], b = A[k+1]; return [(x+(iso-a)/((b-a)||1))/S+ox, y/S+oy]; };
    const segs = [], byEdge = new Map();
    const add = (e1, e2) => { const i = segs.length; segs.push([e1, e2]); [e1, e2].forEach(e => { const l = byEdge.get(e); l ? l.push(i) : byEdge.set(e, [i]); }); };
    for (let y = 0; y < H-1; y++) for (let x = 0; x < W-1; x++) {
      const k = y*W+x, tl = A[k], tr = A[k+1], br = A[k+W+1], bl = A[k+W];
      const code = (tl>=iso?8:0)|(tr>=iso?4:0)|(br>=iso?2:0)|(bl>=iso?1:0);
      if (code === 0 || code === 15) continue;
      const T = k*2, B = (k+W)*2, L = k*2+1, R = (k+1)*2+1, mid = (tl+tr+br+bl)/4 >= iso;
      switch (code) {
        case 1: case 14: add(L,B); break;   case 2: case 13: add(B,R); break;
        case 3: case 12: add(L,R); break;   case 4: case 11: add(T,R); break;
        case 6: case 9: add(T,B); break;    case 7: case 8: add(T,L); break;
        case 5: if (mid) { add(T,R); add(B,L); } else { add(T,L); add(B,R); } break;
        case 10: if (mid) { add(T,L); add(B,R); } else { add(T,R); add(B,L); } break;
      }
    }
    const used = new Uint8Array(segs.length), loops = [];
    for (let s0 = 0; s0 < segs.length; s0++) {
      if (used[s0]) continue;
      used[s0] = 1; const first = segs[s0][0]; let edge = segs[s0][1]; const ids = [first, edge];
      for (let guard = 0; guard < segs.length && edge !== first; guard++) {
        const nxt = (byEdge.get(edge)||[]).find(i => !used[i]); if (nxt === undefined) break;
        used[nxt] = 1; edge = segs[nxt][0] === edge ? segs[nxt][1] : segs[nxt][0]; ids.push(edge);
      }
      if (ids.length > 6) loops.push(simplify(ids.map(pt), .28));
    }
    return loops.map(p => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i+1)%p.length]; a += p[i][0]*q[1]-q[0]*p[i][1]; } return {p, area:a/2}; })
      .filter(l => Math.abs(l.area) > 1.5).sort((a,b) => Math.abs(b.area)-Math.abs(a.area))
      .map(({p, area}) => {
        if (area > 0) p = p.slice().reverse();        // trace counter-clockwise on screen
        if (p.length > 1 && Math.hypot(p[0][0]-p[p.length-1][0], p[0][1]-p[p.length-1][1]) < .01) p = p.slice(0,-1);
        let s = 0; p.forEach((q,i) => { if (q[1]+q[0]*.35 < p[s][1]+p[s][0]*.35) s = i; });  // start near the top-left
        return p.slice(s).concat(p.slice(0, s+1));   // explicitly closed, so dash length == traced length
      });
  }
  function simplify(pts, eps) {   // Ramer–Douglas–Peucker
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length-1] = 1;
    const stack = [[0, pts.length-1]];
    while (stack.length) { const [a, b] = stack.pop(); let idx = -1, max = eps;
      const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx-ax, dy = by-ay, len = Math.hypot(dx, dy);
      for (let i = a+1; i < b; i++) { const d = len > 1e-6 ? Math.abs(dy*pts[i][0]-dx*pts[i][1]+bx*ay-by*ax)/len : Math.hypot(pts[i][0]-ax, pts[i][1]-ay); if (d > max) { max = d; idx = i; } }
      if (idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); } }
    return pts.filter((_, i) => keep[i]);
  }
  function titleGeometry() {
    title = null; strokeGroup.replaceChildren();
    const h1 = $('.hero-h1'), r = h1.getBoundingClientRect(), copy = $('.hero-copy').getBoundingClientRect();
    Object.assign(titleWork.style, {top:(r.top-copy.top)+'px', left:(r.left-copy.left)+'px', width:r.width+'px', height:r.height+'px', right:'auto'});
    titleSvg.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
    const S = Math.min(3, Math.max(2, devicePixelRatio || 1));
    const items = [], lineEnds = [];
    titleLines.forEach((line, li) => {
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      for (let node; (node = walker.nextNode());) {
        const cs = getComputedStyle(node.parentElement);
        const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        for (let i = 0; i < node.data.length; i++) {
          if (/\s/.test(node.data[i])) continue;
          const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i+1);
          const b = range.getBoundingClientRect(); if (!b.width) continue;
          traceGlyph(node.data[i], font, b.left-r.left, b.top-r.top, b.height, S).forEach(pts => {
            const cum = [0]; for (let j = 1; j < pts.length; j++) cum.push(cum[j-1]+Math.hypot(pts[j][0]-pts[j-1][0], pts[j][1]-pts[j-1][1]));
            const path = svg('path', {d:'M'+pts.map(q => q[0].toFixed(2)+' '+q[1].toFixed(2)).join('L'), pathLength:1}, strokeGroup);
            stroke(path, 0);
            items.push({line:li, pts, cum, len:cum[cum.length-1], path});
          });
        }
      }
    });
    if (!items.length) return;
    // ~5.7 s of drawing; travel between contours is a lifted move, drawing time ∝ contour length.
    const font = parseFloat(getComputedStyle(h1).fontSize), T0 = .3, T1 = 6.0;
    let travel = 0; const hops = items.map((it, i) => { if (!i) return 0; const a = items[i-1].pts.at(-1), b = it.pts[0];
      const d = .05+.06*Math.min(1, Math.hypot(b[0]-a[0], b[1]-a[1])/font); travel += d; return d; });
    const total = items.reduce((s, it) => s+it.len, 0), rate = (T1-T0-travel)/total;
    let t = T0;
    items.forEach((it, i) => { t += hops[i]; it.t0 = t; t += it.len*rate; it.t1 = t; lineEnds[it.line] = t; });
    title = {items, lineEnds, font};
  }
  function pointOn(it, f) {
    const target = f*it.len, cum = it.cum; let j = 1;
    while (j < cum.length-1 && cum[j] < target) j++;
    const a = it.pts[j-1], b = it.pts[j], seg = (cum[j]-cum[j-1]) || 1, u = clamp((target-cum[j-1])/seg);
    return [a[0]+(b[0]-a[0])*u, a[1]+(b[1]-a[1])*u];
  }
  function titleFrame(t) {
    if (!title) { // fallback: v4's fill, no trace and no pencil rather than a fabricated one
      titleLines.forEach((line,j)=>{const p=ease(phase(t,1.2+j*1.6,2.8+j*1.6));opacity(line,p);line.style.transform=`translateY(${(1-p)*5}px)`;});
      opacity(copyPencil, 0); return;
    }
    const {items, lineEnds, font} = title;
    let tip = null, lift = 0, active = null;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (t >= it.t1) { stroke(it.path, 1); continue; }
      if (t >= it.t0) { const f = trap(phase(t, it.t0, it.t1), .08); stroke(it.path, f); tip = pointOn(it, f); active = it; continue; }
      stroke(it.path, 0);
      if (!tip) { // lifted travel from the previous contour's end to this contour's start
        const prev = items[i-1], hopStart = prev ? prev.t1 : it.t0-.3, u = phase(t, hopStart, it.t0), s = smooth(u);
        const a = prev ? prev.pts.at(-1) : [it.pts[0][0]-font*.4, it.pts[0][1]-font*.6], b = it.pts[0];
        tip = [a[0]+(b[0]-a[0])*s, a[1]+(b[1]-a[1])*s];
        lift = Math.sin(u*Math.PI)*Math.min(9, font*.12) + (prev ? 0 : (1-u)*font*.3);
      }
    }
    const end = lineEnds[lineEnds.length-1];
    if (!tip) { const last = items.at(-1).pts.at(-1), u = smooth(phase(t, end, end+.5)); tip = [last[0]+u*font*.6, last[1]-u*font*.5]; lift = u*10; }
    const sway = active ? Math.sin(t*9)*2.5 : -4*Math.min(1, lift/6);
    copyPencil.setAttribute('transform', `translate(${tip[0].toFixed(2)} ${(tip[1]-lift).toFixed(2)}) rotate(${sway.toFixed(2)})`);
    copyPencil.style.opacity = Math.min(phase(t, 0, .25), 1-phase(t, end+.15, end+.5));
    // Fill as v4 (opacity over 1.6 s, triggered as each line's outlines close) but without v4's 5px
    // translate, so the fill registers exactly inside the traced outline instead of rising into it.
    titleLines.forEach((line, j) => { const p = ease(phase(t, lineEnds[j], lineEnds[j]+1.6)); opacity(line, p); line.style.transform = ''; });
    opacity(strokeGroup, 1-phase(t, end+1.6, end+2.3));
  }

  function finish(reason='complete') {
    cancelAnimationFrame(raf); clearTimeout(watchdog); running=false; starting=false;
    hero.classList.remove('is-building');
    hero.classList.add('has-built');
    opacity($('.finished-frame'),1); draw(circuit,1); opacity(pads,1);
    mounts.forEach(mount=>{opacity(mount,1);mount.setAttribute('r',4);});
    signature.removeAttribute('mask');
    nozzleLabel.textContent='DEPOSIT'; millLabel.textContent='FINISH';
    if(reason!=='reset')releaseHeadline();
    chips.forEach(c=>{c.life=0;c.el.style.opacity=0;});
    titleLines.forEach(el=>{el.style.opacity='';el.style.transform='';});
    $('#live-code').textContent='hardware.connect();';
    $('#built-kicker').style.opacity='';
    readout.textContent=reason==='reduced'?'Motion off. The work stays.':'Assembly settled. Explore at your own pace.';
    status.textContent=reason==='complete'?'Hero assembly complete.': 'Hero assembly settled.';
    const focusedSkip = document.activeElement===skip, focusedReplay = document.activeElement===replay;
    replay.hidden=false; skip.hidden=true;
    replay.disabled=reduced.matches;
    replay.textContent=reduced.matches?'Motion off':'Replay build ↺';
    if(focusedSkip||(focusedReplay&&replay.disabled))focusControl(replay);
  }
  function focusControl(preferred) {
    const target = !preferred.hidden&&!preferred.disabled ? preferred : $('#sec-skip') || $('.hero-btns a');
    target?.focus({preventScroll:true});
  }
  function heroContentFocused() {
    return hero.contains(document.activeElement)&&!controls.contains(document.activeElement);
  }
  function frame(now) {
    if (!running) return;
    try {
      const t=(now-epoch)/1000;
      const s=phase(t,.1,4.8), cp=phase(t,1.5,6.2);
      draw(rough,s); opacity(rough,1-phase(t,9.8,12.2));
      const sp=point(sketch,ease(s));
      // Pencil briefly returns to correct the lower edge after CAD settles.
      const revise=phase(t,9.8,11.5);
      if(t>9.8 && t<11.5) tool(pencil,80+330*ease(revise),536+Math.sin(revise*8)*3,-12,Math.sin(revise*Math.PI));
      else tool(pencil,sp.x,sp.y,Math.sin(t*2)*9,Math.min(phase(t,0,.35),1-phase(t,4.8,5.3)));
      opacity(cadFrame,Math.min(cp*2,1)*(1-phase(t,10.8,12.2)));
      cadFrame.style.strokeDasharray='1600';cadFrame.style.strokeDashoffset=(1-ease(cp))*1600;
      opacity(dims,phase(t,3,5)*(1-phase(t,12,14)));
      const c=point(cad,ease(cp));tool(cursor,c.x,c.y,0,Math.min(phase(t,1.3,1.7),1-phase(t,6.2,6.6)));
      // Printer: completed layers plus the partial bead behind the nozzle are the only visible photo.
      const pr=printer(t);
      doneRect.setAttribute('y',(P.bottom-pr.done*P.h-.4).toFixed(2)); doneRect.setAttribute('height',(pr.done*P.h+.4).toFixed(2));
      if(pr.front){
        frontRect.setAttribute('x',pr.front[0].toFixed(2));frontRect.setAttribute('y',pr.front[1].toFixed(2));
        frontRect.setAttribute('width',pr.front[2].toFixed(2));frontRect.setAttribute('height',(P.h+.4).toFixed(2));
        const tail=Math.min(44,pr.front[2]);bead.setAttribute('d',`M${(pr.x-pr.dir*tail).toFixed(2)} ${(pr.y+.8).toFixed(2)}H${pr.x.toFixed(2)}`);bead.style.opacity=.85;
      } else {frontRect.setAttribute('width',0);bead.style.opacity=0;}
      seams.style.opacity=.32*(1-phase(t,P.end,P.end+1.1));
      nozzleLabel.textContent=t<P.end?`DEPOSIT L${String(pr.layer).padStart(2,'0')}/${P.layers}`:'DEPOSIT';
      let nx=pr.x, ny=pr.y;
      // After the portrait layers, print the same frame's supporting rail.
      const rp=ease(phase(t,10.6,12.8));draw(printed,rp);opacity(printed,1-phase(t,14.6,15.8));
      if(t>=10.6){const p=point(rail,rp);nx=p.x;ny=p.y;}
      tool(nozzle,nx,ny,0,Math.min(phase(t,2.62,2.9),1-phase(t,12.8,13.3)));
      // Label rides above the filament tube (always unprinted paper there), clamped inside the frame span so it
      // never crosses the right-hand dimension line, and fades before reaching the top dimension.
      const lw=nozzleLabel.textContent.length*5.3, lx=Math.max(40+lw/2,Math.min(440-lw/2,nx))-nx, ly=-132;
      nozzleLabel.setAttribute('x',lx.toFixed(1));nozzleLabel.setAttribute('y',ly);
      nozzleLabel.style.opacity=clamp((ny+ly-48)/18);
      opacity($('.finished-frame'),phase(t,7,9));
      // Mill: holes open only under the cutter; the caption exists only where the tip has engraved.
      const m=millAt(t), cutting=m.z<.01&&(m.kind==='dwell'||m.kind==='bore'||m.kind==='center'||m.kind==='engrave');
      plan.holes.forEach(h=>{
        const r=t<h.contact?0:t<h.bore0?TOOL_R*smooth(phase(t,h.contact,h.bore0)):TOOL_R+(HOLE_R-TOOL_R)*smooth(phase(t,h.bore0,h.bore1)/.45);
        h.el.setAttribute('r',r.toFixed(2)); opacity(h.el,r>0?1:0);
      });
      // Each word's mask stroke advances by exactly the arc-length fraction the cutter has travelled.
      for(const e of plan.engr) stroke(e.path, t>=e.t1?1:t>=e.t0?trap(phase(t,e.t0,e.t1),.1):0);
      const jit=cutting?Math.sin(t*173)*.25:0;
      tool(mill,m.x+jit,m.y-m.z,0,Math.min(phase(t,6.6,6.85),1-phase(t,plan.endAt,plan.endAt+.35)));
      millShadow.setAttribute('transform',`translate(0 ${m.z.toFixed(2)})`);millShadow.style.opacity=.3*(1-clamp(m.z/Z));
      flutes.setAttribute('transform',`translate(0 ${((t*38)%4).toFixed(2)})`);
      millBody.setAttribute('transform',cutting?`translate(0 ${(Math.sin(t*97)*.3).toFixed(2)})`:'translate(0 0)');
      const engraving=t>=plan.engr[0].t0-.25;
      millLabel.textContent=!engraving?'BORE':t<plan.endAt?'ENGRAVE':'FINISH';
      // While engraving low on the stage, the label sits below the caption instead of over the code card.
      millLabel.setAttribute('x',engraving?-6:20);millLabel.setAttribute('y',engraving?18:-25);
      chipsStep(t,{x:m.x,y:m.y},cutting);
      const wp=ease(phase(t,10.8,14.7));draw(circuit,wp);opacity(pads,wp);
      const w=point(wire,wp);tool(iron,w.x,w.y,Math.sin(t*3)*5,Math.min(phase(t,10.5,10.9),1-phase(t,14.7,15.2)));
      $('.heat').style.opacity=.2+Math.sin(t*11)*.2;
      const code='hardware.connect();';
      $('#live-code').textContent=code.slice(0,Math.floor(phase(t,2.5,13.2)*code.length))+(t<13.2?'▏':'');
      opacity($('#built-kicker'),.5+.5*phase(t,2.5,4));
      titleFrame(t);
      readout.textContent=t<3?'Sketching a starting point…':t<7?'Constraints meet color. Two jobs, one canvas.':t<11?'Deposit. Refine. Revisit.':t<15?'Finishing the edges. Connecting the pieces.':'Tools down. The work is yours to explore.';
      if(t>=16.3){finish();return;}
      raf=requestAnimationFrame(frame);
    } catch (error) { console.warn('V5 scene released:',error);finish('interrupted'); }
  }
  async function start() {
    finish('reset');
    const id=++generation;
    if(reduced.matches){finish('reduced');return;}
    // A late decode must not re-hide an already released headline on first load.
    const readyBy = document.documentElement.classList.contains('v5-prebuild') ? 2300 : performance.now() + 2300;
    starting=true;
    watchdog=setTimeout(()=>{if(id===generation){++generation;finish('startup-timeout');}},Math.max(0,readyBy-performance.now()));
    try { await $('.portrait-fallback').decode(); } catch { if(id===generation)finish('image-unavailable'); return; }
    try { if (document.fonts) await document.fonts.ready; } catch {}
    if(id!==generation)return;
    if(performance.now()>readyBy){finish('slow-load');return;}
    // Recheck after readiness awaits: earlier focus/scroll events can precede startup.
    if(document.hidden||!heroVisible()||heroContentFocused()){finish('startup-interrupted');return;}
    try { titleGeometry(); } catch (error) { console.warn('V5 headline trace unavailable:', error); title=null; strokeGroup.replaceChildren(); }
    try { plan=buildMillPlan(); } catch (error) { console.warn('V5 mill plan unavailable:', error); finish('plan-unavailable'); return; }
    signature.setAttribute('mask','url(#engrave-mask)');
    seed=1; chipClock=0; emitAcc=0;
    // Hide the fill and render frame 0 synchronously, so no settled/blank frame flashes before the first rAF.
    titleLines.forEach(el=>{el.style.opacity=0;});
    hero.classList.add('is-building');
    releaseHeadline();
    const focusedReplay=document.activeElement===replay;
    clearTimeout(watchdog); starting=false;
    controls.hidden=false;skip.hidden=false;replay.hidden=true;running=true;
    if(focusedReplay)focusControl(skip);
    status.textContent='Hero construction started. Skip build is available; scrolling is not blocked.';
    epoch=performance.now();
    watchdog=setTimeout(()=>finish('timeout'),18000);
    frame(epoch);
  }
  // The inline <head> script pre-hides the headline fill (with its own CSS release) to avoid a load flash.
  function releaseHeadline(){ document.documentElement.classList.remove('v5-prebuild'); }
  skip.addEventListener('click',()=>{
    if(document.documentElement.dataset.pageAssembly==='ready')window.dispatchEvent(new CustomEvent('portfolio:skip-request'));
    else {++generation;finish('skipped');}
  });
  replay.addEventListener('click',()=>{
    if(document.documentElement.dataset.pageAssembly==='ready')window.dispatchEvent(new CustomEvent('portfolio:replay-request'));
    else start();
  });
  function heroVisible(){
    const r=hero.getBoundingClientRect(), header=$('.sec-ctl')||$('.nav');
    return r.bottom>(header?.getBoundingClientRect().bottom||0)&&r.top<innerHeight;
  }
  window.addEventListener('portfolio:skip',()=>{pageReplayPending=false;++generation;finish('skipped');});
  window.addEventListener('portfolio:replay',()=>{
    ++generation;finish('reset');pageReplayPending=true;
    if(heroVisible()){pageReplayPending=false;start();}
  });
  window.addEventListener('portfolio:visit',()=>{
    if(pageReplayPending&&heroVisible()){pageReplayPending=false;start();}
  });
  // Keep Skip focusable during animation; non-control focus interrupts even readiness waits.
  document.addEventListener('focusin',e=>{if(hero.contains(e.target)&&!controls.contains(e.target)&&(running||starting)){++generation;finish('focus');}});
  reduced.addEventListener('change',()=>{++generation;finish(reduced.matches?'reduced':'ready');});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){++generation;finish('hidden');}});
  window.addEventListener('resize',()=>{if(running||starting){++generation;finish('resize');}},{passive:true});
  if('IntersectionObserver' in window){
    new IntersectionObserver(entries=>{if(!entries[0].isIntersecting && (running||starting)){++generation;finish('scrolled');}},{threshold:0}).observe(hero);
  }
  // Keyboard access and dialog focus are progressive enhancements to the archive.
  let returnFocus=null;
  document.querySelectorAll('.featured-card,.proj-card,.index-row').forEach(el=>{
    el.tabIndex=0;el.setAttribute('role','button');
    el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}});
    el.addEventListener('click',()=>{returnFocus=el;if(running)finish('dialog');$('#modal-close').focus();});
  });
  const modal=$('#modal-overlay');
  $('#modal-box').setAttribute('role','dialog');$('#modal-box').setAttribute('aria-modal','true');$('#modal-box').setAttribute('aria-labelledby','modal-title');
  modal.addEventListener('keydown',e=>{
    if(e.key==='Tab'){e.preventDefault();$('#modal-close').focus();}
  });
  new MutationObserver(()=>{if(modal.hidden&&returnFocus){returnFocus.focus({preventScroll:true});returnFocus=null;}}).observe(modal,{attributes:true,attributeFilter:['hidden']});
  // V6: rest-of-page section motion moved to sections.js (full build-on-scroll engine).
  // v5's one-shot section fade observer is removed here to avoid two controllers touching the
  // same elements; the hero scene above is otherwise unchanged from v5.
  controls.hidden=false;
  if(reduced.matches)finish('reduced');else start();
})();
