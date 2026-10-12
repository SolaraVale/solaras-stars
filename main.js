// Solara's Stars: your Obsidian vault as a slowly turning cluster of stars.
// Notes are stars, links are faint threads of light, well-linked notes shine brighter.
// Drag to turn, scroll to zoom, hover for a name, click to open the note.
const { Plugin, ItemView, PluginSettingTab, Setting, getAllTags, normalizePath } = require('obsidian');

const VIEW = 'solaras-stars';
const DEFAULTS = { colors: 'graph', useGraphFilter: true, exclude: '', showUnresolved: true, spin: 1, labels: 10, hideNames: false };
const NEUTRAL = [180, 190, 230], IDEA = [214, 224, 255];
const PALETTE = [[45, 226, 230], [255, 111, 176], [159, 211, 160], [243, 169, 92], [167, 139, 250],
  [250, 204, 21], [96, 165, 250], [248, 113, 113], [52, 211, 153], [244, 114, 182]];

// ---- a small part of Obsidian's search syntax, for graph filters and color groups ----
// Supports path:, file:, tag:, plain words, "quoted text", "-" to leave out, and OR.
function parseQuery(q) {
  return String(q || '').split(/\s+OR\s+/).map(part => {
    const terms = [], re = /(-?)(?:(\w+):)?(?:"([^"]*)"|(\S+))/g, text = part.replace(/[()]/g, ' ');
    let m;
    while ((m = re.exec(text))) terms.push({ not: m[1] === '-', op: (m[2] || '').toLowerCase(), text: (m[3] ?? m[4] ?? '').toLowerCase() });
    return terms;
  }).filter(t => t.length);
}

function termMatches(t, f) {
  let hit;
  if (t.op === 'path' || t.op === '') hit = f.path.includes(t.text);
  else if (t.op === 'file') hit = f.name.includes(t.text);
  else if (t.op === 'tag') { const tag = t.text.replace(/^#/, ''); hit = f.tags.some(x => x === tag || x.startsWith(tag + '/')); }
  else return false;   // content searches and other operators aren't supported here
  return t.not ? !hit : hit;
}
const queryMatches = (groups, f) => groups.some(terms => terms.every(t => termMatches(t, f)));
const toRGB = n => [(n >> 16) & 255, (n >> 8) & 255, n & 255];

async function graphConfig(app) {
  // graph.json lives in the config folder, which the Vault API does not index, so it is read through the adapter.
  try { return JSON.parse(await app.vault.adapter.read(normalizePath(app.vault.configDir + '/graph.json'))); } catch (e) { return {}; }
}

// ---- the star graph ----
async function vaultGraph(app, s) {
  const cfg = await graphConfig(app);
  const exclude = s.exclude.split(',').map(x => x.trim().replace(/^\/+|\/+$/g, '').toLowerCase()).filter(Boolean);
  const filter = s.useGraphFilter ? parseQuery(cfg.search) : [];
  const groups = (cfg.colorGroups || []).map(g => ({ q: parseQuery(g.query), rgb: toRGB(g.color && g.color.rgb || 0) }));
  const byFolders = s.colors === 'folders' || !groups.length;

  const info = f => {
    const c = app.metadataCache.getFileCache(f);
    return { path: f.path.toLowerCase(), name: f.basename.toLowerCase(), tags: ((c && getAllTags(c)) || []).map(t => t.replace(/^#/, '').toLowerCase()) };
  };
  const files = app.vault.getMarkdownFiles().filter(f => {
    const p = f.path.toLowerCase();
    if (exclude.some(x => p === x || p.startsWith(x + '/'))) return false;
    return !filter.length || queryMatches(filter, info(f));
  });
  const folders = [...new Set(files.map(f => f.path.includes('/') ? f.path.split('/')[0] : ''))].filter(Boolean).sort();
  const colorOf = f => {
    if (byFolders) {
      const i = f.path.includes('/') ? folders.indexOf(f.path.split('/')[0]) : -1;
      return i < 0 ? NEUTRAL : PALETTE[i % PALETTE.length];
    }
    const i = info(f), g = groups.find(g => queryMatches(g.q, i));
    return g ? g.rgb : NEUTRAL;
  };

  const index = new Map(), nodes = [], links = [];
  const add = (id, label, rgb, idea) => {
    if (!index.has(id)) { index.set(id, nodes.length); nodes.push({ id, label, rgb, idea, degree: 0 }); }
    return index.get(id);
  };
  files.forEach(f => add(f.path, f.basename, colorOf(f), false));
  const link = (a, b) => { if (a !== b) { links.push([a, b]); nodes[a].degree++; nodes[b].degree++; } };
  for (const [src, dsts] of Object.entries(app.metadataCache.resolvedLinks)) {
    if (!index.has(src)) continue;
    for (const dst of Object.keys(dsts)) if (index.has(dst)) link(index.get(src), index.get(dst));
  }
  if (s.showUnresolved) {
    for (const [src, dsts] of Object.entries(app.metadataCache.unresolvedLinks)) {
      if (!index.has(src)) continue;
      for (const name of Object.keys(dsts)) link(index.get(src), add('idea:' + name, name, IDEA, true));
    }
  }
  return { nodes, links };
}

// ---- the renderer: works on any element, so it can be tested outside Obsidian too ----
// opts: onOpen(path), spin() (turning speed), labels() (how many names), showNames()
function createConstellation(host, graph, opts = {}) {
  const spin = opts.spin || (() => 1), labels = opts.labels || (() => 10), showNames = opts.showNames || (() => true);
  const canvas = document.createElement('canvas');
  canvas.className = 'tc-canvas';
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: false });
  const { nodes, links } = graph;
  let W = 0, H = 0, dpr = 1;

  // seeded randomness, so the sky is the same each time you open it
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // start scattered in a sphere; the layout pulls them into clusters as you watch
  const spread = 260 * Math.max(1, Math.cbrt(nodes.length / 800));
  nodes.forEach(n => {
    const r = spread * Math.cbrt(rand()), t = rand() * Math.PI * 2, p = Math.acos(2 * rand() - 1);
    n.x = r * Math.sin(p) * Math.cos(t); n.y = r * Math.sin(p) * Math.sin(t); n.z = r * Math.cos(p);
    n.vx = n.vy = n.vz = 0;
    n.size = 0.55 + Math.sqrt(n.degree) * 0.5;
    n.tw = rand() * 6.28; n.ts = 0.6 + rand() * 1.6;
  });
  const dust = Array.from({ length: 600 }, () => {
    const r = 900 + rand() * 900, t = rand() * Math.PI * 2, p = Math.acos(2 * rand() - 1);
    return { x: r * Math.sin(p) * Math.cos(t), y: r * Math.sin(p) * Math.sin(t), z: r * Math.cos(p), b: 0.15 + rand() * 0.45 };
  });

  // a 3D force layout, a few steps per frame. Big vaults compare each star with a random
  // sample of others instead of all of them, so it stays smooth.
  const N = nodes.length, EXACT = N <= 1500, SAMPLE = Math.max(50, Math.min(250, Math.round(1200000 / N)));
  let heat = 1, settled = 0;
  function push(a, b, scale, both) {
    let dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    const d2 = dx * dx + dy * dy + dz * dz + 25, f = 2400 / d2 * scale, d = Math.sqrt(d2);
    dx /= d; dy /= d; dz /= d;
    a.vx += dx * f; a.vy += dy * f; a.vz += dz * f;
    if (both) { b.vx -= dx * f; b.vy -= dy * f; b.vz -= dz * f; }
  }
  function layoutStep() {
    if (EXACT) {
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) push(nodes[i], nodes[j], 1, true);
    } else {
      for (let i = 0; i < N; i++) for (let k = 0; k < SAMPLE; k++) {
        const j = (rand() * N) | 0;
        if (j !== i) push(nodes[i], nodes[j], N / SAMPLE, false);
      }
    }
    for (const [i, j] of links) {
      const a = nodes[i], b = nodes[j];
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const f = (d - 48) * 0.01;
      a.vx += dx / d * f; a.vy += dy / d * f; a.vz += dz / d * f;
      b.vx -= dx / d * f; b.vy -= dy / d * f; b.vz -= dz / d * f;
    }
    for (const n of nodes) {
      n.vx -= n.x * 0.0028; n.vy -= n.y * 0.0028; n.vz -= n.z * 0.0028;   // gentle pull to the center
      n.x += Math.max(-8, Math.min(8, n.vx)) * heat; n.y += Math.max(-8, Math.min(8, n.vy)) * heat; n.z += Math.max(-8, Math.min(8, n.vz)) * heat;
      n.vx *= 0.55; n.vy *= 0.55; n.vz *= 0.55;
    }
    heat = Math.max(0.02, heat * 0.985);
  }

  // glowing star sprites, one per color
  const sprites = new Map();
  function sprite(rgb) {
    const key = rgb.join(',');
    if (!sprites.has(key)) {
      const [r, g, b] = rgb, s = document.createElement('canvas'); s.width = s.height = 64;
      const c = s.getContext('2d'), grad = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.07, `rgba(${r},${g},${b},0.95)`);
      grad.addColorStop(0.18, `rgba(${r},${g},${b},0.32)`);
      grad.addColorStop(0.45, `rgba(${r},${g},${b},0.06)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      c.fillStyle = grad; c.fillRect(0, 0, 64, 64);
      sprites.set(key, s);
    }
    return sprites.get(key);
  }

  // camera: slow auto-turn; drag to turn yourself, scroll to zoom
  let yaw = 0, pitch = -0.35, dist = 560 * Math.max(1, spread / 260), dragging = false, lastX = 0, lastY = 0, idleAt = 0, hover = -1, moved = 0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  canvas.addEventListener('pointerdown', e => { dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointerup', () => {
    dragging = false; idleAt = performance.now();
    if (moved < 5 && hover >= 0 && !nodes[hover].idea && opts.onOpen) opts.onOpen(nodes[hover].id);
  });
  canvas.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    if (dragging) {
      yaw += (e.clientX - lastX) * 0.005; pitch = Math.max(-1.4, Math.min(1.4, pitch + (e.clientY - lastY) * 0.005));
      moved += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY); lastX = e.clientX; lastY = e.clientY;
    }
    let best = -1, bd = 14 * 14;
    nodes.forEach((n, i) => { if (n.sx == null) return; const d = (n.sx - mx) ** 2 + (n.sy - my) ** 2; if (d < bd) { bd = d; best = i; } });
    hover = best;
    canvas.classList.toggle('is-link', best >= 0 && !nodes[best].idea);
  });
  canvas.addEventListener('pointerleave', () => { hover = -1; });
  canvas.addEventListener('wheel', e => { e.preventDefault(); dist = Math.max(180, Math.min(6000, dist * (1 + Math.sign(e.deltaY) * 0.08))); }, { passive: false });

  // The canvas fills the view through CSS; only its drawing resolution follows the size here.
  // (Setting exact pixel sizes made Obsidian add and remove scrollbars in a loop.)
  function resize() {
    const r = canvas.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(r.width), h = Math.round(r.height);
    if (w === W && h === H && d === dpr) return;
    W = w; H = h; dpr = d;
    canvas.width = Math.max(1, Math.round(W * dpr)); canvas.height = Math.max(1, Math.round(H * dpr));
  }
  const ro = new ResizeObserver(() => requestAnimationFrame(resize)); ro.observe(host); resize();

  const brightest = [...nodes.keys()].sort((a, b) => nodes[b].degree - nodes[a].degree);
  let last = performance.now(), running = true;

  function project(x, y, z) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
    const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
    const zc = z2 + dist;
    if (zc < 20) return null;
    const f = Math.min(W, H) * 0.9 / zc;
    return { x: W / 2 + x1 * f, y: H / 2 + y2 * f, f, z: zc };
  }

  let shownError = '', lastDraw = 0;
  function frame(now) {
    if (!running) return;
    if (!canvas.isConnected) { running = false; ro.disconnect(); return; }   // its view was closed or replaced
    requestAnimationFrame(frame);   // keep going even if one frame fails
    if (now - lastDraw < 32 || !W || !H) return;   // ~30 frames a second; nothing to draw while hidden in a background tab
    lastDraw = now;
    try { draw(now); } catch (e) {
      const msg = 'Drawing problem: ' + (e && e.message ? e.message : e);
      if (msg !== shownError) {
        shownError = msg; console.error("Solara's Stars", e);
        host.querySelector('.tc-error')?.remove();
        const d = document.createElement('div'); d.className = 'tc-error'; d.textContent = msg; host.appendChild(d);
      }
    }
  }
  function draw(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (settled < 260) { layoutStep(); if (EXACT) layoutStep(); settled++; }
    if (!dragging && !reduce && now - idleAt > 2500) yaw += dt * 0.06 * spin();
    const t = now / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.75);
    bg.addColorStop(0, '#0d1230'); bg.addColorStop(1, '#03040c');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    ctx.fillStyle = 'rgba(200,210,255,0.5)';
    for (const d of dust) {
      const p = project(d.x * 1.6, d.y * 1.6, d.z * 1.6); if (!p) continue;
      ctx.globalAlpha = d.b; ctx.fillRect(p.x, p.y, 1.1, 1.1);
    }
    ctx.globalAlpha = 1;
    nodes.forEach(n => { const p = project(n.x, n.y, n.z); n.sx = p ? p.x : null; n.sy = p ? p.y : null; n.sf = p ? p.f : 0; });

    // Threads one at a time: on the CPU canvas Obsidian uses, that's faster than one big path.
    ctx.lineWidth = 0.6;
    const dim = 'rgba(160,190,255,0.055)', bright = 'rgba(255,240,210,0.55)';
    for (const [i, j] of links) {
      const a = nodes[i], b = nodes[j]; if (a.sx == null || b.sx == null) continue;
      ctx.strokeStyle = hover === i || hover === j ? bright : dim;
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
    }

    nodes.forEach((n, i) => {
      if (n.sx == null) return;
      const tw = reduce ? 1 : 0.8 + 0.2 * Math.sin(t * n.ts + n.tw);
      const s = Math.max(2.2, n.size * n.sf * 7 * tw * (i === hover ? 1.8 : 1));
      ctx.globalAlpha = Math.min(0.95, 0.3 + n.sf * 0.6);
      ctx.drawImage(n.sprite || (n.sprite = sprite(n.rgb)), n.sx - s, n.sy - s, s * 2, s * 2);
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    if (!showNames()) return;   // "Hide names": just the stars, for sharing
    const named = new Set(brightest.slice(0, labels()));
    ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
    nodes.forEach((n, i) => {
      if (n.sx == null || (i !== hover && !named.has(i))) return;
      ctx.fillStyle = i === hover ? 'rgba(255,245,225,0.95)' : 'rgba(220,228,255,0.35)';
      ctx.fillText(n.label, n.sx, n.sy - Math.max(8, n.size * n.sf * 5) - 4);
    });
  }
  requestAnimationFrame(frame);
  return { destroy() { running = false; ro.disconnect(); canvas.remove(); } };
}

// ---- inside Obsidian ----
class ConstellationView extends ItemView {
  constructor(leaf, plugin) { super(leaf); this.plugin = plugin; }
  getViewType() { return VIEW; }
  getDisplayText() { return "Solara's Stars"; }
  getIcon() { return 'sparkles'; }
  async onOpen() {
    this.contentEl.addClass('tc-host');
    this.contentEl.tabIndex = 0;
    this.registerDomEvent(this.contentEl, 'keydown', e => {   // H hides or shows the names
      if ((e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.metaKey && !e.altKey) this.plugin.setHideNames(!this.plugin.settings.hideNames);
    });
    // Wait until the workspace is ready and the view has its size, then draw.
    this.app.workspace.onLayoutReady(() => requestAnimationFrame(() => requestAnimationFrame(() => this.draw())));
    // When Obsidian starts with this view open, it draws before every note and link has been read.
    // The first "resolved" (all links read) redraws right away; after that, at most every 30 seconds.
    let timer = null, first = true;
    const redrawIfChanged = async () => {
      const g = await vaultGraph(this.app, this.plugin.settings);
      if (g.nodes.length !== this.shape?.[0] || g.links.length !== this.shape?.[1]) this.draw(g);
    };
    this.registerEvent(this.app.metadataCache.on('resolved', () => {
      if (first) { first = false; redrawIfChanged(); return; }
      if (timer) return;
      timer = window.setTimeout(() => { timer = null; redrawIfChanged(); }, 30000);
    }));
    this.register(() => window.clearTimeout(timer));
  }
  async draw(graph) {
    const host = this.contentEl, s = this.plugin.settings;
    try {
      graph = graph || await vaultGraph(this.app, s);
      if (this.sky) this.sky.destroy();
      host.empty();
      this.shape = [graph.nodes.length, graph.links.length];
      this.sky = createConstellation(host, graph, {
        onOpen: path => this.app.workspace.openLinkText(path, '', true),
        spin: () => s.spin, labels: () => s.labels, showNames: () => !s.hideNames,
      });
      const count = host.createDiv({ cls: 'tc-count', text: `${graph.nodes.length} stars · ${graph.links.length} threads` });
      const toggle = host.createEl('button', { cls: 'tc-names' });
      toggle.addEventListener('click', () => this.plugin.setHideNames(!s.hideNames));
      this.syncNames = () => { toggle.setText(s.hideNames ? 'Show names' : 'Hide names'); count.toggle(!s.hideNames); };
      this.syncNames();
    } catch (e) {
      // if anything goes wrong, say so right here instead of showing a blank view
      host.empty();
      host.createDiv({ cls: 'tc-error', text: 'The constellation hit a problem: ' + (e && e.message ? e.message : e) });
      console.error("Solara's Stars", e);
    }
  }
  async onClose() { if (this.sky) this.sky.destroy(); }
}

class ConstellationSettings extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const el = this.containerEl, p = this.plugin, s = p.settings;
    el.empty();
    new Setting(el).setName('Star colors')
      .setDesc('Use the color groups from your graph view, or give each top-level folder its own color. With no color groups, folders are used.')
      .addDropdown(d => d.addOption('graph', 'Graph view color groups').addOption('folders', 'Top-level folders')
        .setValue(s.colors).onChange(v => { s.colors = v; p.save(true); }));
    new Setting(el).setName("Use the graph view's filter")
      .setDesc('Leave out the notes your graph view filters out (for example -path:archive). Supports path:, file:, tag:, plain words, - and OR.')
      .addToggle(t => t.setValue(s.useGraphFilter).onChange(v => { s.useGraphFilter = v; p.save(true); }));
    new Setting(el).setName('Leave out folders')
      .setDesc('Comma-separated, for example: archive, templates')
      .addText(t => t.setPlaceholder('archive, templates').setValue(s.exclude).onChange(v => { s.exclude = v; p.save(true); }));
    new Setting(el).setName("Links to notes that don't exist yet")
      .setDesc('Show them as faint white stars.')
      .addToggle(t => t.setValue(s.showUnresolved).onChange(v => { s.showUnresolved = v; p.save(true); }));
    new Setting(el).setName('Turning speed')
      .setDesc('0 stops the slow turn.')
      .addSlider(sl => sl.setLimits(0, 3, 0.25).setValue(s.spin).setDynamicTooltip().onChange(v => { s.spin = v; p.save(); }));
    new Setting(el).setName('Names shown')
      .setDesc('How many of the brightest stars show their names. Hovering always shows one.')
      .addSlider(sl => sl.setLimits(0, 40, 1).setValue(s.labels).setDynamicTooltip().onChange(v => { s.labels = v; p.save(); }));
    new Setting(el).setName('Hide all names')
      .setDesc('Just the stars, for screenshots. You can also press H in the view.')
      .addToggle(t => t.setValue(s.hideNames).onChange(v => p.setHideNames(v)));
  }
}

class ConstellationPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.registerView(VIEW, leaf => new ConstellationView(leaf, this));
    this.addRibbonIcon('sparkles', 'Open star map', () => this.open());
    this.addCommand({ id: 'open', name: 'Open star map', callback: () => this.open() });
    this.addSettingTab(new ConstellationSettings(this.app, this));
  }
  views() { return this.app.workspace.getLeavesOfType(VIEW).map(l => l.view).filter(v => v instanceof ConstellationView); }
  // Save settings; redraw open views when the stars themselves change (colors, filters).
  save(redraw) {
    this.saveData(this.settings);
    if (!redraw) return;
    clearTimeout(this.redrawTimer);
    this.redrawTimer = setTimeout(() => this.views().forEach(v => v.draw()), 500);
  }
  setHideNames(on) {
    this.settings.hideNames = on;
    this.save();
    this.views().forEach(v => v.syncNames && v.syncNames());
  }
  async open() {
    const existing = this.app.workspace.getLeavesOfType(VIEW);
    const leaf = existing[0] || this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
  onunload() { clearTimeout(this.redrawTimer); this.views().forEach(v => v.sky && v.sky.destroy()); }
}

// for testing outside Obsidian
ConstellationPlugin.createConstellation = createConstellation;
ConstellationPlugin.vaultGraph = vaultGraph;
ConstellationPlugin.parseQuery = parseQuery;
module.exports = ConstellationPlugin;
