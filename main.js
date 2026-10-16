import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
const $ = id => document.getElementById(id);
const V3 = THREE.Vector3;
const isTouch = matchMedia('(pointer:coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
if (isTouch) document.body.classList.add('touch');
$('help').textContent = isTouch
  ? 'Gira il telefono in orizzontale. Joystick a sinistra per muoverti, trascina a destra per guardare. Tasti: Spara, Salta, Costruisci, Modifica, Super, Copertura.'
  : 'WASD muovi · Shift scatto · Mouse mira · Clic spara · Spazio salta · Q costruisci · 1/2/3 armi · F piccone · E cambia pezzo · R ricarica · G super · C copertura';

// ---------- qualità ----------
const QK = 'isolazero_q';
let Q = localStorage.getItem(QK); if (!['basso', 'medio', 'alto'].includes(Q)) Q = isTouch ? 'medio' : 'alto';
const dpr = devicePixelRatio || 1;
const QS = {
  basso: { pr: 1, sh: 0, grass: 0, bloom: false, terrN: 120, light: false },
  medio: { pr: 1.25, sh: isTouch ? 1024 : 2048, grass: isTouch ? 6000 : 14000, bloom: false, terrN: 170, light: true },
  alto: { pr: isTouch ? 1.5 : 2, sh: isTouch ? 1536 : 4096, grass: isTouch ? 12000 : 30000, bloom: !isTouch, terrN: 220, light: true },
}[Q];
document.querySelectorAll('#qual span').forEach(s => { s.classList.toggle('on', s.dataset.q === Q); s.addEventListener('click', () => { if (s.dataset.q !== Q) { localStorage.setItem(QK, s.dataset.q); location.reload(); } }); });

// ---------- stats ----------
const SKEY = 'isolazero_stats';
const stats = Object.assign({ partite: 0, vittorie: 0, uccisioni: 0, migliore: 0 }, JSON.parse(localStorage.getItem(SKEY) || '{}'));
function showStats() { $('stats').textContent = `Partite ${stats.partite} · Vittorie ${stats.vittorie} · Eliminazioni ${stats.uccisioni}` + (stats.migliore ? ` · Miglior piazzamento #${stats.migliore}` : ''); }
showStats();

// ---------- renderer ----------
const POST = !isTouch && Q !== 'basso', AO = POST && Q === 'alto';
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !POST && Q !== 'basso', powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(dpr, QS.pr));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.62;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = QS.sh > 0; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const FOGC = 0xb4c6d6;
scene.fog = new THREE.Fog(FOGC, 90, 460);
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1200);
let composer = null, bloom = null, fxaa = null, ssao = null;
if (POST) {
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.28, 0.5, 0.9); composer.addPass(bloom);
  composer.addPass(new OutputPass());
  fxaa = new ShaderPass(FXAAShader); composer.addPass(fxaa);
}
function resize() {
  renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1 ? 82 : isTouch ? 74 : 70; camera.updateProjectionMatrix();
  if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight); const pr = renderer.getPixelRatio(); fxaa.material.uniforms.resolution.value.set(1 / (innerWidth * pr), 1 / (innerHeight * pr)); }
  if (pv) { pv.cam.aspect = innerWidth / innerHeight; pv.cam.updateProjectionMatrix(); }
}
let pv = null;
addEventListener('resize', resize); resize();

// ---------- asset (CC0 / CC-BY, vedi CREDITS.md) ----------
$('play').disabled = true; $('play').textContent = 'Caricamento…';
const gltfL = new GLTFLoader(), texL = new THREE.TextureLoader(), T = {}, TM = {};
const maxAni = Math.min(Q === 'basso' ? 2 : 8, renderer.capabilities.getMaxAnisotropy());
function texMean(img) { const c = document.createElement('canvas'); c.width = c.height = 8; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 8, 8); const d = x.getImageData(0, 0, 8, 8).data; let r = 0, g = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; } const l = v => Math.pow(v / 64 / 255, 2.2); return new V3(l(r), l(g), l(b)); }
const ldTex = (n, k) => texL.loadAsync(`assets/tex/${n}_${k}.jpg`).then(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAni; if (k === 'col') { t.colorSpace = THREE.SRGBColorSpace; TM[n] = texMean(t.image); } T[n + '_' + k] = t; });
const HERO_FILES = ['assets/chars/swat.glb', 'assets/chars/casual.glb', 'assets/chars/soldier.glb'];
const [hdrTex, pineGl, rockGl, ...charGl] = await Promise.all([
  new RGBELoader().loadAsync('assets/hdri/kloofendal_1k.hdr'), gltfL.loadAsync('assets/pine.glb'), gltfL.loadAsync('assets/rock.glb'), ...HERO_FILES.map(u => gltfL.loadAsync(u)),
  ...['grass', 'ground', 'rock', 'bark', 'wood'].flatMap(n => ['col', 'nor', 'rgh'].map(k => ldTex(n, k)))]);
charGl.length = 3;
const CHARS = charGl.map(gl => {
  const sc = gl.scene; sc.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(sc), h = bb.max.y - bb.min.y;
  const clips = {}; for (const c of gl.animations) clips[c.name.split('|').pop()] = c;
  sc.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; const m = o.material; m.roughness = Math.max(.55, m.roughness ?? .8); m.metalness = Math.min(.1, m.metalness ?? 0); } });
  return { scene: sc, s: 1.8 / h, y0: -bb.min.y * 1.8 / h, clips };
});
const HEROES = [
  { n: 'Lampo Ferretti', ruolo: 'Il veloce', d: 'Spaccone simpatico, non sta mai fermo. «Ero già qui. Tu da dove arrivi?»', sp: 'Scia: 3 s al doppio della velocità', m: 1, hp: 85, spd: 1.15, w: 'p', col: 0xffe14d, cd: 20,
    tint: { White: 0xf5e03a, Orange: 0x3a3d42, Grey: 0xff7a1a, Brown: 0xff7a1a, Hair_Blond: 0x3b2a1a } },
  { n: 'Nonna Rocca', ruolo: 'La tank', d: 'Burbera ma protettiva, non indietreggia mai. «Dietro di me, tesoro. Ci penso io.»', sp: 'Muro di Casa: muro di pietra istantaneo e +10% salute', m: 2, hp: 130, spd: 0.9, w: 's', col: 0x2f6b3a, cd: 30,
    tint: { Swat: 0x2f5a34, Black: 0x8a1f1f, Grey: 0xc7c2b5, Hair_Brown: 0xd9d9d9, Brown: 0xb02020 } },
  { n: 'Ago Morelli', ruolo: 'La cecchina', d: 'Calma, silenziosa, ironica. Studia l\'isola dall\'alto. «Un respiro. Un colpo.»', sp: 'Occhio d\'Ago: 4 s di mira perfetta e danni doppi', m: 0, hp: 100, spd: 1.0, w: 'a', col: 0x5a3a8a, cd: 35,
    tint: { Swat: 0x26244a, Swat_Black: 0x4a2a6a, Visor: 0xffb000 } },
];
for (const H of HEROES) CHARS[H.m].scene.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) if (H.tint[m.name] !== undefined) m.color.setHex(H.tint[m.name]); });
const HK = 'isolazero_hero';
let heroSel = Math.min(2, Math.max(0, +localStorage.getItem('isolazero_hero3') || 0));


// sky + luci
const sunDir = new V3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 38), THREE.MathUtils.degToRad(210));
hdrTex.mapping = THREE.EquirectangularReflectionMapping;
scene.background = hdrTex; scene.backgroundIntensity = 0.9; scene.environmentIntensity = 1;
{ const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromEquirectangular(hdrTex).texture; pm.dispose(); }
const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x55683a, 0.45); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d6, 3.0); sun.position.copy(sunDir).multiplyScalar(150); scene.add(sun); scene.add(sun.target);
if (QS.sh) {
  sun.castShadow = true; sun.shadow.mapSize.set(QS.sh, QS.sh);
  const c = sun.shadow.camera, S = Q === 'alto' ? 70 : 55; c.left = -S; c.right = S; c.top = S; c.bottom = -S; c.near = 10; c.far = 360;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
}
function aimSun(x, z) {
  const S = sun.shadow.camera.right * 2 / (QS.sh || 1024); x = Math.round(x / S) * S; z = Math.round(z / S) * S;
  sun.target.position.set(x, 0, z); sun.position.set(x, 0, z).addScaledVector(sunDir, 180);
}
const flashLight = QS.light ? new THREE.PointLight(0xffb45a, 0, 14, 2) : null; if (flashLight) scene.add(flashLight);

// ---------- seeded random ----------
let seed = (Math.random() * 1e9) | 0;
function rnd() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
const rr = (a, b) => a + rnd() * (b - a);
const mcache = {};
function std(c, rough = .85, metal = 0, extra) { const k = c + '_' + rough + '_' + metal + (extra ? JSON.stringify(extra) : ''); return mcache[k] || (mcache[k] = new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: rough, metalness: metal }, extra || {}))); }
const shadow = (m, cast = true, recv = true) => { m.castShadow = cast; m.receiveShadow = recv; return m; };

// ---------- rumore / terreno ----------
const R = 170;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const ph1 = rr(0, 6), ph2 = rr(0, 6), nOff = rr(0, 1000);
function hash(x, y) { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
function fbm(x, y) { let s = 0, a = .5, f = 1; for (let i = 0; i < 4; i++) { s += a * vnoise(x * f + nOff, y * f - nOff); f *= 2.03; a *= .5; } return s / .9375; }
function heightAt(x, z) {
  const r = Math.hypot(x, z) / R;
  const n = fbm(x * .011, z * .011);
  const base = 9 + 5 * Math.sin(x * 0.028 + ph1) * Math.cos(z * 0.024) + 2 * Math.sin(x * 0.071 + 1.3) * Math.sin(z * 0.063 + ph2)
    + 7 * Math.exp(-((x - 40) ** 2 + (z + 30) ** 2) / 1800) + (n - .5) * 9;
  const f = 1 - smooth(0.70, 1.0, r + (n - .5) * .08);
  return base * f - 4 * (1 - f);
}
const timeU = { value: 0 };
// AO finto: mappa d'occlusione dipinta sotto alberi, rocce e case (più dettagliata su Alto)
const AON = Q === 'alto' ? 1024 : 512, AOS = 2 * R + 140, aoC = document.createElement('canvas'); aoC.width = aoC.height = AON;
const aoX = aoC.getContext('2d'); aoX.fillStyle = '#fff'; aoX.fillRect(0, 0, AON, AON);
const aoTex = new THREE.CanvasTexture(aoC); aoTex.flipY = false;
function aoPaint(x, z, r, k) { const px = (x / AOS + .5) * AON, pz = (z / AOS + .5) * AON, pr = r / AOS * AON; const g = aoX.createRadialGradient(px, pz, 0, px, pz, pr); g.addColorStop(0, `rgba(0,0,0,${k})`); g.addColorStop(1, 'rgba(0,0,0,0)'); aoX.fillStyle = g; aoX.fillRect(px - pr, pz - pr, pr * 2, pr * 2); }
{
  const S = 2 * R + 140, N = QS.terrN;
  const g = new THREE.PlaneGeometry(S, S, N, N); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  const nr = g.attributes.normal, cols = new Float32Array(p.count * 3), c = new THREE.Color(), c2 = new THREE.Color();
  const sand = new THREE.Color(0xd9c38f), wet = new THREE.Color(0x9c8a62), g1 = new THREE.Color(0x4f8a2e), g2 = new THREE.Color(0x7a9a3a), dry = new THREE.Color(0xa59a55), rock = new THREE.Color(0x7d7a72), dirt = new THREE.Color(0x6b5a3e);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), h = p.getY(i), ny = nr.getY(i), n1 = fbm(x * .05, z * .05), n2 = vnoise(x * .4, z * .4);
    c.copy(g1).lerp(g2, smooth(.35, .7, n1)); c.lerp(dry, smooth(.62, .8, fbm(x * .02 + 9, z * .02)) * .7);
    c.lerp(dirt, smooth(.8, .7, ny) * .6);
    c.lerp(rock, Math.max(smooth(.82, .7, ny), smooth(17, 21, h)));
    c2.copy(wet).lerp(sand, smooth(-.5, 1, h)); c.lerp(c2, 1 - smooth(1.2, 2.6, h + (n2 - .5) * .6));
    c.multiplyScalar(.9 + n2 * .2);
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const tw = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const h = p.getY(i), ny = nr.getY(i); const wr = Math.max(smooth(.82, .7, ny), smooth(17, 21, h)), sand = 1 - smooth(1.2, 2.6, h), wd = Math.min(1 - wr, smooth(.8, .7, ny) * .6 + sand); tw[i * 3] = Math.max(0, 1 - wr - wd); tw[i * 3 + 1] = wd; tw[i * 3 + 2] = wr; }
  g.setAttribute('tw', new THREE.BufferAttribute(tw, 3));
  const tmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, metalness: 0 });
  tmat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { tG: { value: T.grass_col }, tD: { value: T.ground_col }, tR: { value: T.rock_col }, mG: { value: TM.grass }, mD: { value: TM.ground }, mR: { value: TM.rock }, nG: { value: T.grass_nor }, nR: { value: T.rock_nor }, tAO: { value: aoTex }, aoS: { value: AOS } });
    sh.vertexShader = 'attribute vec3 tw; varying vec3 vTw; varying vec3 vWp;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvTw = tw; vWp = (modelMatrix * vec4(position, 1.)).xyz;');
    sh.fragmentShader = 'uniform sampler2D tG, tD, tR, nG, nR, tAO; uniform float aoS; uniform vec3 mG, mD, mR; varying vec3 vTw; varying vec3 vWp;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 u1 = vWp.xz * .28; float fd = smoothstep(40., 140., length(vWp - cameraPosition));
        vec3 tg = texture2D(tG, u1).rgb / mG, td = texture2D(tD, u1 * .7).rgb / mD, tr = texture2D(tR, u1 * .4).rgb / mR;
        vec3 big = texture2D(tD, vWp.xz * .021).rgb / mD;
        vec3 det = tg * vTw.x + td * vTw.y + tr * vTw.z;
        diffuseColor.rgb *= mix(det, vec3(1.), fd * .6) * mix(1., dot(big, vec3(.333)), .3) * texture2D(tAO, vWp.xz / aoS + .5).r;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec3 nt = (texture2D(nG, u1).xyz * 2. - 1.) * vTw.x + (texture2D(nR, u1 * .4).xyz * 2. - 1.) * vTw.z; nt.xy *= (1. - fd) * .9;
          vec3 wn = normalize(vec3(nt.x, 0., -nt.y)); normal = normalize(normal + (viewMatrix * vec4(wn, 0.)).xyz); }`);
  };
  const terr = new THREE.Mesh(g, tmat);
  terr.receiveShadow = true; scene.add(terr);
  // acqua animata
  const wg = new THREE.PlaneGeometry(2400, 2400, 120, 120); wg.rotateX(-Math.PI / 2);
  const wm = new THREE.MeshStandardMaterial({ color: 0x1b6a88, roughness: .08, metalness: .1, transparent: true, opacity: .84, envMapIntensity: 1.2 });
  wm.onBeforeCompile = s => {
    s.uniforms.uTime = timeU;
    s.vertexShader = 'uniform float uTime;\n' + s.vertexShader
      .replace('#include <beginnormal_vertex>', `
        vec2 wp = position.xz; float t = uTime;
        float a1 = wp.x*.08+t*1.1, a2 = (wp.x+wp.y)*.13+t*1.7, a3 = wp.y*.104+t*.9, a4 = (wp.x-wp.y)*.37+t*2.3;
        float hdx = cos(a1)*.08*.35 + cos(a2)*.13*.2 + cos(a4)*.37*.04;
        float hdz = cos(a2)*.13*.2 + cos(a3)*.104*.3 - cos(a4)*.37*.04;
        vec3 objectNormal = normalize(vec3(-hdx, 1.0, -hdz));
        #ifdef USE_TANGENT
        vec3 objectTangent = vec3( tangent.xyz );
        #endif`)
      .replace('#include <begin_vertex>', `vec3 transformed = position; transformed.y += sin(a1)*.35 + sin(a2)*.2 + sin(a3)*.3 + sin(a4)*.04;`);
  };
  const w = new THREE.Mesh(wg, wm); w.position.y = 0.4; w.receiveShadow = true; scene.add(w);
}
// erba instanziata
if (QS.grass) {
  const bl = [], cl = [];
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * Math.PI + rr(0, .5), ox = rr(-.3, .3), oz = rr(-.3, .3), h = rr(.35, .7), wd = .06, ca = Math.cos(a) * wd, sa = Math.sin(a) * wd, lean = rr(-.12, .12);
    bl.push(ox - ca, 0, oz - sa, ox + ca, 0, oz + sa, ox + lean, h, oz + lean * .5);
    cl.push(.12, .25, .05, .12, .25, .05, .55, .75, .25);
  }
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(bl, 3)); gg.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
  gg.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(bl.length / 3).fill(0).flatMap(() => [0, 1, 0]), 3));
  const gm = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
  gm.onBeforeCompile = s => { s.uniforms.uTime = timeU; s.vertexShader = 'uniform float uTime;\n' + s.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = position;
    #ifdef USE_INSTANCING
    float ph = instanceMatrix[3].x*.21 + instanceMatrix[3].z*.17;
    #else
    float ph = 0.;
    #endif
    transformed.x += sin(uTime*1.8+ph)*position.y*.22; transformed.z += cos(uTime*1.3+ph)*position.y*.12;`); };
  const im = new THREE.InstancedMesh(gg, gm, QS.grass), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new V3(), ps = new V3(), col = new THREE.Color();
  let n = 0;
  for (let t = 0; n < QS.grass && t < QS.grass * 6; t++) {
    const x = rr(-R, R), z = rr(-R, R), h = heightAt(x, z);
    if (h < 2 || h > 17) continue;
    const sl = Math.abs(heightAt(x + 1, z) - h) + Math.abs(heightAt(x, z + 1) - h); if (sl > .7) continue;
    if (fbm(x * .03, z * .03) < .38) continue;
    q.setFromAxisAngle(ps.set(0, 1, 0), rr(0, 6.28)); const s = rr(.8, 1.7); sc.set(s, s * rr(.8, 1.3), s);
    m4.compose(ps.set(x, h - .05, z), q, sc); im.setMatrixAt(n, m4);
    col.setHSL(rr(.2, .27), rr(.4, .6), rr(.55, .8)); im.setColorAt(n, col); n++;
  }
  im.count = n; im.receiveShadow = QS.sh > 0 && Q === 'alto'; im.frustumCulled = false; scene.add(im);
}

// ---------- world objects ----------
const houses = [], resources = [], pieces = [], pickups = [];
const landOK = (x, z) => { const h = heightAt(x, z); return h > 2 && h < 20 && Math.hypot(x, z) < R * 0.85; };
const houseCols = [0xe8d5b5, 0xd9a87c, 0xc9d6df, 0xe3c0a8, 0xb9c4a1, 0xefe6d2, 0xd7b98e];
const boxG = (w, h, d) => new THREE.BoxGeometry(w, h, d);
function pbr(n, color, rx, ry) { const m = { map: T[n + '_col'].clone(), normalMap: T[n + '_nor'].clone(), roughnessMap: T[n + '_rgh'].clone() }; for (const k in m) { m[k].repeat.set(rx, ry); m[k].needsUpdate = true; } return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 1, metalness: 0 }, m)); }
const roofM = pbr('wood', 0x9a6a50, 3, 3), doorM = pbr('wood', 0x8a5a3a, 1, 2), plinthM = pbr('rock', 0xbbbbbb, 4, .5);
for (let tries = 0; houses.length < 14 && tries < 600; tries++) {
  const x = rr(-R * .8, R * .8), z = rr(-R * .8, R * .8);
  if (!landOK(x, z) || houses.some(h => Math.hypot(h.x - x, h.z - z) < 28)) continue;
  let lo = 1e9; for (const [dx, dz] of [[-4, -4], [4, -4], [-4, 4], [4, 4], [0, 0]]) lo = Math.min(lo, heightAt(x + dx, z + dz));
  const y = lo - 0.5, H = 5.5;
  const grp = new THREE.Group();
  const add = (geo, mat, px, py, pz) => { const m = shadow(new THREE.Mesh(geo, mat)); m.position.set(px, py, pz); grp.add(m); return m; };
  add(boxG(8, H, 8), std(houseCols[houses.length % houseCols.length], .9), 0, H / 2, 0);
  add(boxG(8.3, .6, 8.3), plinthM, 0, .3, 0);
  add(boxG(9, .5, 9), roofM, 0, H + .25, 0);
  add(boxG(9.2, .25, 9.2), std(0xdedad0, .7), 0, H + .55, 0);
  add(boxG(.9, 1.6, .9), std(0x8d5a44, .9), 2.6, H + 1.4, -2.4);
  add(boxG(1.6, 2.6, .12), doorM, 0, 1.8, 4.03);
  const glass = std(0x9fc3d6, .05, .2, { envMapIntensity: 1.5 }), frame = std(0xf2f0ea, .6);
  for (const [sx, sz, ry] of [[-2.4, 4.03, 0], [2.4, 4.03, 0], [4.03, 0, Math.PI / 2], [-4.03, 0, Math.PI / 2], [-2.4, -4.03, 0], [2.4, -4.03, 0]]) {
    const f = add(boxG(1.6, 1.4, .1), frame, sx, 3.3, sz); f.rotation.y = ry;
    const gl = add(boxG(1.35, 1.15, .14), glass, sx, 3.3, sz); gl.rotation.y = ry; gl.castShadow = false;
  }
  grp.position.set(x, y, z); scene.add(grp);
  houses.push({ x, z, top: y + H + .6, box: new THREE.Box3(new V3(x - 4.5, y, z - 4.5), new V3(x + 4.5, y + H + .6, z + 4.5)) });
}
// alberi instanziati: tronco + 3 strati di chioma
function jitter(g, a) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = hash(Math.round(p.getX(i) * 100), Math.round(p.getY(i) * 100 + p.getZ(i) * 37)); p.setXYZ(i, p.getX(i) * (1 + (k - .5) * a), p.getY(i) + (k - .5) * a, p.getZ(i) * (1 + (k - .5) * a)); } g.computeVertexNormals(); return g; }
function glbParts(gl, height) {
  gl.scene.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(gl.scene), k = height / (bb.max.y - bb.min.y), parts = [];
  gl.scene.traverse(o => { if (!o.isMesh) return; const g = o.geometry.clone().applyMatrix4(o.matrixWorld).translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2).scale(k, k, k); const m = o.material.clone(); m.roughness = .9; m.metalness = 0; if (m.map) m.map.anisotropy = maxAni; parts.push([g, m]); });
  return { parts, k, r: Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * k / 2 };
}
const pine = glbParts(pineGl, 8.5), treeParts = pine.parts;
const TREES = 160;
const treeIM = treeParts.map(([g, m]) => { const im = shadow(new THREE.InstancedMesh(g, m, TREES)); im.count = 0; scene.add(im); return im; });
const trunkTop = 3;
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _sc = new V3(), _p = new V3(), _col = new THREE.Color();
function setTree(t) {
  if (t.hp <= 0) _m4.makeScale(0, 0, 0);
  else { _q.setFromEuler(_e.set(0, t.ry, t.rz || 0)); _m4.compose(_p.set(t.x, t.y - .2, t.z), _q, _sc.set(t.s, t.s * t.sy, t.s)); }
  for (const im of treeIM) { im.setMatrixAt(t.idx, _m4); im.instanceMatrix.needsUpdate = true; }
}
function nearHouse(x, z, d) { return houses.some(h => Math.abs(h.x - x) < d && Math.abs(h.z - z) < d); }
for (let i = 0, t = 0; i < TREES && t < 3000; t++) {
  const x = rr(-R, R), z = rr(-R, R); if (!landOK(x, z) || nearHouse(x, z, 8)) continue;
  const y = heightAt(x, z), s = rr(.75, 1.25);
  const tr = { kind: 'tree', x, z, y, r: .55 * s, hp: 120, s, sy: rr(.85, 1.2), ry: rr(0, 6), idx: i };
  setTree(tr); for (const im of treeIM) im.setColorAt(i, _col.setScalar(rr(.82, 1.08))); aoPaint(x, z, 2.6 * s, .45);
  resources.push(tr); i++; for (const im of treeIM) im.count = i;
}
const rockP = glbParts(rockGl, 2.6), rockG = rockP.parts[0][0], rockM = rockP.parts[0][1]; rockM.color.multiplyScalar(1.5);
for (let i = 0, t = 0; i < 60 && t < 2000; t++) {
  const x = rr(-R, R), z = rr(-R, R); if (!landOK(x, z) || nearHouse(x, z, 8)) continue;
  const m = shadow(new THREE.Mesh(rockG, rockM)), y = heightAt(x, z), s = rr(.7, 1.4);
  m.scale.set(s * 1.2, s * .8, s); m.position.set(x, y + .2, z); m.rotation.set(rr(0, .4), rr(0, 6), rr(0, .4)); scene.add(m);
  resources.push({ kind: 'rock', x, z, y, r: 1.6 * s, hp: 180, mesh: m, s }); i++; aoPaint(x, z, 2.6 * s, .55);
}
for (const h of houses) { for (let k = 0; k < 3; k++) aoPaint(h.x, h.z, 7.5 + k, .22); }
aoTex.needsUpdate = true;
function hideRes(t) { if (t.kind === 'tree') setTree(t); else t.mesh.visible = false; }

// ---------- weapons & loot ----------
const WEAP = {
  p: { n: 'Pistola', ic: '🔫', dmg: 24, rate: .28, mag: 12, rel: 1.2, spread: .012, pel: 1, range: 90, len: .45, col: 0x333333, snd: [3200, .16, .9] },
  a: { n: 'Fucile d\'assalto', ic: '🪖', dmg: 30, rate: .13, mag: 30, rel: 1.8, spread: .022, pel: 1, range: 150, len: 1.0, col: 0x2d3a2d, snd: [2400, .14, 1] },
  s: { n: 'Fucile a pompa', ic: '💥', dmg: 12, rate: .95, mag: 5, rel: 2.3, spread: .085, pel: 8, range: 35, len: .8, col: 0x5a3a1a, snd: [1300, .38, 1.4] },
};
const SLOT = { p: 0, a: 1, s: 2 }, TYPES = ['p', 'a', 's'];
const RAR = ['Comune', 'Non comune', 'Raro', 'Epico', 'Leggendario'];
const RARC = ['#b8b8b8', '#4ade80', '#38bdf8', '#c084fc', '#fbbf24'];
const accM = RARC.map(c => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: .35, roughness: .4, metalness: .3 }));
const metalM = std(0x26282c, .4, .75), woodM = std(0x6b4423, .7), gripM = std(0x161616, .8);
// modelli armi (asse +z in avanti)
function gunModel(t) {
  const g = new THREE.Group(), add = (geo, m, x, y, z, rx = 0) => { const k = shadow(new THREE.Mesh(geo, m), true, false); k.position.set(x, y, z); k.rotation.x = rx; g.add(k); return k; };
  let acc;
  if (t === 'p') { add(boxG(.06, .09, .24), metalM, 0, 0, .06); add(boxG(.035, .035, .1), metalM, 0, .015, .22); add(boxG(.05, .14, .065), gripM, 0, -.09, -.02, .3); acc = add(boxG(.064, .02, .16), accM[0], 0, .05, .06); g.userData.mz = .28; }
  else if (t === 'a') { add(boxG(.07, .1, .46), metalM, 0, 0, .1); add(boxG(.035, .035, .3), metalM, 0, .02, .48); add(boxG(.06, .11, .24), gripM, 0, -.02, -.24); add(boxG(.05, .17, .07), metalM, 0, -.12, .14, .25); add(boxG(.05, .14, .06), gripM, 0, -.09, -.02, .3); add(boxG(.045, .055, .16), gripM, 0, .085, .08); acc = add(boxG(.074, .025, .3), accM[0], 0, .035, .14); g.userData.mz = .64; }
  else { add(boxG(.08, .1, .36), metalM, 0, 0, .08); add(boxG(.05, .05, .38), metalM, 0, .02, .44); add(boxG(.07, .07, .16), woodM, 0, -.04, .36); add(boxG(.07, .13, .3), woodM, 0, -.03, -.24); add(boxG(.05, .14, .06), gripM, 0, -.09, -.04, .3); acc = add(boxG(.084, .022, .26), accM[0], 0, .05, .06); g.userData.mz = .64; }
  g.userData.acc = acc; return g;
}
const pickBeamG = new THREE.CylinderGeometry(.06, .06, 3, 6), pickBoxG = boxG(.6, .6, .6);
const beamMats = RARC.map(c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .35, depthWrite: false, blending: THREE.AdditiveBlending }));
const pickMats = { ammo: std(0x6d5a3a, .8), shield: new THREE.MeshStandardMaterial({ color: 0x3aa8ff, emissive: 0x1a6cff, emissiveIntensity: .6, roughness: .2 }), med: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff3030, emissiveIntensity: .3, roughness: .4 }) };
function spawnPickup(it, x, z, y) {
  const g = new THREE.Group();
  let m;
  if (it.kind === 'w') { m = gunModel(it.wt); m.userData.acc.material = accM[it.rar]; m.scale.setScalar(1.6); const b = new THREE.Mesh(pickBeamG, beamMats[it.rar]); b.position.y = 1.5; g.add(b); }
  else m = shadow(new THREE.Mesh(pickBoxG, pickMats[it.kind]), true, false);
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

// ---------- personaggi umani ----------
const CAP = (r, l) => new THREE.CapsuleGeometry(r, l, 3, 10);
const CG = { thigh: CAP(.088, .27), shin: CAP(.072, .29), uarm: CAP(.066, .19), farm: CAP(.056, .19), chest: CAP(.19, .28), head: new THREE.SphereGeometry(.13, 16, 12),
  hand: new THREE.SphereGeometry(.055, 8, 6), foot: boxG(.13, .08, .27), pelvis: boxG(.34, .2, .22), neck: new THREE.CylinderGeometry(.055, .065, .12, 8),
  hair: new THREE.SphereGeometry(.138, 16, 10, 0, Math.PI * 2, 0, Math.PI * .5), cap: new THREE.CylinderGeometry(.14, .14, .04, 14), eye: new THREE.SphereGeometry(.018, 6, 4), pack: boxG(.3, .36, .14), belt: boxG(.36, .05, .24) };
const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac], PANTS = [0x2b2d42, 0x3d405b, 0x4a4e3a, 0x2f3e46, 0x5c4033];
const eyeM = new THREE.MeshBasicMaterial({ color: 0x111111 }), bootM = std(0x1d1a17, .7), beltM = std(0x2a1f17, .6);
const flashTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,230,1)'); g.addColorStop(.25, 'rgba(255,200,90,.9)'); g.addColorStop(1, 'rgba(255,120,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const flashMat = new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
const blobTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,.75)'); g.addColorStop(.5, 'rgba(0,0,0,.4)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const blobM = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: .8, polygonOffset: true, polygonOffsetFactor: -2 }), blobG = new THREE.PlaneGeometry(1.3, 1.3).rotateX(-Math.PI / 2);
function makeChar(hi, color) {
  const H = HEROES[hi], C = CHARS[H.m], g = new THREE.Group();
  const model = SkeletonUtils.clone(C.scene); model.scale.setScalar(C.s); model.position.y = C.y0; g.add(model);
  const mixer = new THREE.AnimationMixer(model), acts = {};
  for (const k in C.clips) acts[k] = mixer.clipAction(C.clips[k]);
  for (const k of ['Death', 'Sword_Slash', 'Gun_Shoot', 'Roll']) if (acts[k]) { acts[k].setLoop(THREE.LoopOnce, 1); acts[k].clampWhenFinished = true; }
  const wrist = model.getObjectByName('WristR'), farm = model.getObjectByName('LowerArmR'), headB = model.getObjectByName('Head');
  const guns = {}; for (const t of TYPES) { const gm = gunModel(t); gm.visible = false; gm.rotation.order = 'YXZ'; g.add(gm); guns[t] = gm; }
  const flash = new THREE.Sprite(flashMat); flash.visible = false; flash.scale.setScalar(.7); g.add(flash);
  const axe = new THREE.Group(); { const h = shadow(new THREE.Mesh(new THREE.CylinderGeometry(.022, .026, .85, 6), woodM), true, false); h.position.y = .3; axe.add(h); const ah = shadow(new THREE.Mesh(boxG(.55, .07, .07), std(0xb8bcc2, .35, .8)), true, false); ah.position.y = .7; ah.rotation.z = .1; axe.add(ah); }
  g.add(axe);
  const glider = shadow(new THREE.Mesh(new THREE.ConeGeometry(2.4, 1, 3), std(color ?? H.col, .6, 0, { side: THREE.DoubleSide })), true, false);
  glider.scale.set(1, .25, 1); glider.position.y = 3.4; glider.rotation.y = Math.PI; glider.visible = false; g.add(glider);
  const blob = new THREE.Mesh(blobG, blobM); blob.renderOrder = 1; g.add(blob);
  return { g, model, mixer, acts, cur: null, wrist, farm, headB, guns, gun: null, flash, axe, glider, blob, hero: hi, acc: 0 };
}
function playA(P, name, fade = .18, ts = 1) {
  if (!P.acts[name]) name = 'Idle';
  const a = P.acts[name]; a.timeScale = ts;
  if (P.cur === name) return a;
  a.reset().setEffectiveWeight(1).fadeIn(fade).play(); if (P.cur) P.acts[P.cur].fadeOut(fade); P.cur = name; return a;
}
const _w1 = new V3(), _w2 = new V3(), _up = new V3(0, 1, 0), _qa = new THREE.Quaternion();
// posiziona arma, piccone e fiammata sulla mano dello scheletro
function gear(P, w, pitch, kick = 0, reload = 0) {
  P.g.updateMatrixWorld(true);
  P.wrist.getWorldPosition(_w1); P.g.worldToLocal(_w1); P.farm.getWorldPosition(_w2); P.g.worldToLocal(_w2);
  for (const t of TYPES) P.guns[t].visible = !!w && w.wt === t;
  if (w) {
    const gm = P.guns[w.wt]; if (gm.userData.rar !== w.rar) { gm.userData.acc.material = accM[w.rar]; gm.userData.rar = w.rar; }
    gm.position.copy(_w1).add(_w2.set(0, .02, .06 - kick * .05)); gm.rotation.set(-pitch + reload * .9 - kick * .12, 0, 0);
    P.flash.position.set(0, .02, gm.userData.mz).applyEuler(gm.rotation).add(gm.position);
  }
  P.axe.visible = !w;
  if (!w) { _w2.sub(_w1).multiplyScalar(-1).normalize(); P.axe.position.copy(_w1); P.axe.quaternion.setFromUnitVectors(_up, _w2.lengthSq() > 0 ? _w2 : _up); P.axe.rotateX(Math.PI / 2); P.axe.translateY(-.3); }
}
const lam = c => std(c, .7);
const ents = [];
const NAMES = ['Zanzara', 'Pannocchia', 'Gelatone', 'Sbadiglio', 'Tornado', 'Biscotto', 'Ravanello', 'Fulmine', 'Polpetta', 'Cactus', 'Ciabatta', 'Meringa', 'Scheggia', 'Turbina', 'Brontolo'];
const BODYC = [0xff595e, 0xffca3a, 0x8ac926, 0x1982c4, 0x6a4c93, 0xff924c, 0x52a675, 0xf15bb5, 0x00bbf9, 0x9b5de5, 0xfee440, 0x00f5d4, 0xef476f, 0x118ab2, 0x8338ec];
let entK = 0;
function makeEnt(name, color, hero, isPlayer) {
  const p = makeChar(hero, color); entK++; p.g.visible = false; scene.add(p.g);
  const H = HEROES[hero];
  const e = { name, isPlayer, p, hero, spd: H.spd, maxHp: H.hp, pos: new V3(), vel: new V3(), yaw: 0, pitch: 0, hp: H.hp, sh: 0, alive: true, onGround: false, state: 'bus',
    weapons: [null, null, null], cur: -1, ammo: { p: 0, a: 0, s: 0 }, mats: isPlayer ? 30 : 60, kills: 0, fireCd: 0, reload: 0, anim: 0, swing: 0, flashT: 0, stepA: 0, ai: {}, place: 0 };
  ents.push(e); return e;
}
const player = makeEnt('Tu', 0xff6b1a, heroSel, true);
for (let i = 0; i < 15; i++) {
  const b = makeEnt(NAMES[i], BODYC[i], (i + 1) % 3, false);
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
bus.traverse(o => { if (o.isMesh) o.castShadow = true; });
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
  if (storm.i > 0) stormEvent();
}
const stormMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 260, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0x9b30ff, transparent: true, opacity: .16, side: THREE.DoubleSide, depthWrite: false, fog: false }));
scene.add(stormMesh);

// ---------- build ----------
const G = 4, COST = 10, PIECES = ['wall', 'ramp', 'floor'], PNAME = { wall: 'Muro', ramp: 'Rampa', floor: 'Pavimento' };
const wallG = new THREE.BoxGeometry(4, 4, .3), floorG = new THREE.BoxGeometry(4, .25, 4), rampG = new THREE.BoxGeometry(4, .25, 5.66);
const stoneM = pbr('rock', 0xd0ccc4, 1, 1), pieceM = pbr('wood', 0xe0b890, 1, 1), pieceM2 = pbr('wood', 0xc8a078, 1, 1);
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
  m.rotation.order = 'YXZ'; m.castShadow = m.receiveShadow = true; placeMesh(m, pl); scene.add(m);
  const p = { ...pl, mesh: m, hp: 150, box: null, top: pl.y0 };
  if (kind === 'wall') p.box = pl.ax ? new THREE.Box3(new V3(pl.c.x - .15, pl.y0, pl.c.z - 2), new V3(pl.c.x + .15, pl.y0 + 4, pl.c.z + 2)) : new THREE.Box3(new V3(pl.c.x - 2, pl.y0, pl.c.z - .15), new V3(pl.c.x + 2, pl.y0 + 4, pl.c.z + .15));
  if (kind === 'floor') p.box = new THREE.Box3(new V3(pl.c.x - 2, pl.y0 - .25, pl.c.z - 2), new V3(pl.c.x + 2, pl.y0, pl.c.z + 2));
  pieces.push(p); e.mats -= COST; if (e.isPlayer) thud(.25, 500); return true;
}
function freeWall(e, hp) { const m = e.mats; e.mats = 999; const k = buildSel; const ok = build(e, 'wall'); e.mats = m; if (ok) { const p = pieces[pieces.length - 1]; p.hp = hp; if (hp > 200) p.mesh.material = stoneM; } return ok; }
let coverCd = 0, superCd = 0;
function coverWall() { if (phase !== 'play' || player.state !== 'ground' || !player.alive) return; if (coverCd > 0) { say(`Copertura pronta tra ${Math.ceil(coverCd)} s`); return; } if (freeWall(player, 250)) { coverCd = 12; say('🛡️ Copertura!'); } }
function useSuper() {
  if (phase !== 'play' || !player.alive || player.state !== 'ground') return; const H = HEROES[player.hero];
  if (superCd > 0) { say(`${H.sp.split(':')[0]} pronta tra ${Math.ceil(superCd)} s`); return; }
  superCd = H.cd;
  if (player.hero === 0) { player.boostT = 3; say('⚡ Scia! «Ero già qui. Tu da dove arrivi?»'); }
  else if (player.hero === 1) { freeWall(player, 400); player.hp = Math.min(player.maxHp, player.hp + player.maxHp * .1); say('🧱 Muro di Casa! «Dietro di me, tesoro.»'); }
  else { player.eyeT = 4; say('🎯 Occhio d\'Ago! «Un respiro. Un colpo.»'); }
}
const EVENTS = [
  ['📦 Rifornimento! Armi leggendarie al centro del cerchio', () => { for (let k = 0; k < 3; k++) { const p = randomLand(storm.nx, storm.nz, 10); spawnPickup({ kind: 'w', wt: TYPES[k], rar: 4 }, p.x, p.z, heightAt(p.x, p.z)); } }],
  ['💙 Pioggia di scudi sull\'isola!', () => { for (let k = 0; k < 8; k++) { const p = randomLand(storm.nx, storm.nz, storm.nr + 10); spawnPickup({ kind: 'shield' }, p.x, p.z, heightAt(p.x, p.z)); } }],
  ['🌫️ Nebbia fitta! Si vede pochissimo', () => { scene.fog.near = 15; scene.fog.far = 90; setTimeout(() => { scene.fog.near = 90; scene.fog.far = 460; }, 25000); }],
  ['❤️ Kit medici sparsi nel cerchio', () => { for (let k = 0; k < 6; k++) { const p = randomLand(storm.nx, storm.nz, storm.nr + 5); spawnPickup({ kind: 'med' }, p.x, p.z, heightAt(p.x, p.z)); } }],
  ['💨 Raffica di vento: tutti velocissimi per 3 s!', () => { for (const e of ents) e.boostT = 3; }],
];
function stormEvent() { if (phase !== 'play') return; const ev = EVENTS[(rnd() * EVENTS.length) | 0]; ev[1](); say(ev[0], 4); feed(ev[0]); }
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
    const sp = (sprint ? 10.5 : 7) * (e.spd || 1) * (e.boostT > 0 ? 2 : 1), k = Math.min(1, dt * 12);
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
    if (_ray.intersectSphere(_s, _v)) { const t = _v.distanceTo(o); if (t < best) { best = t; res = { type: 'ent', obj: e, head: _v.y > e.pos.y + 1.62 }; } }
  }
  for (const p of pieces) if (p.box && _ray.intersectBox(p.box, _v)) { const t = _v.distanceTo(o); if (t < best) { best = t; res = { type: 'piece', obj: p }; } }
  for (const h of houses) if (_ray.intersectBox(h.box, _v)) { const t = _v.distanceTo(o); if (t < best) { best = t; res = { type: 'house' }; } }
  for (let t = 1; t < best; t += 1.5) { const y = o.y + d.y * t; if (y < heightAt(o.x + d.x * t, o.z + d.z * t)) { best = t; res = { type: 'ground' }; break; } }
  res.t = best; return res;
}
const tracers = [], trG = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, .5);
const trMat = new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
for (let i = 0; i < 40; i++) { const l = new THREE.Mesh(trG, trMat); l.visible = false; l.frustumCulled = false; scene.add(l); tracers.push({ l, t: 0, len: 0 }); }
let trI = 0;
function tracer(a, b) { const tr = tracers[trI++ % tracers.length], d = a.distanceTo(b); tr.l.position.copy(a); tr.l.lookAt(b); tr.len = d; tr.l.scale.set(.035, .035, d); tr.l.visible = true; tr.t = .08; }
// scintille
const SPN = 400, spPos = new Float32Array(SPN * 3).fill(-999), spCol = new Float32Array(SPN * 3), spVel = new Float32Array(SPN * 3), spLife = new Float32Array(SPN);
const spGeo = new THREE.BufferGeometry(); spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3)); spGeo.setAttribute('color', new THREE.BufferAttribute(spCol, 3));
const sparks = new THREE.Points(spGeo, new THREE.PointsMaterial({ size: .16, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
sparks.frustumCulled = false; scene.add(sparks); let spI = 0;
function spark(p, n, col, spd = 6) {
  if (p.distanceToSquared(camera.position) > 110 * 110) return;
  const c = new THREE.Color(col);
  for (let i = 0; i < n; i++) { const k = spI++ % SPN; spPos[k * 3] = p.x; spPos[k * 3 + 1] = p.y; spPos[k * 3 + 2] = p.z;
    spVel[k * 3] = (Math.random() - .5) * spd; spVel[k * 3 + 1] = Math.random() * spd * .8; spVel[k * 3 + 2] = (Math.random() - .5) * spd; spLife[k] = .25 + Math.random() * .3;
    spCol[k * 3] = c.r; spCol[k * 3 + 1] = c.g; spCol[k * 3 + 2] = c.b; }
}
function updSparks(dt) {
  for (let k = 0; k < SPN; k++) { if (spLife[k] <= 0) continue; spLife[k] -= dt;
    if (spLife[k] <= 0) { spPos[k * 3 + 1] = -999; continue; }
    spVel[k * 3 + 1] -= 18 * dt; spPos[k * 3] += spVel[k * 3] * dt; spPos[k * 3 + 1] += spVel[k * 3 + 1] * dt; spPos[k * 3 + 2] += spVel[k * 3 + 2] * dt;
    const f = Math.min(1, spLife[k] * 4); spCol[k * 3] *= .97 + .03 * f; spCol[k * 3 + 1] *= .94; spCol[k * 3 + 2] *= .9; }
  spGeo.attributes.position.needsUpdate = true; spGeo.attributes.color.needsUpdate = true;
}
// numeri di danno
const dmgEls = [], dmgBox = $('dmg');
function dmgNum(e, a, head, shield) {
  let d = dmgEls.find(x => x.t <= 0); if (!d) { if (dmgEls.length > 24) return; d = { el: document.createElement('b'), t: 0 }; dmgBox.appendChild(d.el); dmgEls.push(d); }
  d.el.textContent = Math.round(a); d.el.className = head ? 'h' : shield ? 's' : ''; d.t = .9; d.p = new V3(e.pos.x + (Math.random() - .5) * .6, e.pos.y + 2.1, e.pos.z + (Math.random() - .5) * .6); d.el.style.display = '';
}
const _pj = new V3();
function updDmg(dt) {
  for (const d of dmgEls) { if (d.t <= 0) continue; d.t -= dt; if (d.t <= 0) { d.el.style.display = 'none'; continue; }
    d.p.y += dt * 1.2; _pj.copy(d.p).project(camera); if (_pj.z > 1) { d.el.style.display = 'none'; continue; }
    d.el.style.display = ''; d.el.style.left = ((_pj.x + 1) / 2 * innerWidth) + 'px'; d.el.style.top = ((1 - _pj.y) / 2 * innerHeight) + 'px'; d.el.style.opacity = Math.min(1, d.t * 3); }
}
function startReload(e) { const w = e.weapons[e.cur]; if (!w || e.reload > 0 || w.mag >= WEAP[w.wt].mag || e.ammo[w.wt] <= 0) return; e.reload = WEAP[w.wt].rel; }
function finishReload(e) { const w = e.weapons[e.cur]; if (!w) return; const need = WEAP[w.wt].mag - w.mag, got = Math.min(need, e.ammo[w.wt]); w.mag += got; e.ammo[w.wt] -= got; }
const _mz = new V3();
function shoot(e, o, dir) {
  const w = e.weapons[e.cur]; if (!w || e.reload > 0 || e.fireCd > 0) return;
  if (w.mag <= 0) { startReload(e); return; }
  const W = WEAP[w.wt]; w.mag--; const eye = e.eyeT > 0 ? 2 : 1; e.fireCd = W.rate + (e.isPlayer ? 0 : .12);
  const mult = 1 + w.rar * .08;
  const muzzle = e.p.flash.getWorldPosition(new V3());
  if (muzzle.distanceTo(e.pos) > 3) muzzle.set(e.pos.x, e.pos.y + 1.5, e.pos.z).addScaledVector(fwd(e.yaw), .9);
  e.p.flash.visible = true; e.p.flash.material.rotation = Math.random() * 6; e.p.flash.scale.setScalar(w.wt === 's' ? 1 : .7); e.flashT = .05; e.kick = 1;
  const dd = e.pos.distanceTo(player.pos);
  if (flashLight && dd < 45) { flashLight.position.copy(muzzle); flashLight.intensity = 9; }
  for (let i = 0; i < W.pel; i++) {
    const sp = W.spread * (e.isPlayer && !e.onGround ? 2 : 1) / (eye * eye * 4 - 3);
    const d = dir.clone().add(new V3((Math.random() - .5) * 2 * sp, (Math.random() - .5) * 2 * sp, (Math.random() - .5) * 2 * sp)).normalize();
    const h = hitscan(o, d, W.range, e), end = o.clone().addScaledVector(d, h.t);
    if (i < 3) tracer(muzzle, end);
    if (h.type === 'ent') { spark(end, 6, 0xff5533, 4); damage(h.obj, W.dmg * mult * eye * (h.head ? 1.5 : 1) * (e.isPlayer ? 1 : h.obj.isPlayer ? .75 : .55), e, h.head); }
    else if (h.type === 'piece') { spark(end, 5, 0xffcc77); hurtPiece(h.obj, W.dmg * mult); }
    else if (h.type) spark(end, i < 3 ? 6 : 2, h.type === 'ground' ? 0xd8c090 : 0xffe0a0);
  }
  if (dd < 90) gunSnd(w.wt, e.isPlayer ? 1 : .7 * (1 - dd / 90), e.isPlayer ? 0 : dd);
  if (w.mag <= 0) startReload(e);
}
function swing(e) {
  if (e.fireCd > 0) return; e.fireCd = .45; e.swing = .3;
  const f = fwd(e.yaw);
  let best = null, bd = 3.4;
  for (const t of resources) { if (t.hp <= 0) continue; const dx = t.x - e.pos.x, dz = t.z - e.pos.z, d = Math.hypot(dx, dz) - t.r; if (d < bd && (dx * f.x + dz * f.z) > 0) { bd = d; best = t; } }
  for (const o of ents) { if (o === e || !o.alive || o.state !== 'ground') continue; const dx = o.pos.x - e.pos.x, dz = o.pos.z - e.pos.z, d = Math.hypot(dx, dz); if (d < 2.4 && (dx * f.x + dz * f.z) / d > .5) { damage(o, 20, e); return; } }
  for (const p of pieces) { const d = p.c.distanceTo(_v.set(e.pos.x, p.c.y, e.pos.z)); if (d < 3 && Math.abs(p.y0 - e.pos.y) < 3.5 && ((p.c.x - e.pos.x) * f.x + (p.c.z - e.pos.z) * f.z) > 0) { hurtPiece(p, 50); if (e.isPlayer) thud(.35, 600); return; } }
  if (!best) return;
  best.hp -= 30; e.mats = Math.min(999, e.mats + (best.kind === 'tree' ? 10 : 15));
  best.shake = .2; if (e.isPlayer) { thud(.5, best.kind === 'tree' ? 380 : 1400); hitmark(); spark(new V3(best.x, best.y + 1.2, best.z).addScaledVector(f, -best.r), 8, best.kind === 'tree' ? 0xb08050 : 0xcccccc, 4); }
  if (best.hp <= 0) hideRes(best);
}
function damage(e, a, src, head) {
  if (!e.alive) return;
  const hadSh = e.sh > 0;
  if (src && src.isPlayer) { dmgNum(e, a, head, hadSh); tick(head); }
  if (e.sh > 0) { const s = Math.min(e.sh, a); e.sh -= s; a -= s; }
  e.hp -= a;
  if (e.isPlayer) { $('hurt').style.opacity = .7; hurtT = .25; }
  if (src && src.isPlayer) hitmark();
  if (!e.isPlayer) e.ai.lastHit = clock, e.ai.attacker = src || e.ai.attacker;
  if (e.hp <= 0) kill(e, src);
}
function kill(e, src) {
  e.alive = false; e.hp = 0; e.dieT = 2.2; for (const t of TYPES) e.p.guns[t].visible = false; e.p.axe.visible = false; e.p.glider.visible = false; playA(e.p, 'Death', .1);
  for (let i = 0; i < 3; i++) { const w = e.weapons[i]; if (w) spawnPickup({ kind: 'w', wt: w.wt, rar: w.rar }, e.pos.x + rr(-1.5, 1.5), e.pos.z + rr(-1.5, 1.5), Math.max(e.pos.y - .6, heightAt(e.pos.x, e.pos.z))); }
  if (e.mats > 0 || true) spawnPickup({ kind: 'ammo', wt: TYPES[(rnd() * 3) | 0] }, e.pos.x, e.pos.z, Math.max(e.pos.y - .6, heightAt(e.pos.x, e.pos.z)));
  if (src) { src.kills++; feed(`${src.name} ha eliminato ${e.name}`); } else feed(`${e.name} è stato travolto dalla tempesta`);
  const left = ents.filter(x => x.alive).length;
  if (e.isPlayer && !e.respawned) { e.respawned = true; say('💫 Hai una seconda possibilità! Rientri tra 3 s', 3); setTimeout(() => { if (phase !== 'play') return; e.alive = true; e.dieT = 0; e.hp = e.maxHp; e.sh = 50; const p = randomLand(storm.nx, storm.nz, Math.max(4, storm.nr * .5)); e.pos.set(p.x, heightAt(p.x, p.z) + 45, p.z); e.vel.set(0, 0, 0); e.state = 'fall'; e.p.g.visible = true; P_reset(e); say('Plana di nuovo! Ultima vita', 3); }, 3000); return; }
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
    else if (it.kind === 'med' && e.hp < e.maxHp) { e.hp = Math.min(e.maxHp, e.hp + 50); took = true; if (e.isPlayer) say('+50 salute'); }
    if (took) { scene.remove(it.g); pickups.splice(i, 1); if (e.isPlayer) sfx(660, .08, 'sine', .08); }
  }
}
function select(e, s) { if (s >= 0 && !e.weapons[s]) return; e.cur = s; e.reload = 0; e.fireCd = Math.max(e.fireCd, .15); }

// ---------- audio ----------
let actx = null, master = null, noiseBuf = null;
function initAudio() {
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = actx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; comp.connect(actx.destination);
    master = actx.createGain(); master.gain.value = .8; master.connect(comp);
    noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { actx = null; }
}
function sfx(f, d, type, vol) { try { if (!actx) return; const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.value = f; o.frequency.exponentialRampToValueAtTime(f * .5, actx.currentTime + d); g.gain.value = vol; g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + d); o.connect(g).connect(master); o.start(); o.stop(actx.currentTime + d); } catch (e) { } }
function noise(dur, vol, type, freq, q = 1, decay) {
  const t = actx.currentTime, s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  s.buffer = noiseBuf; s.playbackRate.value = .8 + Math.random() * .4; f.type = type; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(Math.max(80, freq * .25), t + dur); f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + (decay || dur));
  s.connect(f).connect(g).connect(master); s.start(t, Math.random() * .5); s.stop(t + dur + .05);
}
// sparo: scoppio di rumore filtrato + colpo basso; lontano = più ovattato
function gunSnd(wt, vol, dist) {
  if (!actx || vol <= .01) return;
  try {
    const [fr, dur, boom] = WEAP[wt].snd, far = Math.min(1, dist / 90), t = actx.currentTime;
    noise(dur, vol * .9, 'lowpass', fr * (1 - far * .75), .7);
    noise(.03, vol * .5 * (1 - far), 'highpass', 4000, .5);
    const o = actx.createOscillator(), g = actx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(140 * boom, t); o.frequency.exponentialRampToValueAtTime(38, t + .14 * boom);
    g.gain.setValueAtTime(vol * .9 * boom, t); g.gain.exponentialRampToValueAtTime(.001, t + .18 * boom); o.connect(g).connect(master); o.start(t); o.stop(t + .25 * boom);
    if (wt === 's' && dist === 0) setTimeout(() => { try { noise(.05, .25, 'bandpass', 1800, 4); setTimeout(() => noise(.05, .25, 'bandpass', 1400, 4), 140); } catch (e) { } }, 380);
  } catch (e) { }
}
function step(vol, run) { if (!actx) return; try { noise(.07, vol, 'bandpass', run ? 650 : 500, 1.4, .08); noise(.04, vol * .5, 'lowpass', 180, .7); } catch (e) { } }
function thud(vol, f) { if (!actx) return; try { noise(.09, vol, 'bandpass', f, 2); } catch (e) { } }
function tick(head) { sfx(head ? 1700 : 1150, .05, 'triangle', head ? .12 : .07); }
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
  $('hpb').style.width = (player.hp / player.maxHp * 100) + '%'; $('hpt').textContent = Math.ceil(player.hp);
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
  if (e.code === 'Space' && (phase === 'play' || phase === 'bus')) { jumpQ = true; e.preventDefault(); }
  if (phase !== 'play') return;
  if (e.code === 'KeyQ') toggleBuild();
  if (e.code === 'KeyE') cyclePiece();
  if (e.code === 'KeyR') startReload(player);
  if (e.code === 'KeyG') useSuper();
  if (e.code === 'KeyC') coverWall();
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
btn('bSuper', useSuper); btn('bCover', coverWall);
for (const [id, f] of [['bSuper', useSuper], ['bCover', coverWall]]) $(id).addEventListener('click', f);
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

// ---------- animazione procedurale ----------
function setLimb(L, x, z, j) { L.piv.rotation.set(x, 0, z); L.j.rotation.x = j; }
function animate(e, dt) {
  const P = e.p, g = P.g; g.position.copy(e.pos); g.rotation.y = e.yaw;
  const sp = Math.hypot(e.vel.x, e.vel.z), w = e.state === 'ground' ? e.weapons[e.cur] : null, spd = e.spd || 1;
  e.kick = Math.max(0, (e.kick || 0) - dt * 10);
  P.model.rotation.x = 0;
  if (e.state === 'fall') { playA(P, 'Idle_Neutral', .3); P.model.rotation.x = 1.25; }
  else if (e.state === 'glide') playA(P, 'Idle_Neutral', .3);
  else if (!e.onGround) playA(P, 'Run', .15, .15);
  else if (e.swing > 0 && !w) playA(P, 'Sword_Slash', .06, 1.6);
  else if (sp < .6) playA(P, w ? (e.kick > 0 || e.fireCd > 0 ? 'Idle_Gun_Shoot' : 'Idle_Gun_Pointing') : 'Idle', .2);
  else {
    const f = fwd(e.yaw), fv = (e.vel.x * f.x + e.vel.z * f.z) / sp, rv = (e.vel.x * -f.z + e.vel.z * f.x) / sp, run = sp > 8.3 * spd;
    if (w) playA(P, fv < -.5 ? 'Run_Back' : rv > .7 ? 'Run_Left' : rv < -.7 ? 'Run_Right' : 'Run_Shoot', .2, sp / (7.5 * spd));
    else playA(P, run ? 'Run' : 'Walk', .2, run ? sp / (9.5 * spd) : sp / (4.2 * spd));
    const runk = run ? 1.0 : 1.45; e.anim += dt * sp * runk;
    const dpl = e.isPlayer ? 0 : e.pos.distanceToSquared(player.pos);
    if (dpl < 400) { const ph = Math.floor(e.anim / Math.PI); if (ph !== e.stepA) { e.stepA = ph; step(e.isPlayer ? (run ? .32 : .2) : .12 * (1 - Math.sqrt(dpl) / 20), run); } }
  }
  // aggiornamento animazioni: i bot lontani a frequenza ridotta
  P.acc += dt; const far = !e.isPlayer && e.pos.distanceToSquared(camera.position) > (Q === 'basso' ? 1600 : 4900);
  if (!far || (P.acc > .066)) { P.mixer.update(P.acc); P.acc = 0; }
  if (!far || P.acc === 0) gear(P, w, e.isPlayer ? e.pitch : 0, e.kick, e.reload > 0 ? .5 : 0);
  const gy = heightAt(e.pos.x, e.pos.z), hy = Math.max(0, e.pos.y - gy);
  P.blob.visible = hy < 6; P.blob.position.y = -hy + .04; P.blob.scale.setScalar(1 + hy * .15); P.blob.material.opacity = .8;
  if (e.flashT > 0) { e.flashT -= dt; if (e.flashT <= 0) P.flash.visible = false; }
  P.glider.visible = e.state === 'glide';
}
function P_reset(e) { const P = e.p; for (const k in P.acts) P.acts[k].stop(); P.cur = null; }
function dying(e, dt) { e.dieT -= dt; e.p.mixer.update(dt); if (e.dieT <= 0) e.p.g.visible = false; }

// ---------- game flow ----------
let phase = 'menu', busT = 0;
const camPos = new V3(), camLook = new V3();
function dropOut(e) { e.state = 'fall'; e.pos.copy(bus.position).add(new V3(0, -3, 0)); e.vel.set(0, 0, 0); e.p.g.visible = true; if (!e.isPlayer) { e.yaw = rr(0, 6.28); } }
function startGame() {
  phase = 'bus'; busT = 0;
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden');
  initAudio();
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
    lastScore = { k: player.kills, p: place };
    $('endS').textContent = `Eliminazioni: ${player.kills} · Partite: ${stats.partite} · Vittorie totali: ${stats.vittorie}`;
    $('end').classList.remove('hidden');
  }, win ? 600 : 1200);
}
async function goLandscape() {
  if (!isTouch) return;
  try { const el = document.documentElement; if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' }); } catch (e) { }
  try { await screen.orientation?.lock?.('landscape'); } catch (e) { }
}
function setHero(i) {
  heroSel = i; localStorage.setItem('isolazero_hero3', i); const H = HEROES[i];
  $('hN').textContent = H.n; $('hR').textContent = H.ruolo; $('hD').textContent = H.d;
  $('hS').style.width = (H.spd / 1.15 * 100) + '%'; $('hH').style.width = (H.hp / 130 * 100) + '%';
  $('hW').textContent = WEAP[H.w].ic + ' ' + WEAP[H.w].n; $('hSp').textContent = '⚡ ' + H.sp; $('hHt').textContent = H.hp; $('hSt').textContent = Math.round(H.spd * 100) + '%';
  document.querySelectorAll('.hcard').forEach(c => c.classList.toggle('on', +c.dataset.h === i));
  pv.chars.forEach((c, k) => c.g.visible = k === i); pv.rot = -0.6;
}
function buildPreview() {
  const s = new THREE.Scene(); s.background = new THREE.Color(0x05080f); s.environment = scene.environment; s.environmentIntensity = .25;
  s.fog = new THREE.Fog(0x05080f, 6, 16);
  const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, .1, 60);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 64).rotateX(-Math.PI / 2), pbr('rock', 0x555a60, 3, 3)); floor.receiveShadow = true; s.add(floor);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.95, 1.02, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb300 })); ring.position.y = .01; s.add(ring);
  const key = new THREE.SpotLight(0xfff1dc, 60, 20, .45, .5, 1.6); key.position.set(2.5, 5, 3); key.castShadow = QS.sh > 0; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -.0005; s.add(key, key.target);
  const rim = new THREE.SpotLight(0x5aa0ff, 50, 20, .5, .6, 1.6); rim.position.set(-3, 3.5, -3); s.add(rim, rim.target);
  const top = new THREE.SpotLight(0xffd27a, 25, 12, .35, .8, 1.5); top.position.set(0, 6, .5); s.add(top, top.target);
  s.add(new THREE.HemisphereLight(0x8fb0ff, 0x221a10, .25));
  const chars = HEROES.map((H, i) => { const c = makeChar(i); c.g.traverse(o => { if (o.material && o.material.isMeshStandardMaterial) o.material.envMapIntensity = 1; }); c.blob.visible = true; s.add(c.g); playA(c, 'Idle_Gun', 0); return c; });
  pv = { scene: s, cam, chars, rot: 0 }; resize();
}
function renderPreview(dt, now) {
  const narrow = innerWidth / innerHeight < 1.2;
  pv.cam.position.set(-1.25, 1.45, 6.6); pv.cam.lookAt(-1.25, .92, 0);
  const c = pv.chars[heroSel]; pv.rot += dt * .55; c.g.rotation.y = pv.rot; c.mixer.update(dt);
  gear(c, { wt: HEROES[heroSel].w, rar: 3 }, 0); c.blob.position.y = .02;
  renderer.render(pv.scene, pv.cam);
}
function applyHero() {
  const i = heroSel, H = HEROES[i];
  if (player.hero !== i) { scene.remove(player.p.g); player.p = makeChar(i, 0xff6b1a); player.p.g.visible = false; player.p.g.traverse(o => { if (o.material && o.material.isMeshStandardMaterial && o.material.envMapIntensity === 1) o.material.envMapIntensity = .45; }); scene.add(player.p.g); player.hero = i; }
  player.spd = H.spd; player.maxHp = player.hp = H.hp;
  const sl = SLOT[H.w]; player.weapons[sl] = { wt: H.w, rar: 1, mag: WEAP[H.w].mag }; player.ammo[H.w] += WEAP[H.w].mag * 2; player.cur = sl;
  for (const b of ents) if (!b.isPlayer) { const bw = HEROES[b.hero].w; if (rnd() < .5) { b.weapons[SLOT[bw]] = { wt: bw, rar: 0, mag: WEAP[bw].mag }; b.ammo[bw] += WEAP[bw].mag; b.cur = SLOT[bw]; } }
}
$('play').addEventListener('click', () => { phase = 'select'; $('menu').classList.add('hidden'); $('sel').classList.remove('hidden'); setHero(heroSel); });
document.querySelectorAll('.hcard').forEach(c => c.addEventListener('click', () => setHero(+c.dataset.h)));
$('selBack').addEventListener('click', () => { phase = 'menu'; $('sel').classList.add('hidden'); $('menu').classList.remove('hidden'); });
$('go').addEventListener('click', () => { goLandscape(); $('sel').classList.add('hidden'); applyHero(); startGame(); });
$('fs').addEventListener('click', goLandscape);
$('again').addEventListener('click', () => location.reload());
let lastScore = { k: 0, p: 16 };
$('share').addEventListener('click', async () => {
  const url = location.origin + location.pathname + `?sfida=${lastScore.k}&pos=${lastScore.p}`, text = `Ho fatto ${lastScore.k} eliminazioni e sono arrivato #${lastScore.p} su ISOLA ZERO. Battimi!`;
  try { if (navigator.share) { await navigator.share({ title: 'ISOLA ZERO', text, url }); return; } } catch (e) { }
  try { await navigator.clipboard.writeText(text + ' ' + url); $('share').textContent = '✅ Link copiato!'; } catch (e) { prompt('Copia il link:', text + ' ' + url); }
});
{ const q = new URLSearchParams(location.search), k = q.get('sfida'); if (k !== null && /^\d{1,3}$/.test(k)) { const pos = /^\d{1,2}$/.test(q.get('pos') || '') ? q.get('pos') : '?'; $('chal').textContent = `🏆 Un amico ti sfida: ${k} eliminazioni, #${pos}. Riesci a fare meglio?`; } }
$('credBtn').addEventListener('click', () => $('cred').classList.remove('hidden'));
$('credClose').addEventListener('click', () => $('cred').classList.add('hidden'));

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  timeU.value = now / 1000;
  if (phase === 'select') { renderPreview(dt, now); return; }
  if (phase === 'menu') {
    const a = now * .00004; camera.position.set(Math.cos(a) * 150, 45, Math.sin(a) * 150); camera.lookAt(0, 8, 0); aimSun(Math.cos(a) * 60, Math.sin(a) * 60); draw(); return;
  }
  if (isTouch && innerHeight > innerWidth) { draw(); return; }
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
    e.fireCd -= dt; e.swing -= dt; if (e.boostT > 0) e.boostT -= dt; if (e.eyeT > 0) e.eyeT -= dt;
    if (e.reload > 0) { e.reload -= dt; if (e.reload <= 0) { e.reload = 0; finishReload(e); } }
    if (!e.isPlayer && e.state !== 'bus') { botAI(e, dt); if (e.state === 'ground') tryPickup(e); }
    if (e.state !== 'bus' && Math.hypot(e.pos.x - storm.x, e.pos.z - storm.z) > storm.r && e.state === 'ground') { e.hp -= storm.d * dt; if (e.isPlayer) { hurtT = Math.max(hurtT, .05); } if (e.hp <= 0) kill(e, null); }
    if (e.alive && e.state !== 'bus') animate(e, dt);
  }
  for (const e of ents) if (!e.alive && e.dieT > 0) dying(e, dt);
  const inStorm = player.alive && phase === 'play' && Math.hypot(player.pos.x - storm.x, player.pos.z - storm.z) > storm.r;
  $('stormfx').style.opacity = inStorm ? 1 : 0;
  // resources shake, pickups spin
  for (const t of resources) if (t.shake > 0) { t.shake -= dt; const r = t.shake > 0 ? Math.sin(t.shake * 60) * .05 : 0; if (t.kind === 'tree') { t.rz = r; if (t.hp > 0) setTree(t); } else t.mesh.rotation.z = r; }
  const sp = clock * 2; for (const it of pickups) { it.m.rotation.y = sp; it.m.position.y = Math.sin(sp + it.x) * .15; }
  for (const tr of tracers) if (tr.t > 0) { tr.t -= dt; if (tr.t <= 0) tr.l.visible = false; else { const k = tr.t / .08; tr.l.scale.x = tr.l.scale.y = .035 * k; } }
  if (flashLight && flashLight.intensity > 0) flashLight.intensity = Math.max(0, flashLight.intensity - dt * 160);
  updSparks(dt);
  coverCd -= dt; superCd -= dt; if (uiT <= dt) { $('bSuper').classList.toggle('cd', superCd > 0); $('bCover').classList.toggle('cd', coverCd > 0); $('bSuper').querySelector('small').textContent = superCd > 0 ? Math.ceil(superCd) + 's' : 'SUPER'; $('bCover').querySelector('small').textContent = coverCd > 0 ? Math.ceil(coverCd) + 's' : 'COPERTURA'; }
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
  updDmg(dt);
  aimSun(player.pos.x, player.pos.z);
  draw();
}
function draw() { if (composer) composer.render(); else renderer.render(scene, camera); }
scene.traverse(o => { const ms = o.material ? [].concat(o.material) : []; for (const m of ms) if (m.isMeshStandardMaterial && m.envMapIntensity === 1) m.envMapIntensity = .45; });
for (const k in mcache) if (mcache[k].envMapIntensity === 1) mcache[k].envMapIntensity = .45;
buildPreview();
document.querySelectorAll('.hcard').forEach(c => { const H = HEROES[+c.dataset.h]; c.querySelector('b').textContent = H.n; c.querySelector('small').textContent = H.ruolo; });
$('play').disabled = false; $('play').textContent = 'GIOCA';
requestAnimationFrame(loop);
window.__game = { player, ents, storm, Q, HEROES, dbgLand() { busT = BUSDUR + 3; phase = 'play'; for (const e of ents) { const h = houses[(rnd() * houses.length) | 0], x = h.x + rr(-9, 9), z = h.z + 7 + rr(0, 4); e.state = 'ground'; e.pos.set(x, groundAt(x, z, 99), z); e.vel.set(0, 0, 0); e.p.g.visible = true; e.onGround = true; } }, setHero: i => setHero(i), get pv() { return pv; }, get phase() { return phase; }, set fire(v) { firing = v; } };
