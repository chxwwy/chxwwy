import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// 4 kademeli anime gölge rampası
const gradient = (() => {
  const d = new Uint8Array([85, 140, 205, 255]);
  const t = new THREE.DataTexture(d, 4, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

export const toon = (color: THREE.ColorRepresentation, opts: THREE.MeshToonMaterialParameters = {}) =>
  new THREE.MeshToonMaterial({ color, gradientMap: gradient, ...opts });

const outlineCache = new Map<string, THREE.ShaderMaterial>();
function outlineMat(thickness: number, color = 0x3a2626) {
  const key = thickness + '_' + color;
  let m = outlineCache.get(key);
  if (!m) {
    m = new THREE.ShaderMaterial({
      uniforms: { t: { value: thickness }, c: { value: new THREE.Color(color) } },
      vertexShader: `uniform float t; void main(){ vec3 p = position + normalize(normal) * t; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: `uniform vec3 c; void main(){ gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide,
    });
    outlineCache.set(key, m);
  }
  return m;
}

function smooth(geo: THREE.BufferGeometry) {
  const g = geo.clone();
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const m = mergeVertices(g, 1e-4);
  m.computeVertexNormals();
  return m;
}

export interface MkOpts {
  outline?: number;
  cast?: boolean;
  receive?: boolean;
  outlineColor?: number;
}

/** Anime kontur (inverted hull) çizgili mesh üretir */
export function mk(geo: THREE.BufferGeometry, mat: THREE.Material, o: MkOpts = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = o.cast ?? true;
  m.receiveShadow = o.receive ?? false;
  const th = o.outline ?? 0.011;
  if (th > 0) {
    const ol = new THREE.Mesh(smooth(geo), outlineMat(th, o.outlineColor));
    ol.userData.outline = true;
    m.add(ol);
  }
  return m;
}

// ---------- Animasyon yardımcıları ----------
export type Ease = 'lin' | 'in' | 'out' | 'io';
export interface Key {
  t: number;
  v: number[];
  e?: Ease;
}
export const k = (t: number, v: number[], e: Ease = 'io'): Key => ({ t, v, e });

function ease(e: Ease | undefined, u: number) {
  switch (e) {
    case 'in':
      return u * u * u;
    case 'out':
      return 1 - Math.pow(1 - u, 3);
    case 'lin':
      return u;
    default:
      return u * u * (3 - 2 * u);
  }
}

export function sample(keys: Key[], t: number, out: number[] = []) {
  const n = keys[0].v.length;
  if (t <= keys[0].t) {
    for (let i = 0; i < n; i++) out[i] = keys[0].v[i];
    return out;
  }
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i].t) {
      const a = keys[i - 1],
        b = keys[i];
      const u = ease(b.e, (t - a.t) / Math.max(1e-5, b.t - a.t));
      for (let j = 0; j < n; j++) out[j] = a.v[j] + (b.v[j] - a.v[j]) * u;
      return out;
    }
  }
  const l = keys[keys.length - 1];
  for (let i = 0; i < n; i++) out[i] = l.v[i];
  return out;
}

// ---------- 2 kemikli IK ----------
export interface Arm {
  upper: THREE.Group;
  lower: THREE.Group;
  hand: THREE.Group;
  L1: number;
  L2: number;
  side: number;
}

const DOWN = new THREE.Vector3(0, -1, 0);
const _t = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Vector3();
const _q = new THREE.Quaternion();

export function solveArm(arm: Arm, targetWorld: THREE.Vector3, pole: THREE.Vector3) {
  const parent = arm.upper.parent!;
  parent.updateWorldMatrix(true, false);
  const T = parent.worldToLocal(_t.copy(targetWorld));
  const S = arm.upper.position;
  _d.copy(T).sub(S);
  let dist = _d.length();
  const maxR = (arm.L1 + arm.L2) * 0.995;
  const minR = Math.abs(arm.L1 - arm.L2) + 0.05;
  dist = Math.min(maxR, Math.max(minR, dist));
  _d.normalize();
  const cosA = Math.max(-1, Math.min(1, (arm.L1 * arm.L1 + dist * dist - arm.L2 * arm.L2) / (2 * arm.L1 * dist)));
  const a = Math.acos(cosA);
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_p.lengthSq() < 1e-5) _p.set(0, 0, -1).addScaledVector(_d, _d.z);
  _p.normalize();
  const elbowDir = new THREE.Vector3().copy(_d).multiplyScalar(Math.cos(a)).addScaledVector(_p, Math.sin(a));
  arm.upper.quaternion.setFromUnitVectors(DOWN, elbowDir);
  _e.copy(S).addScaledVector(elbowDir, arm.L1);
  const tc = new THREE.Vector3().copy(S).addScaledVector(_d, dist);
  const lowerDir = tc.sub(_e).normalize();
  _q.setFromUnitVectors(DOWN, lowerDir);
  arm.lower.quaternion.copy(arm.upper.quaternion).invert().multiply(_q);
}

export function makeArm(o: {
  side: number;
  L1: number;
  L2: number;
  rUp: number;
  rLow: number;
  upMat: THREE.Material;
  lowMat: THREE.Material;
  handMat: THREE.Material;
  fingerMat?: THREE.Material;
}): Arm {
  const upper = new THREE.Group();
  const up = mk(new THREE.CapsuleGeometry(o.rUp, o.L1 - o.rUp * 2, 4, 10), o.upMat, { outline: 0.008 });
  up.position.y = -o.L1 / 2;
  upper.add(up);
  const lower = new THREE.Group();
  lower.position.y = -o.L1;
  const lo = mk(new THREE.CapsuleGeometry(o.rLow, o.L2 - o.rLow * 2, 4, 10), o.lowMat, { outline: 0.008 });
  lo.position.y = -o.L2 / 2;
  lower.add(lo);
  const hand = new THREE.Group();
  hand.position.y = -o.L2;
  const palm = mk(new THREE.SphereGeometry(o.rLow * 1.2, 12, 10), o.handMat, { outline: 0.007 });
  palm.scale.set(0.95, 1.1, 0.85);
  hand.add(palm);
  // barış işareti için iki parmak
  const fingers = new THREE.Group();
  const fm = o.fingerMat ?? o.handMat;
  for (const s of [-1, 1]) {
    const f = mk(new THREE.CapsuleGeometry(0.02, 0.1, 3, 6), fm, { outline: 0.005 });
    f.position.set(s * 0.028, -0.115, 0);
    f.rotation.z = s * 0.2;
    fingers.add(f);
  }
  fingers.visible = false;
  hand.add(fingers);
  hand.userData.fingers = fingers;
  lower.add(hand);
  upper.add(lower);
  return { upper, lower, hand, L1: o.L1, L2: o.L2, side: o.side };
}

// ---------- Yüz dokuları ----------
export type FaceKind = 'normal' | 'happy' | 'hit';

export function faceTexture(kind: FaceKind, o: { iris: [string, string]; blush: boolean; sweat?: boolean; serious?: boolean }) {
  const W = 512,
    H = 384;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, W, H);
  const ink = '#33201f';
  const cy = 238;
  for (const s of [-1, 1]) {
    const cx = 256 + s * 120;
    if (kind === 'happy') {
      g.strokeStyle = ink;
      g.lineWidth = 11;
      g.lineCap = 'round';
      g.beginPath();
      g.arc(cx, cy + 22, 42, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    } else {
      const rx = 56,
        ry = 72;
      g.fillStyle = '#fff8ee';
      g.beginPath();
      g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
      const grad = g.createLinearGradient(0, cy - ry, 0, cy + ry);
      grad.addColorStop(0, o.iris[0]);
      grad.addColorStop(1, o.iris[1]);
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(cx, cy + 4, 45, kind === 'hit' ? 40 : 62, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#2b1410';
      g.beginPath();
      g.ellipse(cx, cy + 6, 19, kind === 'hit' ? 18 : 28, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(cx - 15, cy - 22, 14, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(cx + 15, cy + 24, 7, 0, Math.PI * 2);
      g.fill();
      // üst kapak (hafif ciddi bakış)
      g.fillStyle = ink;
      g.beginPath();
      g.ellipse(cx, cy, rx + 4, ry + 4, 0, Math.PI * 1.05, Math.PI * 1.95);
      g.lineTo(cx + rx, cy - ry * (o.serious ? 0.35 : 0.5));
      g.fill();
      g.strokeStyle = ink;
      g.lineWidth = 8;
      g.lineCap = 'round';
      g.beginPath();
      g.ellipse(cx, cy, rx + 2, ry + 2, 0, Math.PI * 1.02, Math.PI * 1.98);
      g.stroke();
      // üst kapağın altından çizilen çizgi
      g.fillStyle = o.iris[0];
      g.globalAlpha = 0.0;
      g.globalAlpha = 1;
    }
    // kaşlar
    g.strokeStyle = '#7a5a48';
    g.lineWidth = 8;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx - s * 44, cy - 108 + (kind === 'hit' ? -8 : 4));
    g.lineTo(cx + s * 40, cy - 112 + (kind === 'hit' ? 8 : 0));
    g.stroke();
    if (o.blush) {
      g.fillStyle = 'rgba(255,110,120,0.55)';
      g.beginPath();
      g.ellipse(cx + s * 22, cy + 82, 30, 18, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  // ağız
  g.strokeStyle = ink;
  g.fillStyle = '#c94a55';
  g.lineWidth = 7;
  g.lineCap = 'round';
  if (kind === 'happy') {
    g.beginPath();
    g.arc(256, 318, 24, 0, Math.PI);
    g.closePath();
    g.fill();
    g.stroke();
  } else if (kind === 'hit') {
    g.beginPath();
    g.ellipse(256, 322, 12, 16, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  } else {
    g.beginPath();
    g.moveTo(236, 322);
    g.quadraticCurveTo(256, 314, 276, 322);
    g.stroke();
  }
  if (o.sweat) {
    g.fillStyle = '#9fd4ff';
    g.strokeStyle = '#4a6a8a';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(104, 120);
    g.quadraticCurveTo(84, 156, 104, 166);
    g.quadraticCurveTo(124, 156, 104, 120);
    g.fill();
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Kafa küresinin önüne oturan UV'li yama (yüz) */
export function facePatch(radius: number, tex: THREE.Texture) {
  const geo = new THREE.SphereGeometry(radius, 32, 24, Math.PI / 2 - 0.8, 1.6, 0.9, 1.2);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 2;
  return m;
}
