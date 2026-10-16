import * as THREE from './three.module.min.js';
const $ = id => document.getElementById(id);
const V3 = THREE.Vector3;
const isTouch = matchMedia('(pointer:coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
if (isTouch) document.body.classList.add('touch');
$('help').textContent = isTouch
  ? 'Joystick a sinistra per muoverti, trascina a destra per guardare. Tasti: Spara, Salta, Costruisci, Modifica.'
  : 'WASD muovi · Shift scatto · Mouse mira · Clic spara · Spazio salta · Q costruisci · 1/2/3 armi · F piccone · E cambia pezzo · R ricarica';

// ---------- stats ----------
const SKEY = 'isolazero_stats';
const stats = Object.assign({ partite: 0, vittorie: 0, uccisioni: 0, migliore: 0 }, JSON.parse(localStorage.getItem(SKEY) || '{}'));
function showStats() { $('stats').textContent = `Partite ${stats.partite} · Vittorie ${stats.vittorie} · Eliminazioni ${stats.uccisioni}` + (stats.migliore ? ` · Miglior piazzamento #${stats.migliore}` : ''); }
showStats();

// ---------- renderer ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouch ? 1.25 : 1.5));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd3ff);
scene.fog = new THREE.Fog(0x8fd3ff, 90, 280);
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 700);
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 1 ? 82 : 70; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
scene.add(new THREE.HemisphereLight(0xffffff, 0x4a6a3a, 1.6));
const sun = new THREE.DirectionalLight(0xfff4dd, 1.8); sun.position.set(80, 120, 40); scene.add(sun);

// ---------- seeded random ----------
let seed = (Math.random() * 1e9) | 0;
function rnd() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
const rr = (a, b) => a + rnd() * (b - a);
const lam = c => new THREE.MeshLambertMaterial({ color: c, flatShading: true });

// ---------- terrain ----------
const R = 170;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const ph1 = rr(0, 6), ph2 = rr(0, 6);
function heightAt(x, z) {
  const r = Math.hypot(x, z) / R;
  const base = 10 + 5 * Math.sin(x * 0.028 + ph1) * Math.cos(z * 0.024) + 2.5 * Math.sin(x * 0.071 + 1.3) * Math.sin(z * 0.063 + ph2)
    + 6 * Math.exp(-((x - 40) ** 2 + (z + 30) ** 2) / 1800);
  const f = 1 - smooth(0.72, 1.0, r);
  return base * f - 4 * (1 - f);
}
{
  const S = 2 * R + 120, N = 96;
  const g = new THREE.PlaneGeometry(S, S, N, N); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, cols = [], c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), h = heightAt(x, z); p.setY(i, h);
    if (h < 1.3) c.set(0xf0d98c); else if (h > 19) c.set(0x9a9a88); else { c.set(0x5cc24a); c.offsetHSL(0, 0, Math.sin(x * .3) * Math.cos(z * .27) * 0.05 - h * 0.004); }
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.computeVertexNormals();
  g.translate(0, 0, 0);
  scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  const w = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshLambertMaterial({ color: 0x2aa3dd, transparent: true, opacity: 0.85 }));
  w.rotation.x = -Math.PI / 2; w.position.y = 0.4; scene.add(w);
}

// ---------- world objects ----------
const houses = [], resources = [], pieces = [], pickups = [];
const landOK = (x, z) => { const h = heightAt(x, z); return h > 2 && h < 20 && Math.hypot(x, z) < R * 0.85; };
const houseCols = [0xff7aa2, 0xffd166, 0x7bdff2, 0xb388ff, 0xff9f43, 0x95e06c, 0xf8f8f8];
for (let tries = 0; houses.length < 14 && tries < 600; tries++) {
  const x = rr(-R * .8, R * .8), z = rr(-R * .8, R * .8);
  if (!landOK(x, z) || houses.some(h => Math.hypot(h.x - x, h.z - z) < 28)) continue;
  let lo = 1e9; for (const [dx, dz] of [[-4, -4], [4, -4], [-4, 4], [4, 4], [0, 0]]) lo = Math.min(lo, heightAt(x + dx, z + dz));
  const y = lo - 0.5, H = 5.5;
  const grp = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(8, H, 8), lam(houseCols[houses.length % houseCols.length])); body.position.y = H / 2; grp.add(body);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(9, .6, 9), lam(0x6b3e26)); roof.position.y = H + .3; grp.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.6, .1), lam(0x4a2b16)); door.position.set(0, 1.8, 4.02); grp.add(door);
  for (const s of [-1, 1]) { const win = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, .1), lam(0xbfe9ff)); win.position.set(s * 2.4, 3.3, 4.02); grp.add(win); }
  grp.position.set(x, y, z); grp.rotation.y = 0; scene.add(grp);
  houses.push({ x, z, top: y + H + .6, box: new THREE.Box3(new V3(x - 4.5, y, z - 4.5), new V3(x + 4.5, y + H + .6, z + 4.5)) });
}
const trunkG = new THREE.CylinderGeometry(.3, .45, 2.2, 5), leafG = new THREE.ConeGeometry(2, 4.5, 6), rockG = new THREE.DodecahedronGeometry(1.7, 0);
const trunkM = lam(0x8b5a2b), leafMs = [lam(0x2f9e44), lam(0x37b24d), lam(0x4caf50), lam(0x2b8a3e)], rockM = lam(0x9aa0a6);
function nearHouse(x, z, d) { return houses.some(h => Math.abs(h.x - x) < d && Math.abs(h.z - z) < d); }
for (let i = 0, t = 0; i < 150 && t < 3000; t++) {
  const x = rr(-R, R), z = rr(-R, R); if (!landOK(x, z) || nearHouse(x, z, 8)) continue;
  const g = new THREE.Group(), y = heightAt(x, z);
  const tr = new THREE.Mesh(trunkG, trunkM); tr.position.y = 1.1; g.add(tr);
  const lf = new THREE.Mesh(leafG, leafMs[i % 4]); lf.position.y = 4.2; g.add(lf);
  const s = rr(.8, 1.3); g.scale.setScalar(s); g.position.set(x, y - .2, z); g.rotation.y = rr(0, 6); scene.add(g);
  resources.push({ kind: 'tree', x, z, y, r: .55 * s, hp: 120, mesh: g, s }); i++;
}
for (let i = 0, t = 0; i < 60 && t < 2000; t++) {
  const x = rr(-R, R), z = rr(-R, R); if (!landOK(x, z) || nearHouse(x, z, 8)) continue;
  const m = new THREE.Mesh(rockG, rockM), y = heightAt(x, z), s = rr(.7, 1.4);
  m.scale.set(s * 1.2, s * .8, s); m.position.set(x, y + .3, z); m.rotation.y = rr(0, 6); scene.add(m);
  resources.push({ kind: 'rock', x, z, y, r: 1.6 * s, hp: 180, mesh: m, s }); i++;
}

// ---------- weapons & loot ----------
const WEAP = {
  p: { n: 'Pistola', ic: '🔫', dmg: 24, rate: .28, mag: 12, rel: 1.2, spread: .012, pel: 1, range: 90, len: .45, col: 0x333333 },
  a: { n: 'Fucile d\'assalto', ic: '🪖', dmg: 30, rate: .13, mag: 30, rel: 1.8, spread: .022, pel: 1, range: 150, len: 1.0, col: 0x2d3a2d },
  s: { n: 'Fucile a pompa', ic: '💥', dmg: 12, rate: .95, mag: 5, rel: 2.3, spread: .085, pel: 8, range: 35, len: .8, col: 0x5a3a1a },
};
const SLOT = { p: 0, a: 1, s: 2 }, TYPES = ['p', 'a', 's'];
const RAR = ['Comune', 'Non comune', 'Raro', 'Epico', 'Leggendario'];
const RARC = ['#b8b8b8', '#4ade80', '#38bdf8', '#c084fc', '#fbbf24'];
const pickG = new THREE.BoxGeometry(1, .35, .35), boxG = new THREE.BoxGeometry(.6, .6, .6), beamG = new THREE.CylinderGeometry(.08, .08, 3, 4);
const rarMats = RARC.map(c => new THREE.MeshBasicMaterial({ color: c }));
const beamMats = RARC.map(c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .35, depthWrite: false }));
function spawnPickup(it, x, z, y) {
  const g = new THREE.Group();
  let m;
  if (it.kind === 'w') { m = new THREE.Mesh(pickG, rarMats[it.rar]); m.scale.x = .6 + WEAP[it.wt].len * .6; const b = new THREE.Mesh(beamG, beamMats[it.rar]); b.position.y = 1.5; g.add(b); }
  else m = new THREE.Mesh(boxG, new THREE.MeshBasicMaterial({ color: it.kind === 'ammo' ? 0x8d6e63 : it.kind === 'shield' ? 0x3aa8ff : 0xff5d5d }));
  g.add(m); it.m = m;
  y = y ?? heightAt(x, z); g.position.set(x, y + .6, z); scene.add(g);
  it.g = g; it.x = x; it.z = z; it.y = y; pickups.push(it); return it;
}
function randRar() { const r = rnd(); return r < .4 ? 0 : r < .68 ? 1 : r < .87 ? 2 : r < .97 ? 3 : 4; }
function randItem() {
  const r = rnd();
  if (r < .55) return { kind: 'w', wt: TYPES[(rnd() * 3) | 0], rar: randRar() };
  if (r < .75) return { kind: 'ammo', wt: TYPES[(rnd() * 3) | 0] };
  if (r < .9) return { kind: 'shield' };
  return { kind: 'med' };
}
for (const h of houses) for (let k = 0; k < 4; k++) { const a = rr(0, 6.28), d = rr(6, 9); const x = h.x + Math.cos(a) * d, z = h.z + Math.sin(a) * d; spawnPickup(k === 0 ? { kind: 'w', wt: TYPES[(rnd() * 3) | 0], rar: randRar() } : randItem(), x, z); }
for (let i = 0, t = 0; i < 70 && t < 2000; t++) { const x = rr(-R, R), z = rr(-R, R); if (!landOK(x, z) || nearHouse(x, z, 6)) continue; spawnPickup(randItem(), x, z); i++; }

// ---------- characters ----------
const skinM = lam(0xffd2a6), pantsM = lam(0x2b2d42), headG = new THREE.BoxGeometry(.6, .6, .6), bodyG = new THREE.BoxGeometry(.9, 1, .5), limbG = new THREE.BoxGeometry(.3, .8, .3);
const gliderG = new THREE.ConeGeometry(2.4, 1, 3), gunGs = {};
for (const t of TYPES) gunGs[t] = new THREE.BoxGeometry(.16, WEAP[t].len + .3, .22);
const axeG = new THREE.BoxGeometry(.12, 1, .12), axeHeadG = new THREE.BoxGeometry(.7, .18, .18);
function makeChar(color, hat) {
  const g = new THREE.Group(), cm = lam(color);
  const body = new THREE.Mesh(bodyG, cm); body.position.y = 1.25; g.add(body);
  const head = new THREE.Mesh(headG, skinM); head.position.y = 2.05; g.add(head);
  const hatM = new THREE.Mesh(new THREE.BoxGeometry(.66, .2, .66), lam(hat)); hatM.position.y = 2.42; g.add(hatM);
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x111111 });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .02), eyeM); e.position.set(s * .14, 2.1, .31); g.add(e); }
  const limb = (x, y, mat) => { const piv = new THREE.Group(); piv.position.set(x, y, 0); const m = new THREE.Mesh(limbG, mat); m.position.y = -.4; piv.add(m); g.add(piv); return piv; };
  const lL = limb(-.22, .8, pantsM), rL = limb(.22, .8, pantsM), lA = limb(-.62, 1.7, cm), rA = limb(.62, 1.7, cm);
  const gun = new THREE.Mesh(gunGs.p, lam(0x333333)); gun.position.set(0, -.9, .12); rA.add(gun);
  const axe = new THREE.Group(); const hd = new THREE.Mesh(axeG, lam(0x8b5a2b)); axe.add(hd); const ah = new THREE.Mesh(axeHeadG, lam(0xc0c0c0)); ah.position.y = -.45; axe.add(ah); axe.position.set(0, -.9, .1); rA.add(axe);
  const glider = new THREE.Mesh(gliderG, lam(color)); glider.scale.set(1, .25, 1); glider.position.y = 3.4; glider.rotation.y = Math.PI; glider.visible = false; g.add(glider);
  return { g, lL, rL, lA, rA, gun, axe, glider };
}
const ents = [];
const NAMES = ['Zanzara', 'Pannocchia', 'Gelatone', 'Sbadiglio', 'Tornado', 'Biscotto', 'Ravanello', 'Fulmine', 'Polpetta', 'Cactus', 'Ciabatta', 'Meringa', 'Scheggia', 'Turbina', 'Brontolo'];
const BODYC = [0xff595e, 0xffca3a, 0x8ac926, 0x1982c4, 0x6a4c93, 0xff924c, 0x52a675, 0xf15bb5, 0x00bbf9, 0x9b5de5, 0xfee440, 0x00f5d4, 0xef476f, 0x118ab2, 0x8338ec];
function makeEnt(name, color, hat, isPlayer) {
  const p = makeChar(color, hat); p.g.visible = false; scene.add(p.g);
  const e = { name, isPlayer, p, pos: new V3(), vel: new V3(), yaw: 0, pitch: 0, hp: 100, sh: 0, alive: true, onGround: false, state: 'bus',
    weapons: [null, null, null], cur: -1, ammo: { p: 0, a: 0, s: 0 }, mats: isPlayer ? 30 : 60, kills: 0, fireCd: 0, reload: 0, anim: 0, swing: 0, ai: {}, place: 0 };
  ents.push(e); return e;
}
const player = makeEnt('Tu', 0xff6b1a, 0x222222, true);
for (let i = 0; i < 15; i++) {
  const b = makeEnt(NAMES[i], BODYC[i], BODYC[(i + 5) % 15], false);
  b.ai = { t: 0, goal: null, enemy: null, aim: 0, buildCd: 0, lastHit: -9, strafe: rnd() < .5 ? 1 : -1, skill: rr(.6, 1.2), stuckT: 0, last: new V3(), drop: rr(2.5, 17), land: null };
}

// ---------- bus ----------
const bus = new THREE.Group();
{
  const b = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.2, 9), lam(0x3a86ff)); b.position.y = 0; bus.add(b);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.5, .6, 9.1), lam(0xffffff)); stripe.position.y = .4; bus.add(stripe);
  const bal = new THREE.Mesh(new THREE.SphereGeometry(4.5, 10, 8), lam(0xff4d6d)); bal.position.y = 7; bal.scale.set(1, 1.1, 1.4); bus.add(bal);
  for (const s of [-1, 1]) for (const f of [-1, 1]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, 4), lam(0x333333)); r.position.set(s * 1.5, 3.2, f * 3.5); bus.add(r); }
  for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.8, .8, .5, 8), lam(0x222222)); w.rotation.z = Math.PI / 2; w.position.set(s * 1.8, -1.6, 2.8); bus.add(w); const w2 = w.clone(); w2.position.z = -2.8; bus.add(w2); }
}
scene.add(bus);
const busA = rr(0, Math.PI * 2), busDir = new V3(Math.cos(busA), 0, Math.sin(busA)), busStart = busDir.clone().multiplyScalar(-230).setY(95), BUSDUR = 21;
bus.rotation.y = Math.atan2(busDir.x, busDir.z);

// ---------- storm ----------
const PH = [{ w: 40, s: 25, r: 120, d: 1 }, { w: 30, s: 20, r: 75, d: 2 }, { w: 25, s: 20, r: 42, d: 4 }, { w: 20, s: 15, r: 20, d: 7 }, { w: 15, s: 15, r: 6, d: 10 }, { w: 10, s: 12, r: 0, d: 14 }];
const storm = { x: 0, z: 0, r: 240, fx: 0, fz: 0, fr: 240, nx: 0, nz: 0, nr: 120, i: 0, t: 0, mode: 'wait', d: 1 };
function nextCircle() {
  const p = PH[Math.min(storm.i, PH.length - 1)];
  storm.fx = storm.x; storm.fz = storm.z; storm.fr = storm.r; storm.nr = p.r; storm.d = p.d;
  const a = rr(0, 6.28), off = rr(0, Math.max(0, storm.r - p.r) * .5);
  storm.nx = storm.x + Math.cos(a) * off; storm.nz = storm.z + Math.sin(a) * off;
  const l = Math.hypot(storm.nx, storm.nz), lim = R * .55; if (l > lim) { storm.nx *= lim / l; storm.nz *= lim / l; }
  storm.mode = 'wait'; storm.t = p.w;
}
const stormMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 260, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0x9b30ff, transparent: true, opacity: .16, side: THREE.DoubleSide, depthWrite: false, fog: false }));
scene.add(stormMesh);

// ---------- build ----------
const G = 4, COST = 10, PIECES = ['wall', 'ramp', 'floor'], PNAME = { wall: 'Muro', ramp: 'Rampa', floor: 'Pavimento' };
const wallG = new THREE.BoxGeometry(4, 4, .3), floorG = new THREE.BoxGeometry(4, .25, 4), rampG = new THREE.BoxGeometry(4, .25, 5.66);
const pieceM = lam(0xc58b4e), pieceM2 = lam(0xa86f38);
const ghostM = new THREE.MeshBasicMaterial({ color: 0x4fc3ff, transparent: true, opacity: .35, depthWrite: false });
const ghosts = { wall: new THREE.Mesh(wallG, ghostM), ramp: new THREE.Mesh(rampG, ghostM), floor: new THREE.Mesh(floorG, ghostM) };
for (const k in ghosts) { ghosts[k].visible = false; ghosts[k].rotation.order = 'YXZ'; scene.add(ghosts[k]); }
function fwd(yaw) { return new V3(Math.sin(yaw), 0, Math.cos(yaw)); }
function planPiece(e, kind) {
  const f = fwd(e.yaw), ax = Math.abs(f.x) > Math.abs(f.z);
  const d = ax ? new V3(Math.sign(f.x), 0, 0) : new V3(0, 0, Math.sign(f.z));
  let y0 = e.pos.y; if (e.pitch > .35) y0 += 4;
  for (const p of pieces) if (Math.abs(p.y0 - y0) < 1.2 && Math.hypot(p.c.x - e.pos.x, p.c.z - e.pos.z) < 7) { y0 = p.y0; break; }
  let c;
  if (kind === 'wall') {
    const cx = Math.round(e.pos.x / G) * G, cz = Math.round(e.pos.z / G) * G;
    c = new V3(cx + d.x * 2, 0, cz + d.z * 2);
    if ((c.x - e.pos.x) * d.x + (c.z - e.pos.z) * d.z < .9) c.addScaledVector(d, G);
  } else {
    c = new V3(Math.round((e.pos.x + d.x * 3.2) / G) * G, 0, Math.round((e.pos.z + d.z * 3.2) / G) * G);
  }
  return { kind, c, d, y0, ax };
}
function placeMesh(m, pl) {
  m.rotation.set(0, 0, 0);
  if (pl.kind === 'wall') { m.position.set(pl.c.x, pl.y0 + 2, pl.c.z); m.rotation.y = pl.ax ? Math.PI / 2 : 0; }
  else if (pl.kind === 'floor') m.position.set(pl.c.x, pl.y0 - .125, pl.c.z);
  else { m.position.set(pl.c.x, pl.y0 + 2, pl.c.z); m.rotation.y = Math.atan2(pl.d.x, pl.d.z); m.rotation.x = -Math.PI / 4; }
}
function build(e, kind) {
  if (e.mats < COST) { if (e.isPlayer) say('Materiali insufficienti! Colpisci alberi e rocce col piccone'); return false; }
  const pl = planPiece(e, kind);
  if (pieces.some(p => p.kind === kind && Math.abs(p.y0 - pl.y0) < .5 && p.c.distanceTo(pl.c) < .5 && (kind !== 'wall' || p.ax === pl.ax))) return false;
  if (pieces.length > 320) removePiece(pieces[0]);
  const m = new THREE.Mesh(kind === 'wall' ? wallG : kind === 'floor' ? floorG : rampG, (pieces.length & 1) ? pieceM : pieceM2);
  m.rotation.order = 'YXZ'; placeMesh(m, pl); scene.add(m);
  const p = { ...pl, mesh: m, hp: 150, box: null, top: pl.y0 };
  if (kind === 'wall') p.box = pl.ax ? new THREE.Box3(new V3(pl.c.x - .15, pl.y0, pl.c.z - 2), new V3(pl.c.x + .15, pl.y0 + 4, pl.c.z + 2)) : new THREE.Box3(new V3(pl.c.x - 2, pl.y0, pl.c.z - .15), new V3(pl.c.x + 2, pl.y0 + 4, pl.c.z + .15));
  if (kind === 'floor') p.box = new THREE.Box3(new V3(pl.c.x - 2, pl.y0 - .25, pl.c.z - 2), new V3(pl.c.x + 2, pl.y0, pl.c.z + 2));
  pieces.push(p); e.mats -= COST; if (e.isPlayer) sfx(300, .05, 'square', .05); return true;
}
function removePiece(p) { scene.remove(p.mesh); const i = pieces.indexOf(p); if (i >= 0) pieces.splice(i, 1); }
function hurtPiece(p, a) { p.hp -= a; if (p.hp <= 0) removePiece(p); }

// ---------- physics ----------
function groundAt(x, z, y) {
  let g = heightAt(x, z);
  for (const h of houses) if (Math.abs(x - h.x) < 4.5 && Math.abs(z - h.z) < 4.5 && h.top <= y + .9 && h.top > g) g = h.top;
  for (const p of pieces) {
    const dx = x - p.c.x, dz = z - p.c.z;
    if (p.kind === 'floor') { if (Math.abs(dx) <= 2.1 && Math.abs(dz) <= 2.1 && p.top <= y + .9 && p.top > g) g = p.top; }
    else if (p.kind === 'ramp') {
      const al = dx * p.d.x + dz * p.d.z, ac = Math.abs(dx * p.d.z - dz * p.d.x);
      if (al >= -2.1 && al <= 2.1 && ac <= 2.05) { const s = p.y0 + Math.min(4, Math.max(0, al + 2)) + .12; if (s <= y + .9 && s > g) g = s; }
    }
  }
  return g;
}
function pushBox(e, b) {
  const r = .5;
  if (e.pos.y + 1.8 < b.min.y || e.pos.y > b.max.y - .45) return;
  const cx = Math.max(b.min.x, Math.min(e.pos.x, b.max.x)), cz = Math.max(b.min.z, Math.min(e.pos.z, b.max.z));
  const dx = e.pos.x - cx, dz = e.pos.z - cz, d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return;
  if (d2 < 1e-6) {
    const a = e.pos.x - b.min.x, bb = b.max.x - e.pos.x, c = e.pos.z - b.min.z, d = b.max.z - e.pos.z, m = Math.min(a, bb, c, d);
    if (m === a) e.pos.x = b.min.x - r; else if (m === bb) e.pos.x = b.max.x + r; else if (m === c) e.pos.z = b.min.z - r; else e.pos.z = b.max.z + r;
    return;
  }
  const d = Math.sqrt(d2); e.pos.x = cx + dx / d * r; e.pos.z = cz + dz / d * r;
}
function collide(e) {
  for (const h of houses) pushBox(e, h.box);
  for (const p of pieces) if (p.kind === 'wall') pushBox(e, p.box);
  for (const t of resources) {
    if (t.hp <= 0 || e.pos.y > t.y + (t.kind === 'tree' ? 3 : 1.5)) continue;
    const dx = e.pos.x - t.x, dz = e.pos.z - t.z, d = Math.hypot(dx, dz), m = t.r + .45;
    if (d < m && d > 1e-4) { e.pos.x = t.x + dx / d * m; e.pos.z = t.z + dz / d * m; }
  }
  const l = Math.hypot(e.pos.x, e.pos.z), lim = R + 15; if (l > lim) { e.pos.x *= lim / l; e.pos.z *= lim / l; }
}
function physics(e, dt, ix, iz, sprint, jump) {
  if (e.state === 'fall') {
    e.vel.y = Math.max(e.vel.y - 30 * dt, -40); e.vel.x = ix * 15; e.vel.z = iz * 15;
    if (e.pos.y - heightAt(e.pos.x, e.pos.z) < 38) { e.state = 'glide'; e.p.glider.visible = true; }
  } else if (e.state === 'glide') { e.vel.y = -7; e.vel.x = ix * 13; e.vel.z = iz * 13; }
  else {
    const sp = sprint ? 10.5 : 7, k = Math.min(1, dt * 12);
    e.vel.x += (ix * sp - e.vel.x) * k; e.vel.z += (iz * sp - e.vel.z) * k; e.vel.y -= 25 * dt;
    if (jump && e.onGround) { e.vel.y = 9; e.onGround = false; }
  }
  e.pos.addScaledVector(e.vel, dt);
  collide(e);
  const g = groundAt(e.pos.x, e.pos.z, e.pos.y);
  if (e.pos.y <= g || (e.state === 'ground' && e.vel.y <= 0 && e.pos.y - g < .45 && e.onGround)) {
    e.pos.y = g; if (e.vel.y < 0) e.vel.y = 0; e.onGround = true;
    if (e.state !== 'ground') { e.state = 'ground'; e.p.glider.visible = false; }
  } else e.onGround = false;
}

// ---------- combat ----------
const _ray = new THREE.Ray(), _v = new V3(), _s = new THREE.Sphere();
function hitscan(o, d, maxD, shooter) {
  _ray.set(o, d); let best = maxD, res = { type: null };
  for (const e of ents) {
    if (e === shooter || !e.alive || e.state === 'bus') continue;
    _s.center.set(e.pos.x, e.pos.y + 1.2, e.pos.z); _s.radius = .85;
    if (_ray.intersectSphere(_s, _v)) { const t = _v.distanceTo(o); if (t < best) { best = t; res = { type: 'ent', obj: e, head: _v.y > e.pos.y + 1.8 }; } }
  }
  for (const p of pieces) if (p.box && _ray.intersectBox(p.box, _v)) { const t = _v.distanceTo(o); if (t < best) { best = t; res = { type: 'piece', obj: p }; } }
  for (const h of houses) if (_ray.intersectBox(h.box, _v)) { const t = _v.distanceTo(o); if (t < best) { best = t; res = { type: 'house' }; } }
  for (let t = 1; t < best; t += 1.5) { const y = o.y + d.y * t; if (y < heightAt(o.x + d.x * t, o.z + d.z * t)) { best = t; res = { type: 'ground' }; break; } }
  res.t = best; return res;
}
const tracers = [];
const trMat = new THREE.LineBasicMaterial({ color: 0xffee88, transparent: true, opacity: .9 });
for (let i = 0; i < 40; i++) { const g = new THREE.BufferGeometry().setFromPoints([new V3(), new V3()]); const l = new THREE.Line(g, trMat); l.visible = false; l.frustumCulled = false; scene.add(l); tracers.push({ l, t: 0 }); }
let trI = 0;
function tracer(a, b) { const tr = tracers[trI++ % tracers.length]; const p = tr.l.geometry.attributes.position; p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true; tr.l.visible = true; tr.t = .06; }
function startReload(e) { const w = e.weapons[e.cur]; if (!w || e.reload > 0 || w.mag >= WEAP[w.wt].mag || e.ammo[w.wt] <= 0) return; e.reload = WEAP[w.wt].rel; }
function finishReload(e) { const w = e.weapons[e.cur]; if (!w) return; const need = WEAP[w.wt].mag - w.mag, got = Math.min(need, e.ammo[w.wt]); w.mag += got; e.ammo[w.wt] -= got; }
function shoot(e, o, dir) {
  const w = e.weapons[e.cur]; if (!w || e.reload > 0 || e.fireCd > 0) return;
  if (w.mag <= 0) { startReload(e); return; }
  const W = WEAP[w.wt]; w.mag--; e.fireCd = W.rate + (e.isPlayer ? 0 : .12);
  const mult = 1 + w.rar * .08, muzzle = new V3(e.pos.x, e.pos.y + 1.5, e.pos.z).addScaledVector(fwd(e.yaw), .9);
  for (let i = 0; i < W.pel; i++) {
    const sp = W.spread * (e.isPlayer && !e.onGround ? 2 : 1);
    const d = dir.clone().add(new V3((Math.random() - .5) * 2 * sp, (Math.random() - .5) * 2 * sp, (Math.random() - .5) * 2 * sp)).normalize();
    const h = hitscan(o, d, W.range, e), end = o.clone().addScaledVector(d, h.t);
    if (i < 3) tracer(muzzle, end);
    if (h.type === 'ent') damage(h.obj, W.dmg * mult * (h.head ? 1.5 : 1) * (e.isPlayer ? 1 : h.obj.isPlayer ? .75 : .55), e);
    else if (h.type === 'piece') hurtPiece(h.obj, W.dmg * mult);
  }
  const dd = e.pos.distanceTo(player.pos); if (dd < 60) sfx(e.isPlayer ? 140 : 110, .07, 'sawtooth', e.isPlayer ? .07 : .05 * (1 - dd / 60));
  if (w.mag <= 0) startReload(e);
}
function swing(e) {
  if (e.fireCd > 0) return; e.fireCd = .45; e.swing = .3;
  const f = fwd(e.yaw);
  let best = null, bd = 3.4;
  for (const t of resources) { if (t.hp <= 0) continue; const dx = t.x - e.pos.x, dz = t.z - e.pos.z, d = Math.hypot(dx, dz) - t.r; if (d < bd && (dx * f.x + dz * f.z) > 0) { bd = d; best = t; } }
  for (const o of ents) { if (o === e || !o.alive || o.state !== 'ground') continue; const dx = o.pos.x - e.pos.x, dz = o.pos.z - e.pos.z, d = Math.hypot(dx, dz); if (d < 2.4 && (dx * f.x + dz * f.z) / d > .5) { damage(o, 20, e); return; } }
  for (const p of pieces) { const d = p.c.distanceTo(_v.set(e.pos.x, p.c.y, e.pos.z)); if (d < 3 && Math.abs(p.y0 - e.pos.y) < 3.5 && ((p.c.x - e.pos.x) * f.x + (p.c.z - e.pos.z) * f.z) > 0) { hurtPiece(p, 50); if (e.isPlayer) sfx(200, .05, 'square', .05); return; } }
  if (!best) return;
  best.hp -= 30; e.mats = Math.min(999, e.mats + (best.kind === 'tree' ? 10 : 15));
  best.shake = .2; if (e.isPlayer) { sfx(best.kind === 'tree' ? 260 : 420, .06, 'triangle', .08); hitmark(); }
  if (best.hp <= 0) best.mesh.visible = false;
}
function damage(e, a, src) {
  if (!e.alive) return;
  if (e.sh > 0) { const s = Math.min(e.sh, a); e.sh -= s; a -= s; }
  e.hp -= a;
  if (e.isPlayer) { $('hurt').style.opacity = .7; hurtT = .25; }
  if (src && src.isPlayer) hitmark();
  if (!e.isPlayer) e.ai.lastHit = clock, e.ai.attacker = src || e.ai.attacker;
  if (e.hp <= 0) kill(e, src);
}
function kill(e, src) {
  e.alive = false; e.p.g.visible = false; e.hp = 0;
  for (let i = 0; i < 3; i++) { const w = e.weapons[i]; if (w) spawnPickup({ kind: 'w', wt: w.wt, rar: w.rar }, e.pos.x + rr(-1.5, 1.5), e.pos.z + rr(-1.5, 1.5), Math.max(e.pos.y - .6, heightAt(e.pos.x, e.pos.z))); }
  if (e.mats > 0 || true) spawnPickup({ kind: 'ammo', wt: TYPES[(rnd() * 3) | 0] }, e.pos.x, e.pos.z, Math.max(e.pos.y - .6, heightAt(e.pos.x, e.pos.z)));
  if (src) { src.kills++; feed(`${src.name} ha eliminato ${e.name}`); } else feed(`${e.name} è stato travolto dalla tempesta`);
  const left = ents.filter(x => x.alive).length;
  if (e.isPlayer) endGame(false, left + 1);
  else if (left === 1 && player.alive) endGame(true, 1);
}
function tryPickup(e) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const it = pickups[i];
    if (Math.abs(it.x - e.pos.x) > 1.7 || Math.abs(it.z - e.pos.z) > 1.7 || Math.abs(it.y - e.pos.y) > 2.5) continue;
    let took = false;
    if (it.kind === 'w') {
      const s = SLOT[it.wt], cur = e.weapons[s];
      if (!cur || cur.rar < it.rar) { e.weapons[s] = { wt: it.wt, rar: it.rar, mag: WEAP[it.wt].mag }; e.ammo[it.wt] += WEAP[it.wt].mag * 2; took = true; if (e.isPlayer) { say(`${WEAP[it.wt].n} ${RAR[it.rar].toLowerCase()} raccolta!`); if (e.cur === -1 || e.weapons[e.cur] === null) select(e, s); } else if (e.cur === -1) e.cur = s; }
    } else if (it.kind === 'ammo') { e.ammo[it.wt] += WEAP[it.wt].mag * 2; took = true; if (e.isPlayer) say(`+ munizioni ${WEAP[it.wt].n}`); }
    else if (it.kind === 'shield' && e.sh < 100) { e.sh = Math.min(100, e.sh + 50); took = true; if (e.isPlayer) say('+50 scudo'); }
    else if (it.kind === 'med' && e.hp < 100) { e.hp = Math.min(100, e.hp + 50); took = true; if (e.isPlayer) say('+50 salute'); }
    if (took) { scene.remove(it.g); pickups.splice(i, 1); if (e.isPlayer) sfx(660, .08, 'sine', .08); }
  }
}
function select(e, s) { if (s >= 0 && !e.weapons[s]) return; e.cur = s; e.reload = 0; e.fireCd = Math.max(e.fireCd, .15); }

// ---------- audio ----------
let actx = null;
function sfx(f, d, type, vol) { try { if (!actx) return; const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.value = f; o.frequency.exponentialRampToValueAtTime(f * .5, actx.currentTime + d); g.gain.value = vol; g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + d); o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + d); } catch (e) { } }

// ---------- UI helpers ----------
let msgT = 0, hurtT = 0, hitT = 0, clock = 0;
function say(t, dur = 2.2) { $('msg').textContent = t; msgT = dur; }
function hitmark() { $('cross').classList.add('hit'); hitT = .12; }
const feedList = [];
function feed(t) { feedList.unshift({ t, x: 6 }); if (feedList.length > 4) feedList.pop(); renderFeed(); }
function renderFeed() { $('feed').innerHTML = feedList.map(f => `<div>${f.t.replace(/^Tu /, '<b style="color:#ffe14d">Tu</b> ')}</div>`).join(''); }

// minimap
const mapC = $('map'), mctx = mapC.getContext('2d'), MS = 128 / (2 * R + 40);
const mapBg = document.createElement('canvas'); mapBg.width = mapBg.height = 128;
{
  const c = mapBg.getContext('2d'); c.fillStyle = '#1b6fa8'; c.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 2) for (let x = 0; x < 128; x += 2) { const wx = (x - 64) / MS, wz = (y - 64) / MS, h = heightAt(wx, wz); if (h < .4) continue; c.fillStyle = h < 1.3 ? '#f0d98c' : h > 19 ? '#9a9a88' : `hsl(110,48%,${46 - h}%)`; c.fillRect(x, y, 2, 2); }
  c.fillStyle = '#ff7aa2'; for (const h of houses) c.fillRect(64 + h.x * MS - 2, 64 + h.z * MS - 2, 4, 4);
}
function drawMap() {
  mctx.drawImage(mapBg, 0, 0);
  mctx.fillStyle = 'rgba(140,40,220,.45)'; mctx.beginPath(); mctx.rect(0, 0, 128, 128); mctx.arc(64 + storm.x * MS, 64 + storm.z * MS, Math.max(.1, storm.r * MS), 0, 7, true); mctx.fill();
  mctx.strokeStyle = '#fff'; mctx.lineWidth = 1; mctx.beginPath(); mctx.arc(64 + storm.nx * MS, 64 + storm.nz * MS, Math.max(.1, storm.nr * MS), 0, 7); mctx.stroke();
  if (phase === 'bus') { mctx.strokeStyle = '#ffe14d'; mctx.setLineDash([3, 3]); mctx.beginPath(); mctx.moveTo(64 + busStart.x * MS, 64 + busStart.z * MS); mctx.lineTo(64 - busStart.x * MS, 64 - busStart.z * MS); mctx.stroke(); mctx.setLineDash([]); }
  const px = 64 + player.pos.x * MS, pz = 64 + player.pos.z * MS;
  mctx.save(); mctx.translate(px, pz); mctx.rotate(-player.yaw); mctx.fillStyle = '#ffe14d'; mctx.beginPath(); mctx.moveTo(0, 6); mctx.lineTo(4, -4); mctx.lineTo(-4, -4); mctx.closePath(); mctx.fill(); mctx.strokeStyle = '#000'; mctx.stroke(); mctx.restore();
}
const slotEls = [...document.querySelectorAll('.slot')];
let uiT = 0;
function updateHUD() {
  $('hpb').style.width = player.hp + '%'; $('hpt').textContent = Math.ceil(player.hp);
  $('shb').style.width = player.sh + '%'; $('sht').textContent = Math.ceil(player.sh);
  $('matn').textContent = player.mats;
  $('alive').textContent = '👤 ' + ents.filter(e => e.alive).length;
  $('kills').textContent = '💀 ' + player.kills;
  $('stormtxt').textContent = storm.i >= PH.length ? '🌀 Ultimo cerchio' : storm.mode === 'wait' ? `🌀 Tempesta tra ${Math.ceil(storm.t)}s` : `🌀 Si restringe! ${Math.ceil(storm.t)}s`;
  slotEls.forEach(el => {
    const s = +el.dataset.s; el.classList.toggle('sel', s === player.cur);
    if (s >= 0) { const w = player.weapons[s]; el.style.borderColor = w ? RARC[w.rar] : '#666'; el.querySelector('small').textContent = w ? WEAP[w.wt].n.split(' ')[0] + ' ' + (s + 1) : 'vuoto ' + (s + 1); el.querySelector('i').textContent = w ? WEAP[w.wt].ic : '·'; }
  });
  const w = player.weapons[player.cur];
  $('ammo').textContent = buildMode ? '' : w ? (player.reload > 0 ? 'Ricarica…' : `${w.mag} / ${player.ammo[w.wt]}`) : '';
  $('buildinfo').textContent = buildMode ? `🧱 ${PNAME[PIECES[buildSel]]} (${COST} mat.) · ${isTouch ? 'SPARA per piazzare, MODIFICA per cambiare' : 'Clic piazza · 1/2/3 o E cambia · Q esci'}` : '';
}

// ---------- input ----------
const keys = {};
let buildMode = false, buildSel = 0, firing = false, jumpQ = false, joy = { x: 0, y: 0 }, lookId = null, joyId = null, lx = 0, ly = 0;
function look(dx, dy, s) { player.yaw -= dx * s; player.pitch = Math.max(-1.1, Math.min(1.0, player.pitch - dy * s)); }
function toggleBuild() { buildMode = !buildMode; if (!buildMode) for (const k in ghosts) ghosts[k].visible = false; }
function cyclePiece() { if (!buildMode) { buildMode = true; } else buildSel = (buildSel + 1) % 3; }
function slotKey(s) { if (buildMode) { buildSel = s; return; } select(player, s); }
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (phase !== 'play') return;
  if (e.code === 'Space') { jumpQ = true; e.preventDefault(); }
  if (e.code === 'KeyQ') toggleBuild();
  if (e.code === 'KeyE') cyclePiece();
  if (e.code === 'KeyR') startReload(player);
  if (e.code === 'KeyF') { buildMode = false; for (const k in ghosts) ghosts[k].visible = false; select(player, -1); }
  if (e.code === 'Digit1') slotKey(0); if (e.code === 'Digit2') slotKey(1); if (e.code === 'Digit3') slotKey(2);
});
addEventListener('keyup', e => { keys[e.code] = false; });
canvas.addEventListener('mousedown', e => {
  if (isTouch || phase !== 'play') return;
  if (document.pointerLockElement !== canvas) { canvas.requestPointerLock?.(); return; }
  if (e.button === 0) firing = true;
});
addEventListener('mouseup', () => { if (!isTouch) firing = false; });
addEventListener('mousemove', e => { if (document.pointerLockElement === canvas) look(e.movementX, e.movementY, .0025); });
addEventListener('wheel', e => { if (buildMode) buildSel = (buildSel + (e.deltaY > 0 ? 1 : 2)) % 3; });
slotEls.forEach(el => el.addEventListener('pointerdown', ev => { ev.stopPropagation(); const s = +el.dataset.s; if (s === -1) { buildMode = false; for (const k in ghosts) ghosts[k].visible = false; select(player, -1); } else slotKey(s); }));
const btn = (id, down, up) => { const b = $(id); b.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); down(); }, { passive: false }); b.addEventListener('touchend', e => { e.preventDefault(); e.stopPropagation(); up && up(); }, { passive: false }); };
btn('bFire', () => firing = true, () => firing = false);
btn('bJump', () => jumpQ = true);
btn('bBuild', toggleBuild);
btn('bEdit', cyclePiece);
btn('bReload', () => startReload(player));
addEventListener('touchstart', e => {
  for (const t of e.changedTouches) {
    if (t.target.closest && t.target.closest('button,.slot')) continue;
    if (t.clientX < innerWidth * .42 && joyId === null) { joyId = t.identifier; touchJoy(t); }
    else if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
  }
}, { passive: true });
function touchJoy(t) { const r = $('joy').getBoundingClientRect(); let dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2); const l = Math.hypot(dx, dy), m = 55; if (l > m) { dx *= m / l; dy *= m / l; } joy.x = dx / m; joy.y = dy / m; $('knob').style.transform = `translate(${dx}px,${dy}px)`; }
addEventListener('touchmove', e => {
  for (const t of e.changedTouches) {
    if (t.identifier === joyId) touchJoy(t);
    else if (t.identifier === lookId) { look(t.clientX - lx, t.clientY - ly, .006); lx = t.clientX; ly = t.clientY; }
  }
  e.preventDefault();
}, { passive: false });
const tend = e => { for (const t of e.changedTouches) { if (t.identifier === joyId) { joyId = null; joy.x = joy.y = 0; $('knob').style.transform = ''; } if (t.identifier === lookId) lookId = null; } };
addEventListener('touchend', tend); addEventListener('touchcancel', tend);

// ---------- bots ----------
function hasGun(b) { return b.weapons.some(w => w && (w.mag > 0 || b.ammo[w.wt] > 0)); }
function botPickWeapon(b, dist) {
  const order = dist < 10 ? [2, 1, 0] : [1, 0, 2];
  for (const s of order) { const w = b.weapons[s]; if (w && (w.mag > 0 || b.ammo[w.wt] > 0)) { if (b.cur !== s) select(b, s); return; } }
}
function randomLand(cx, cz, rad) { for (let i = 0; i < 20; i++) { const a = rr(0, 6.28), d = rr(0, rad), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d; if (landOK(x, z)) return new V3(x, 0, z); } return new V3(cx * .5, 0, cz * .5); }
function botAI(b, dt) {
  const ai = b.ai; ai.t -= dt; ai.buildCd -= dt;
  if (b.state === 'fall' || b.state === 'glide') {
    const dx = ai.land.x - b.pos.x, dz = ai.land.z - b.pos.z, l = Math.hypot(dx, dz);
    b.yaw = Math.atan2(dx, dz); physics(b, dt, l > 2 ? dx / l : 0, l > 2 ? dz / l : 0, false, false); return;
  }
  if (ai.t <= 0) {
    ai.t = .35 + rnd() * .4;
    ai.enemy = null; let bd = (clock < 25 ? 12 : 38) * ai.skill;
    for (const e of ents) if (e !== b && e.alive && e.state === 'ground') { const d = e.pos.distanceTo(b.pos); if (d < bd) { bd = d; ai.enemy = e; } }
    if (ai.attacker && ai.attacker.alive && clock - ai.lastHit < 3) ai.enemy = ai.attacker;
    const sd = Math.hypot(b.pos.x - storm.nx, b.pos.z - storm.nz);
    const gun = hasGun(b);
    if (sd > storm.nr * .85 + 3 && (storm.mode === 'shrink' || storm.t < 15 || Math.hypot(b.pos.x - storm.x, b.pos.z - storm.z) > storm.r - 5)) ai.goal = randomLand(storm.nx, storm.nz, Math.max(2, storm.nr * .5)), ai.mode = 'storm';
    else if (!gun || (rnd() < .15 && ai.mode !== 'loot')) {
      let best = null, bdd = gun ? 35 : 120;
      for (const it of pickups) { const d = Math.hypot(it.x - b.pos.x, it.z - b.pos.z); if (d < bdd && (it.kind === 'w' ? (!b.weapons[SLOT[it.wt]] || b.weapons[SLOT[it.wt]].rar < it.rar) : true)) { bdd = d; best = it; } }
      if (best) { ai.goal = new V3(best.x, 0, best.z); ai.mode = 'loot'; }
    }
    if (!ai.goal || Math.hypot(ai.goal.x - b.pos.x, ai.goal.z - b.pos.z) < 2) { ai.goal = randomLand(storm.nx, storm.nz, Math.max(4, storm.nr * .7)); ai.mode = 'roam'; }
    if (b.pos.distanceTo(ai.last) < .8 && b.onGround) { ai.stuckT++; if (ai.stuckT > 2) { ai.goal = randomLand(b.pos.x, b.pos.z, 25); ai.stuckT = 0; ai.jump = true; } } else ai.stuckT = 0;
    ai.last.copy(b.pos);
    if (rnd() < .1) ai.strafe *= -1;
  }
  let ix = 0, iz = 0, sprint = false, jump = !!ai.jump; ai.jump = false;
  const en = ai.enemy && ai.enemy.alive ? ai.enemy : null;
  const gun = hasGun(b);
  if (en && gun && ai.mode !== 'storm') {
    const dx = en.pos.x - b.pos.x, dz = en.pos.z - b.pos.z, d = Math.hypot(dx, dz);
    b.yaw = Math.atan2(dx, dz); botPickWeapon(b, d);
    const fx = dx / d, fz = dz / d; ix = -fz * ai.strafe * .7; iz = fx * ai.strafe * .7;
    const want = b.cur === 2 ? 6 : 22; if (d > want) { ix += fx; iz += fz; } else if (d < want * .5) { ix -= fx * .5; iz -= fz * .5; }
    ai.aim += dt;
    if (ai.aim > 1.1 / ai.skill) {
      const w = b.weapons[b.cur];
      if (w && w.mag <= 0) startReload(b);
      const o = new V3(b.pos.x, b.pos.y + 1.5, b.pos.z), tgt = new V3(en.pos.x, en.pos.y + 1.2, en.pos.z), dir = tgt.sub(o).normalize();
      const err = (.03 + d * .0012) / ai.skill * (en.isPlayer ? 1.25 : 1);
      dir.x += (rnd() - .5) * err * 2; dir.y += (rnd() - .5) * err * 2; dir.z += (rnd() - .5) * err * 2; dir.normalize();
      if (en.isPlayer || d < 60) shoot(b, o, dir);
    }
    if (clock - ai.lastHit < .4 && ai.buildCd <= 0 && b.mats >= COST && rnd() < .6) { build(b, 'wall'); ai.buildCd = rr(4, 8); ai.strafe *= -1; }
    if (rnd() < dt * .4) jump = true;
  } else {
    ai.aim = 0;
    if (ai.goal) { const dx = ai.goal.x - b.pos.x, dz = ai.goal.z - b.pos.z, l = Math.hypot(dx, dz) || 1; ix = dx / l; iz = dz / l; b.yaw = Math.atan2(dx, dz); sprint = ai.mode === 'storm' || l > 30; }
    const w = b.weapons[b.cur]; if (w && w.mag < WEAP[w.wt].mag) startReload(b);
  }
  const l = Math.hypot(ix, iz); if (l > 1) { ix /= l; iz /= l; }
  physics(b, dt, ix, iz, sprint, jump);
}

// ---------- animation ----------
function animate(e, dt) {
  const g = e.p.g; g.position.copy(e.pos); g.rotation.y = e.yaw;
  const sp = Math.hypot(e.vel.x, e.vel.z);
  if (e.state === 'ground') {
    if (e.onGround) { e.anim += dt * sp * 1.6; const a = Math.sin(e.anim) * Math.min(1, sp / 7) * .9; e.p.lL.rotation.x = a; e.p.rL.rotation.x = -a; e.p.lA.rotation.x = -a * .8; }
    else { e.p.lL.rotation.x = -.6; e.p.rL.rotation.x = .3; e.p.lA.rotation.x = -2.6; }
  } else { e.p.lL.rotation.x = .2; e.p.rL.rotation.x = -.2; e.p.lA.rotation.x = -2.9; }
  const w = e.weapons[e.cur];
  e.p.gun.visible = !!w; e.p.axe.visible = !w;
  if (w && e.p.gun.geometry !== gunGs[w.wt]) { e.p.gun.geometry = gunGs[w.wt]; e.p.gun.material.color.set(RARC[w.rar]).multiplyScalar(.6); }
  if (w) e.p.rA.rotation.x = -Math.PI / 2 - (e.isPlayer ? e.pitch * .6 : 0) + (e.reload > 0 ? .6 : 0);
  else if (e.swing > 0) e.p.rA.rotation.x = -2.6 + (1 - e.swing / .3) * 2.6;
  else e.p.rA.rotation.x = e.state === 'ground' ? -Math.sin(e.anim) * .6 : -2.9;
  if (e.state !== 'ground') { e.p.glider.visible = e.state === 'glide'; }
}

// ---------- game flow ----------
let phase = 'menu', busT = 0;
const camPos = new V3(), camLook = new V3();
function dropOut(e) { e.state = 'fall'; e.pos.copy(bus.position).add(new V3(0, -3, 0)); e.vel.set(0, 0, 0); e.p.g.visible = true; if (!e.isPlayer) { e.yaw = rr(0, 6.28); } }
function startGame() {
  phase = 'bus'; busT = 0;
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden');
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { }
  stats.partite++; localStorage.setItem(SKEY, JSON.stringify(stats));
  for (const b of ents) if (!b.isPlayer) { const along = (b.ai.drop / BUSDUR) * 460 - 230; const x = busDir.x * along, z = busDir.z * along; b.ai.land = rnd() < .5 && houses.length ? (() => { const h = houses[(rnd() * houses.length) | 0]; return new V3(h.x + rr(-8, 8), 0, h.z + rr(-8, 8)); })() : randomLand(x, z, 45); }
  nextCircle();
  say(isTouch ? 'Sei sul bus volante! Tocca SALTA per lanciarti' : 'Sei sul bus volante! Premi SPAZIO per lanciarti', 5);
}
function endGame(win, place) {
  if (phase === 'end') return; phase = 'end';
  stats.uccisioni += player.kills; if (win) stats.vittorie++; if (!stats.migliore || place < stats.migliore) stats.migliore = place;
  localStorage.setItem(SKEY, JSON.stringify(stats));
  setTimeout(() => {
    document.exitPointerLock?.();
    $('endT').textContent = win ? '#1 Vittoria Royale!' : `Eliminato! Sei arrivato #${place}`;
    $('endS').textContent = `Eliminazioni: ${player.kills} · Partite: ${stats.partite} · Vittorie totali: ${stats.vittorie}`;
    $('end').classList.remove('hidden');
  }, win ? 600 : 1200);
}
$('play').addEventListener('click', startGame);
$('again').addEventListener('click', () => location.reload());

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (phase === 'menu') {
    const a = now * .00005; camera.position.set(Math.cos(a) * 200, 80, Math.sin(a) * 200); camera.lookAt(0, 5, 0); renderer.render(scene, camera); return;
  }
  clock += dt;
  // bus
  if (phase === 'bus' || busT < BUSDUR + 2) {
    busT += dt; bus.position.copy(busStart).addScaledVector(busDir, Math.min(busT, BUSDUR + 2) / BUSDUR * 460);
    bus.visible = busT < BUSDUR + 2;
    for (const b of ents) if (!b.isPlayer && b.state === 'bus' && (busT > b.ai.drop || busT > BUSDUR)) dropOut(b);
    if (phase === 'bus') { player.pos.copy(bus.position); const over = Math.hypot(bus.position.x, bus.position.z) < R + 10; if (jumpQ && !over) { jumpQ = false; say('Aspetta di essere sopra l\'isola!'); } if ((jumpQ && over) || busT > BUSDUR || (!over && busT > BUSDUR / 2)) { jumpQ = false; dropOut(player); player.yaw = Math.atan2(busDir.x, busDir.z); phase = 'play'; say('Plana verso un punto sicuro!'); } }
  }
  // storm
  if (storm.i < PH.length) {
    storm.t -= dt;
    if (storm.mode === 'wait' && storm.t <= 0) { storm.mode = 'shrink'; storm.t = PH[storm.i].s; if (phase === 'play') say('🌀 La tempesta si sta restringendo!'); }
    else if (storm.mode === 'shrink') {
      const p = PH[storm.i], k = 1 - Math.max(0, storm.t) / p.s;
      storm.x = storm.fx + (storm.nx - storm.fx) * k; storm.z = storm.fz + (storm.nz - storm.fz) * k; storm.r = storm.fr + (storm.nr - storm.fr) * k;
      if (storm.t <= 0) { storm.i++; if (storm.i < PH.length) nextCircle(); }
    }
  }
  stormMesh.position.set(storm.x, 60, storm.z); stormMesh.scale.set(Math.max(.1, storm.r), 1, Math.max(.1, storm.r));
  // player
  if (phase === 'play' && player.alive) {
    let fi = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) - joy.y, ri = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + joy.x;
    const f = fwd(player.yaw), r = new V3(-Math.cos(player.yaw), 0, Math.sin(player.yaw));
    let ix = f.x * fi + r.x * ri, iz = f.z * fi + r.z * ri; const l = Math.hypot(ix, iz); if (l > 1) { ix /= l; iz /= l; }
    const sprint = keys.ShiftLeft || keys.ShiftRight || Math.hypot(joy.x, joy.y) > .92;
    physics(player, dt, ix, iz, sprint, jumpQ); jumpQ = false;
    if (player.state === 'ground') tryPickup(player);
    // aim
    const d = new V3(Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), Math.cos(player.yaw) * Math.cos(player.pitch));
    if (buildMode && player.state === 'ground') {
      const kind = PIECES[buildSel], pl = planPiece(player, kind);
      for (const k in ghosts) ghosts[k].visible = k === kind; placeMesh(ghosts[kind], pl);
      if (firing && player.fireCd <= 0) { if (build(player, kind)) player.fireCd = .15; else player.fireCd = .3; }
    } else {
      for (const k in ghosts) ghosts[k].visible = false;
      if (firing && player.state === 'ground') {
        if (player.cur === -1 || !player.weapons[player.cur]) swing(player);
        else { const o = camera.position.clone(), head = new V3(player.pos.x, player.pos.y + 1.6, player.pos.z); o.addScaledVector(d, Math.max(0, head.clone().sub(o).dot(d))); shoot(player, o, d); }
      }
    }
  }
  // timers
  for (const e of ents) {
    if (!e.alive) continue;
    e.fireCd -= dt; e.swing -= dt;
    if (e.reload > 0) { e.reload -= dt; if (e.reload <= 0) { e.reload = 0; finishReload(e); } }
    if (!e.isPlayer && e.state !== 'bus') { botAI(e, dt); if (e.state === 'ground') tryPickup(e); }
    if (e.state !== 'bus' && Math.hypot(e.pos.x - storm.x, e.pos.z - storm.z) > storm.r && e.state === 'ground') { e.hp -= storm.d * dt; if (e.isPlayer) { hurtT = Math.max(hurtT, .05); } if (e.hp <= 0) kill(e, null); }
    if (e.alive && e.state !== 'bus') animate(e, dt);
  }
  const inStorm = player.alive && phase === 'play' && Math.hypot(player.pos.x - storm.x, player.pos.z - storm.z) > storm.r;
  $('stormfx').style.opacity = inStorm ? 1 : 0;
  // resources shake, pickups spin
  for (const t of resources) if (t.shake > 0) { t.shake -= dt; t.mesh.rotation.z = Math.sin(t.shake * 60) * .06; }
  const sp = clock * 2; for (const it of pickups) { it.m.rotation.y = sp; it.m.position.y = Math.sin(sp + it.x) * .15; }
  for (const tr of tracers) if (tr.t > 0) { tr.t -= dt; if (tr.t <= 0) tr.l.visible = false; }
  // camera
  if (phase === 'bus') {
    const a = player.yaw; camPos.set(bus.position.x - Math.sin(a) * 22, bus.position.y + 8, bus.position.z - Math.cos(a) * 22);
    camera.position.lerp(camPos, .15); camera.lookAt(bus.position);
  } else if (player.alive || phase === 'end') {
    const p = player.pitch, a = player.yaw, d = new V3(Math.sin(a) * Math.cos(p), Math.sin(p), Math.cos(a) * Math.cos(p));
    const r = new V3(-Math.cos(a), 0, Math.sin(a)), dist = player.state === 'ground' ? (camera.aspect < 1 ? 6.2 : 4.6) : 9;
    camPos.set(player.pos.x, player.pos.y + 2.1, player.pos.z).addScaledVector(r, player.state === 'ground' ? .9 : 0).addScaledVector(d, -dist);
    const gh = heightAt(camPos.x, camPos.z) + .4; if (camPos.y < gh) camPos.y = gh;
    camera.position.copy(camPos); camLook.copy(camPos).add(d); camera.lookAt(camLook);
  }
  // ui
  if (msgT > 0) { msgT -= dt; if (msgT <= 0) $('msg').textContent = ''; }
  if (hurtT > 0) { hurtT -= dt; if (hurtT <= 0) $('hurt').style.opacity = 0; else $('hurt').style.opacity = Math.max(+$('hurt').style.opacity, .35); }
  if (hitT > 0) { hitT -= dt; if (hitT <= 0) $('cross').classList.remove('hit'); }
  for (const f of feedList) f.x -= dt; if (feedList.length && feedList[feedList.length - 1].x <= 0) { feedList.pop(); renderFeed(); }
  uiT -= dt; if (uiT <= 0) { uiT = .1; updateHUD(); drawMap(); }
  renderer.render(scene, camera);
}
requestAnimationFrame(loop);
window.__game = { player, ents, storm, get phase() { return phase; } };
