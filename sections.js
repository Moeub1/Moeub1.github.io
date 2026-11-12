/* V6 revision 3 — viewport jobs, coordinated frontiers.
   Content never leaves the DOM or changes its flow. Masks expose actual line boxes;
   structural tools replace the exact CSS border they construct. No glyph-outline
   simulation is claimed for body typography. The v5 hero owns its own toolpaths. */
(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const jobs = [], active = new Set();
  const NS = 'http://www.w3.org/2000/svg';
  let generation = 0, raf = 0, wake = 0, stopped = false, io;
  const clamp = x => Math.max(0, Math.min(1, x));
  const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
  function svg(tag, attrs, parent) {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    parent?.appendChild(el);
    return el;
  }
  const overlay = svg('svg', {class:'sec-overlay', 'aria-hidden':'true'});
  document.body.appendChild(overlay);
  const sprites = {
    pencil:'<g transform="rotate(32)"><path d="M0 0L-5 -16H5Z" fill="#dfc69b"/><path d="M0 0L-1.6 -5H1.6Z" fill="#24282b"/><path d="M-5 -16V-64H5V-16Z" fill="#d5a340" stroke="#24282b"/><path d="M-5 -64H5V-74H-5Z" fill="#be7968"/></g>',
    cad:'<path d="M0 0V-21L16 -6H6L2.5 3Z" fill="#2a52cc" stroke="#f4f3ec"/><circle r="9" fill="none" stroke="#2a52cc" stroke-dasharray="2 3"/>',
    mill:'<path d="M-10 -52H10V-25L5 -18H-5L-10 -25Z" fill="#58666e" stroke="#24282b"/><path d="M-3 -18H3V-7L1.5 0H-1.5L-3 -7Z" fill="#b9c5c9" stroke="#24282b"/>',
    nozzle:'<path d="M-11 -46H11V-22H-11Z" fill="#c6c9c5" stroke="#24282b"/><path d="M-12 -40H12M-12 -34H12" stroke="#24282b"/><path d="M-7 -22H7V-10L2 0H-2L-7 -10Z" fill="#b7924a" stroke="#24282b"/>',
    iron:'<g transform="rotate(38)"><path d="M0 0V-24" stroke="#6b777a" stroke-width="3"/><path d="M-4 -24H4V-46H-4Z" fill="#c2c8c4"/><rect x="-6" y="-76" width="12" height="30" rx="4" fill="#397463"/></g><circle r="4" fill="#dc9f43" opacity=".45"/>',
    code:'<path d="M0 -14V1M-3 -14H3M-3 1H3" stroke="#397463" stroke-width="1.5"/>'
  };
  function add(el, mode = 'code', targets = [el]) {
    const job = {el, mode, targets, state:'new', timer:0, layer:null};
    jobs.push(job);
    return job;
  }
  const all = (sel, fn) => document.querySelectorAll(sel).forEach(fn);
  // Only small real items are masked; layout containers/section ancestors never are.
  all('.section-label,.proj-header>*,.proj-legend,.proj-index-hdr>*,.index-group-label', el => add(el));
  all('.about-h2,.contact-h2,.col-h2,.proj-index-h2', el => {
    if (!jobs.some(j => j.el === el)) add(el, 'pencil');
  });
  all('.about-p,.contact-p,.proj-index-desc,footer>span', el => add(el));
  all('.about-stats>div', el => add(el, 'print'));
  all('.edu-card', el => {
    add(el, 'frame', []);
    [...el.children].forEach(child => add(child, 'cadtext'));
  });
  all('.tl-item,.tl-biz', el => {
    add(el, 'experience', [...el.querySelectorAll('.tl-dot,.tl-biz-marker,.tl-meta,.tl-role,.tl-desc')]);
  });
  all('.toolkit>div', el => {
    // Category parents stay readable; only the real label/tag leaves are masked.
    add(el, 'category', [...el.querySelectorAll('.toolkit-cat,.tag')]);
  });
  all('.featured-card,.proj-card', el => {
    add(el, 'frame', []);
    allInside(el, '.featured-body,.proj-card-body', node => add(node, 'body', [...node.children]));
    allInside(el, '.featured-img,.proj-card-img', node => add(node, 'print'));
  });
  all('.index-row', el => add(el, 'row'));
  all('.interest-card', el => add(el, 'interest'));
  all('.contact-row', el => add(el, 'contact'));
  function allInside(el, sel, fn) { el.querySelectorAll(sel).forEach(fn); }

  const ctl = document.createElement('div');
  ctl.className = 'sec-ctl';
  ctl.setAttribute('role', 'group'); ctl.setAttribute('aria-label', 'Page assembly');
  ctl.innerHTML = '<span>ASSEMBLY</span><button type="button" id="sec-skip">Skip all</button><button type="button" id="sec-replay">Replay page ↺</button>';
  // A dedicated sticky strip reserves its own space, never overlays the footer/phone.
  document.querySelector('.nav').after(ctl);
  const replay = ctl.querySelector('#sec-replay');
  const status = document.createElement('p');
  status.className = 'sr-only'; status.setAttribute('role', 'status');
  ctl.appendChild(status);
  const nav = document.querySelector('.nav');
  function syncHeaderGeometry() {
    const navHeight = nav.getBoundingClientRect().height;
    const stackHeight = navHeight + ctl.getBoundingClientRect().height;
    ctl.style.top = `${navHeight}px`;
    document.documentElement.style.setProperty('--sticky-stack-height',`${stackHeight}px`);
  }
  // Shared by native anchor clearance, sticky positioning and viewport admission.
  // ResizeObserver catches wrapping/font changes as well as viewport breakpoints.
  syncHeaderGeometry();
  if ('ResizeObserver' in window) {
    const headerObserver = new ResizeObserver(syncHeaderGeometry);
    headerObserver.observe(nav); headerObserver.observe(ctl);
  }
  function visible(job) {
    const r = job.el.getBoundingClientRect();
    return r.top < innerHeight - 16 && r.bottom > headerBottom();
  }
  function headerBottom() { return ctl.getBoundingClientRect().bottom + 8; }

  // Final restoration is deliberately independent of measurement, preparation and renderers.
  // Every property we own is cleared even if a renderer/prep threw. No parent opacity exists.
  function restore(job) {
    clearTimeout(job.timer);
    job.targets.forEach(el => {
      el.style.removeProperty('clip-path');
      el.classList.remove('vb-mask','vb-running');
    });
    job.el.classList.remove('vb-border','vb-spine');
    job.el.style.removeProperty('--vb-spine');
    job.el.dataset.buildState = 'built';
    job.layer?.remove(); job.layer = null;
    active.delete(job); job.state = 'built';
  }
  function prepare(job) {
    job.el.dataset.buildState = 'pending'; job.state = 'pending';
    if (job.mode === 'frame') job.el.classList.add('vb-border');
    else if (job.mode === 'experience') job.el.classList.add('vb-spine');
    job.targets.forEach(el => el.classList.add('vb-mask'));
  }
  function settleAll(reason, hero = true) {
    generation++; cancelAnimationFrame(raf); raf = 0; clearTimeout(wake); wake = 0;
    stopped = true;
    jobs.forEach(restore);
    if (hero) window.dispatchEvent(new CustomEvent('portfolio:skip'));
    status.textContent = reason || 'All content is visible.';
  }
  // Install recovery BEFORE any content is hidden. Errors open the page, not a retry loop.
  window.addEventListener('error', () => settleAll('Assembly interrupted. All content is visible.'));
  window.addEventListener('unhandledrejection', () => settleAll('Assembly interrupted. All content is visible.'));

  // Read typography ONCE at job start; no per-frame text measurement or DOM text rewriting.
  // Range boxes retain actual wrapping, nested emphasis, and the full accessible text.
  function lines(el) {
    const box = el.getBoundingClientRect(), out = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      for (let i = 0; i < node.length; i++) {
        const range = document.createRange();
        range.setStart(node, i); range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        let line = out.find(l => Math.abs(l.top - (r.top - box.top)) < 3);
        if (!line) { line = {top:r.top-box.top, bottom:r.bottom-box.top, left:r.left-box.left, right:r.right-box.left, ends:[]}; out.push(line); }
        line.left = Math.min(line.left, r.left-box.left);
        line.right = Math.max(line.right, r.right-box.left);
        line.bottom = Math.max(line.bottom, r.bottom-box.top);
        line.ends.push(r.right-box.left);
      }
    }
    return out.sort((a,b) => a.top-b.top || a.left-b.left);
  }
  function start(job, now) {
    job.state = 'active'; job.el.dataset.buildState = 'active'; job.start = now;
    job.rect = job.el.getBoundingClientRect(); job.scrollX = scrollX; job.scrollY = scrollY;
    job.parts = job.targets.map(el => {
      const measuredLines = lines(el);
      return {el, rect:el.getBoundingClientRect(), lines:measuredLines, weight:Math.max(1,measuredLines.length)};
    });
    if (job.mode === 'experience') {
      const base = getComputedStyle(job.el), spine = getComputedStyle(job.el,'::before');
      const top = parseFloat(spine.top), bottom = parseFloat(spine.bottom);
      // The pseudo-element's used geometry includes borders and its bottom:-30px
      // extension. Both the visible clip AND nozzle consume this one measurement.
      const height = parseFloat(spine.height);
      job.spine = {
        x:job.rect.left + parseFloat(base.borderLeftWidth) + parseFloat(spine.left) + parseFloat(spine.width)/2,
        y:job.rect.top + parseFloat(base.borderTopWidth) + top,
        height:Number.isFinite(height) ? height : job.rect.height-parseFloat(base.borderTopWidth)-parseFloat(base.borderBottomWidth)-top-bottom
      };
    }
    job.duration = ['category','experience','body'].includes(job.mode) ? 2100 : job.mode === 'print' ? 1300 : job.mode === 'pencil' ? 1300 : job.mode === 'frame' ? 900 : Math.min(1200,450 + job.el.textContent.length*2);
    const kind = {frame:'cad',cadtext:'cad',spine:'nozzle',joint:'iron',tags:'mill',row:'mill',interest:'cad',contact:'iron',print:'nozzle',pencil:'pencil'}[job.mode] || 'code';
    job.layer = svg('g', {}, overlay);
    job.ink = svg('path', {fill:'none',stroke:kind === 'iron' ? '#397463' : '#24282b', 'stroke-width':'1', 'stroke-linecap':'square'}, job.layer);
    job.tool = svg('g', {class:'sec-tool'}, job.layer); job.tool.innerHTML = sprites[kind]; job.toolKind = kind;
    job.targets.forEach(el => el.classList.add('vb-running'));
    active.add(job);
  }
  function tip(job, x, y, t, drawing = true) {
    // Lifted curved approach and withdrawal; contact phases follow the same mask frontier.
    let lift = 0;
    if (t < .12) { const u = 1-smooth(t/.12); x -= 28*u; lift = 22*u + Math.sin(u*Math.PI)*8; }
    if (t > .93) lift = smooth((t-.93)/.07)*18;
    job.tool.setAttribute('transform', `translate(${x} ${y-lift}) rotate(${drawing ? Math.sin(t*24)*1.5 : -6})`);
    job.tool.style.opacity = t > .99 ? '0' : '1';
  }
  function useTool(job, kind) {
    if (job.toolKind !== kind) { job.tool.innerHTML = sprites[kind]; job.toolKind = kind; }
  }
  function contour(job, r, p, ox, oy) {
    const perimeter = 2*(r.width+r.height-2), d = clamp(p)*perimeter;
    const x = r.left+ox+.5, y = r.top+oy+.5, w = r.width-1, h = r.height-1;
    job.ink.setAttribute('d', `M${x} ${y}h${w}v${h}h${-w}Z`);
    job.ink.setAttribute('stroke-dasharray', `${d} ${perimeter+8}`);
    const edges = [[x,y,w,0],[x+w,y,0,h],[x+w,y+h,-w,0],[x,y+h,0,-h]];
    let left = d;
    for (const e of edges) { const len = Math.abs(e[2])+Math.abs(e[3]); if (left <= len) return [e[0]+e[2]*left/Math.max(1,len),e[1]+e[3]*left/Math.max(1,len)]; left -= len; }
    return [x,y];
  }
  function textMask(job, part, p, ox, oy) {
    const ls = part.lines, r = part.rect;
    if (!ls.length) { part.el.style.clipPath = `inset(0 ${100*(1-p)}% 0 0)`; return [r.left+ox+r.width*p,r.bottom+oy]; }
    // A pause/lift at each wrapped line return, not a universal rectangle wipe.
    const pos = clamp(p)*ls.length, idx = Math.min(ls.length-1, Math.floor(pos));
    const line = ls[idx], u = clamp((pos-idx)/.84);
    let x = line.left + (line.right-line.left)*smooth(u);
    if (job.mode === 'code' || job.mode === 'contact' || job.mode === 'row') {
      const n = Math.floor(u*line.ends.length);
      x = n ? line.ends[Math.min(n-1,line.ends.length-1)] : line.left;
    }
    const top = Math.max(0,line.top-2), bottom = Math.min(r.height,line.bottom+2);
    part.el.style.clipPath = `polygon(0 0,100% 0,100% ${top}px,${x}px ${top}px,${x}px ${bottom}px,0 ${bottom}px)`;
    const frac = pos-idx;
    if (frac > .84 && ls[idx+1]) {
      const next = ls[idx+1], hop = smooth((frac-.84)/.16);
      return [r.left+ox+line.right+(next.left-line.right)*hop,
        r.top+oy+line.bottom-2+(next.bottom-line.bottom)*hop-Math.sin(hop*Math.PI)*14];
    }
    return [r.left+ox+x,r.top+oy+line.bottom-2];
  }
  function sequentialText(parts, p, ox, oy) {
    const distance = clamp(p)*parts.reduce((sum,part) => sum+part.weight,0);
    let start = 0;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i], end = start+part.weight;
      if (distance >= end && i < parts.length-1) part.el.style.clipPath = 'none';
      else {
        const kind = part.el.matches('h3,.tl-role') ? 'pencil' : 'code';
        return {kind,point:textMask({mode:kind},part,clamp((distance-start)/part.weight),ox,oy)};
      }
      start = end;
    }
  }
  function render(job, now, sx, sy) {
    const t = clamp((now-job.start)/job.duration), p = smooth(clamp((t-.12)/.8));
    const ox = job.scrollX-sx, oy = job.scrollY-sy, r = job.rect;
    let point, kind = job.toolKind;
    if (job.mode === 'frame') {
      point = contour(job,r,clamp(p/.86),ox,oy);
      // Return to the datum corner for a short constraint check after closing the frame.
      if (p > .86) {
        const u = smooth((p-.86)/.14), a = u*Math.PI*2;
        point = [r.left+ox+Math.sin(a)*4,r.top+oy-Math.sin(u*Math.PI)*7];
      }
    } else if (job.mode === 'experience') {
      // One physical frontier at a time within this entry; jobs may run concurrently.
      const laid = smooth(clamp(p/.22)), frontier = job.spine.height*laid;
      job.el.style.setProperty('--vb-spine', `${frontier}px`);
      point = [job.spine.x+ox,job.spine.y+oy+frontier];
      kind = 'nozzle';
      const dot = job.parts[0], joint = smooth(clamp((p-.22)/.1));
      dot.el.style.clipPath = `circle(${joint*100}% at 50% 50%)`;
      if (p >= .22 && p < .32) {
        kind = 'iron'; point = [dot.rect.left+ox+dot.rect.width/2,dot.rect.top+oy+dot.rect.height/2];
      }
      if (p >= .32) ({point,kind} = sequentialText(job.parts.slice(1),(p-.32)/.68,ox,oy));
    } else if (job.mode === 'body') {
      ({point,kind} = sequentialText(job.parts,p,ox,oy));
    } else if (job.mode === 'category') {
      const heading = job.parts[0];
      point = textMask({mode:'code'},heading,clamp(p/.18),ox,oy);
      kind = 'code';
      const parts = job.parts.slice(1), n = parts.length, q = clamp((p-.18)/.82)*n, idx = Math.min(n-1,Math.floor(q));
      parts.forEach((part,i) => {
        if (i < idx) part.el.style.clipPath = 'none';
        else if (i > idx) part.el.style.clipPath = 'inset(0 100% 0 0)';
      });
      const part = parts[idx], u = clamp(q-idx);
      if (p >= .18) {
        kind = 'mill'; point = contour(job,part.rect,smooth(clamp((u-.14)/.58)),ox,oy);
        if (u < .14 && idx > 0) {
          // Lift and arc to the next part before the cutter can leave a new mark.
          const prev = parts[idx-1].rect, hop = smooth(u/.14);
          point = [prev.left+ox+(part.rect.left-prev.left)*hop,
            prev.top+oy+(part.rect.top-prev.top)*hop-Math.sin(hop*Math.PI)*16];
        }
      }
      // Cut the real tag perimeter first; then slot its readable label into that contour.
      part.el.style.clipPath = u < .72 ? 'inset(0 100% 0 0)' : `inset(${(1-smooth((u-.72)/.28))*50}% 0)`;
    } else if (job.mode === 'print') {
      const part = job.parts[0], layers = Math.max(4,Math.ceil(r.height/12));
      const q = p*layers, row = Math.min(layers-1,Math.floor(q)), u = smooth(q-row);
      const y = r.height*(1-row/layers), top = r.height*(1-(row+1)/layers);
      const forward = row%2 === 0, x = r.width*(forward ? u : 1-u);
      part.el.style.clipPath = forward
        ? `polygon(0 ${r.height}px,100% ${r.height}px,100% ${y}px,${x}px ${y}px,${x}px ${top}px,0 ${top}px)`
        : `polygon(0 ${r.height}px,100% ${r.height}px,100% ${top}px,${x}px ${top}px,${x}px ${y}px,0 ${y}px)`;
      point = [r.left+ox+x,r.top+oy+top];
    } else if (job.mode === 'row' || job.mode === 'contact' || job.mode === 'interest') {
      const cut = clamp(p/.35);
      if (job.mode === 'interest') point = contour(job,r,cut,ox,oy);
      else {
        // Index/contact rows own bottom rules, not imaginary rectangular frames.
        const x = r.left+ox, y = r.bottom+oy-.5;
        job.ink.setAttribute('d',`M${x} ${y}H${x+r.width*smooth(cut)}`);
        point = [x+r.width*smooth(cut),y];
      }
      // Keep the constructed rule/frame in place until the real CSS border takes over.
      if (p > .35) point = textMask(job,job.parts[0],(p-.35)/.65,ox,oy);
    } else {
      point = textMask(job,job.parts[0],p,ox,oy);
    }
    useTool(job,kind);
    tip(job,point[0],point[1],t);
    if (t >= 1) restore(job);
  }
  function tick(now) {
    raf = 0;
    const sx = scrollX, sy = scrollY;
    // Geometry is cached at start; frame work only writes masks/tool paths.
    [...active].forEach(job => {
      try { render(job,now,sx,sy); } catch (error) { console.warn('V6 job released',error); restore(job); }
    });
    pump();
    if (active.size && !raf) raf = requestAnimationFrame(tick);
  }
  function pump() {
    if (stopped || document.hidden || reduced.matches) return;
    const candidates = jobs.filter(j => j.state === 'queued');
    while (candidates.length && active.size < 3) {
      // Share slots between visible columns instead of draining document order.
      // Positions come from the observer/scroll read batch, not per-frame layout reads.
      const occupancy = lane => [...active].filter(j => j.lane === lane).length;
      candidates.sort((a,b) => occupancy(a.lane)-occupancy(b.lane) || a.screenTop-b.screenTop);
      const job = candidates.shift();
      try { start(job,performance.now()); } catch (error) { console.warn('V6 preparation released',error); restore(job); }
    }
    if (active.size && !raf) raf = requestAnimationFrame(tick);
  }
  function visit(job) {
    if (stopped || job.state !== 'pending') return;
    const r = job.el.getBoundingClientRect();
    const cx = (r.left+r.width/2)/innerWidth;
    job.lane = cx < .4 ? 'left' : cx > .6 ? 'right' : 'middle';
    job.screenTop = r.top;
    job.state = 'queued'; job.el.dataset.buildState = 'queued';
    const gen = generation;
    // An independent, generation-scoped deadline covers QUEUED and ACTIVE rAF stalls.
    job.timer = setTimeout(() => { if (gen === generation && job.state !== 'built') { restore(job); pump(); } }, 4500);
  }
  function scan() {
    if (stopped) return;
    // Batch all reads before state writes. Fast scroll settles only jobs already visited.
    const states = jobs.map(job => [job,visible(job)]);
    states.forEach(([job,on]) => {
      if (on) visit(job);
      else if (job.state === 'active' || job.state === 'queued') restore(job);
    });
    window.dispatchEvent(new CustomEvent('portfolio:visit'));
    pump();
  }
  function reset() {
    if (reduced.matches) { settleAll('Motion is off. All content is visible.'); return; }
    generation++; cancelAnimationFrame(raf); raf = 0; clearTimeout(wake); wake = 0;
    jobs.forEach(restore); stopped = false;
    try { jobs.forEach(prepare); } catch (error) { settleAll('Preparation interrupted. All content is visible.'); return; }
    // Never hide a focused card/link or any descendants of that interactive target.
    revealFocus(document.activeElement);
    window.dispatchEvent(new CustomEvent('portfolio:replay'));
    scan();
    status.textContent = 'Rebuilding the viewport. Other groups build when visited.';
  }
  function revealFocus(target) {
    if (!(target instanceof Element)) return;
    const interactive = target.closest('a,button,[role="button"],[tabindex]');
    if (!interactive) return;
    jobs.filter(j => j.el.contains(interactive) || interactive.contains(j.el)).forEach(restore);
  }
  document.addEventListener('focusin', e => { revealFocus(e.target); pump(); }, true);
  // A pointer activation also finishes the target before opening its original dialog/link.
  document.addEventListener('pointerdown', e => revealFocus(e.target), true);
  ctl.querySelector('#sec-skip').addEventListener('click', () => settleAll());
  replay.addEventListener('click',reset);
  // Original hero buttons use the same page contract when the page controller is present.
  window.addEventListener('portfolio:skip-request', () => settleAll());
  window.addEventListener('portfolio:replay-request',reset);
  reduced.addEventListener('change', () => {
    if(reduced.matches&&document.activeElement===replay)ctl.querySelector('#sec-skip').focus({preventScroll:true});
    replay.disabled = reduced.matches;
    settleAll(reduced.matches ? 'Motion is off. All content is visible.' : 'Motion available. Choose Replay page to rebuild.');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      jobs.filter(j => j.state === 'active' || j.state === 'queued').forEach(restore);
      cancelAnimationFrame(raf); raf = 0;
    } else scan();
  });
  window.addEventListener('resize', () => {
    jobs.filter(j => j.state === 'active' || j.state === 'queued').forEach(restore);
    syncHeaderGeometry();
    scan();
  }, {passive:true});
  window.addEventListener('scroll', () => {
    if (stopped || wake) return;
    // A one-shot timer also works if animation frames stop firing.
    wake = setTimeout(() => { wake = 0; scan(); },60);
  }, {passive:true});
  syncHeaderGeometry();
  document.documentElement.dataset.pageAssembly = 'ready';
  if (!('IntersectionObserver' in window) || reduced.matches) {
    replay.disabled = reduced.matches; settleAll('Static assembly. All content is visible.');
    return;
  }
  io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const job = jobs.find(j => j.el === entry.target);
      if (job && visible(job)) visit(job);
    });
    pump();
  }, {threshold:0});
  jobs.forEach(job => io.observe(job.el));
  // Set the bridge only after lifecycle/recovery listeners are all installed.
  document.documentElement.dataset.pageAssembly = 'ready';
  try { jobs.forEach(prepare); scan(); } catch (error) { settleAll('Assembly unavailable. All content is visible.'); }
})();
