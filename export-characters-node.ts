import * as THREE from 'three';
import characterModels from './src/game/character-models.json' with { type: 'json' };
import { mk, toon, makeArm, solveArm, faceTexture, facePatch, type Arm, type FaceKind } from './src/game/toon.ts';

const V = THREE.Vector3;
const UP = new V(0, 1, 0);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function rollReachTarget(root: THREE.Group, arm: Arm, target: THREE.Vector3, clearance: number, drop: number) {
  root.worldToLocal(arm.upper.getWorldPosition(target));
  target.x += arm.side * 0.07;
  target.y = Math.max(clearance, target.y - drop);
  target.z += 0.4;
  return root.localToWorld(target);
}

const GOLD = 0xdcae3c;
const [spearGripX, spearGripY, spearGripZ] = characterModels.spearGripPosition;
const [, spearGripUp, spearGripForward] = characterModels.spearGripDirection;

function modelGeometry(data: { positions: number[]; normals: number[]; indices: number[] }) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
  geometry.setIndex(data.indices);
  return geometry;
}

export class SpearGirl {
  root = new THREE.Group();
  pivot = new THREE.Group();
  rig = new THREE.Group();
  up = new THREE.Group();
  head = new THREE.Group();
  spear = new THREE.Group();
  skirt = new THREE.Group();
  cape = new THREE.Group();
  legL!: THREE.Group;
  legR!: THREE.Group;
  armR!: Arm;
  armL!: Arm;
  faceMesh: THREE.Mesh;
  faces: Record<FaceKind, THREE.Texture>;
  strands: { g: THREE.Group; side: number; ph: number }[] = [];
  phase = 0;
  faceKind: FaceKind = 'normal';
  readonly tipLocal = new V(0, 1.55, 0);

  constructor() {
    const skin = toon(0xf6d2c4);
    const white = toon(0xf5f2ea);
    const gray = toon(0x9a9ca4, { side: THREE.DoubleSide });
    const lightGray = toon(0xd7d8db, { side: THREE.DoubleSide });
    const gold = toon(GOLD, { emissive: 0x3a2800 });
    const hairMat = toon(0xcdb797);

    this.root.add(this.pivot);
    this.pivot.position.y = 1;
    this.pivot.add(this.rig);
    this.rig.position.y = -1;

    // --- bacaklar (çıplak ayak) ---
    const mkLeg = (x: number) => {
      const g = new THREE.Group();
      g.position.set(x, 0.82, 0);
      const l = mk(new THREE.CapsuleGeometry(0.07, 0.5, 4, 10), skin, { outline: 0.008 });
      l.position.y = -0.4;
      g.add(l);
      const foot = mk(new THREE.SphereGeometry(0.09, 12, 10), skin, { outline: 0.008 });
      foot.scale.set(0.85, 0.5, 1.5);
      foot.position.set(0, characterModels.spearFeetY[x < 0 ? 0 : 1], 0.05);
      g.add(foot);
      const an = mk(new THREE.TorusGeometry(0.075, 0.012, 6, 16), gold, { outline: 0.004 });
      an.rotation.x = Math.PI / 2;
      an.position.y = -0.62;
      g.add(an);
      this.rig.add(g);
      return g;
    };
    this.legR = mkLeg(-0.1);
    this.legL = mkLeg(0.1);

    // --- etek (pilili) ---
    const sg = new THREE.CylinderGeometry(0.3, 0.47, 0.68, 30, 1, true);
    const pos = sg.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        z = pos.getZ(i),
        y = pos.getY(i);
      const a = Math.atan2(z, x);
      const f = 1 + 0.045 * Math.sin(a * 15) * (y < 0 ? 1 : 0.4);
      pos.setX(i, x * f);
      pos.setZ(i, z * f);
    }
    sg.computeVertexNormals();
    const skirtMesh = mk(sg, lightGray, { outline: 0.01 });
    skirtMesh.position.y = 0.66;
    this.skirt.add(skirtMesh);
    // yırtık etek ucu
    const hem = mk(new THREE.CylinderGeometry(0.463, 0.476, 0.07, 30, 1, true), toon(0xeceae4, { side: THREE.DoubleSide }), { outline: 0 });
    hem.position.y = 0.36;
    this.skirt.add(hem);
    this.rig.add(this.skirt);

    // --- üst gövde ---
    this.up.position.y = 1;
    this.rig.add(this.up);
    const waist = mk(new THREE.TorusGeometry(0.255, 0.05, 8, 28), toon(0xb4b5bb), { outline: 0.008 });
    waist.rotation.x = Math.PI / 2;
    waist.position.y = 0.03;
    this.up.add(waist);
    const torso = mk(new THREE.CylinderGeometry(0.185, 0.215, 0.52, 22), white, { outline: 0.01 });
    torso.position.y = 0.26;
    this.up.add(torso);
    const neck = mk(new THREE.CylinderGeometry(0.055, 0.06, 0.12, 10), skin, { outline: 0.006 });
    neck.position.y = 0.56;
    this.up.add(neck);
    const scarf = mk(new THREE.TorusGeometry(0.165, 0.07, 10, 24), gray, { outline: 0.008 });
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 0.53;
    this.up.add(scarf);
    const drape = mk(new THREE.SphereGeometry(0.15, 14, 10), toon(0x8d8f97), { outline: 0.008 });
    drape.scale.set(1.15, 0.8, 0.55);
    drape.position.set(0, 0.45, 0.13);
    this.up.add(drape);
    // madalyonlar
    const medals: [number, number, number, number][] = [
      [-0.085, 0.34, 0.19, 0.03],
      [0.09, 0.36, 0.188, 0.034],
      [0, 0.26, 0.2, 0.03],
      [-0.11, 0.16, 0.2, 0.032],
      [0.11, 0.17, 0.2, 0.03],
      [0, 0.07, 0.21, 0.03],
    ];
    medals.forEach(([x, y, z, r], i) => {
      const m = mk(new THREE.CylinderGeometry(r, r, 0.012, 14), i % 2 ? gold : toon(0x6a6a72), { outline: 0.004 });
      m.rotation.x = Math.PI / 2;
      m.position.set(x, y, z);
      this.up.add(m);
    });
    const chain = mk(modelGeometry(characterModels.spearChain), toon(0xbfc1c8), { outline: 0 });
    this.up.add(chain);
    for (const s of [-1, 1]) {
      const sh = mk(new THREE.SphereGeometry(0.085, 12, 10), white, { outline: 0.008 });
      sh.position.set(s * 0.225, 0.45, 0);
      this.up.add(sh);
    }
    // pelerin
    this.cape.position.set(0, 0.52, 0);
    const capeMesh = mk(modelGeometry(characterModels.spearCape), gray, { outline: 0.008 });
    this.cape.add(capeMesh);
    this.up.add(this.cape);

    // --- kollar ---
    const wrap = toon(0x8f9198);
    const mkA = (side: number) => {
      const a = makeArm({ side, L1: 0.3, L2: 0.29, rUp: 0.072, rLow: 0.058, upMat: white, lowMat: skin, handMat: skin });
      a.upper.position.set(side * 0.235, 0.45, 0);
      const w = mk(new THREE.CylinderGeometry(0.066, 0.07, 0.09, 12), wrap, { outline: 0.005 });
      w.position.y = -a.L2 + 0.075;
      a.lower.add(w);
      this.up.add(a.upper);
      return a;
    };
    this.armR = mkA(-1);
    this.armL = mkA(1);

    // --- kafa ---
    this.head.position.y = 0.8;
    this.up.add(this.head);
    const skull = mk(new THREE.SphereGeometry(0.3, 32, 24), skin, { outline: 0.012 });
    this.head.add(skull);
    this.faces = {
      normal: faceTexture('normal', { iris: ['#f4b04a', '#b8541c'], blush: false, sweat: true, serious: true }),
      happy: faceTexture('happy', { iris: ['#f4b04a', '#b8541c'], blush: true, sweat: false }),
      hit: faceTexture('hit', { iris: ['#f4b04a', '#b8541c'], blush: false, sweat: true }),
    };
    this.faceMesh = facePatch(0.304, this.faces.normal);
    this.head.add(this.faceMesh);
    const hair = mk(new THREE.SphereGeometry(0.316, 32, 20, 0, Math.PI * 2, 0, 1.12), hairMat, { outline: 0.01 });
    this.head.add(hair);
    for (const s of [-1, 1]) {
      const lock = mk(new THREE.CapsuleGeometry(0.04, 0.2, 4, 8), hairMat, { outline: 0.006 });
      lock.position.set(s * 0.285, -0.1, 0.06);
      this.head.add(lock);
    }
    const veil = mk(modelGeometry(characterModels.spearHood), gray, { outline: 0.01 });
    this.head.add(veil);
    const strandCfg = [
      { x: -0.3, z: 0.02, len: 0.78, w: 0.17, side: -1 },
      { x: 0.3, z: 0.02, len: 0.78, w: 0.17, side: 1 },
      { x: 0, z: -0.3, len: 1.0, w: 0.4, side: 0 },
    ];
    strandCfg.forEach((c, i) => {
      const g = new THREE.Group();
      g.position.set(c.x, -0.02, c.z);
      const m = mk(new THREE.BoxGeometry(c.w, c.len, 0.04), gray, { outline: 0.007 });
      m.position.y = -c.len / 2;
      g.add(m);
      this.head.add(g);
      this.strands.push({ g, side: c.side, ph: i * 1.7 });
    });
    const band = mk(new THREE.TorusGeometry(0.327, 0.018, 8, 40), gold, { outline: 0.005 });
    band.rotation.x = Math.PI / 2 - 0.05;
    band.position.y = 0.16;
    this.head.add(band);
    const tab = mk(new THREE.BoxGeometry(0.05, 0.17, 0.02), gold, { outline: 0.005 });
    tab.position.set(0, 0.2, 0.325);
    tab.rotation.x = -0.25;
    this.head.add(tab);
    const gem = mk(new THREE.OctahedronGeometry(0.03), toon(0xf3efe6), { outline: 0.004 });
    gem.position.set(0, 0.275, 0.33);
    this.head.add(gem);

    // --- mızrak ---
    const black = toon(0x1c1c22);
    const silver = toon(0xe9edf4, { emissive: 0x222a33 });
    const shaft = mk(new THREE.CylinderGeometry(0.028, 0.028, 1.9, 10), black, { outline: 0.007 });
    shaft.position.y = 0.1;
    this.spear.add(shaft);
    const butt = mk(new THREE.SphereGeometry(0.036, 8, 8), gold, { outline: 0.005 });
    butt.position.y = -0.85;
    this.spear.add(butt);
    for (const y of [0.05, 0.42]) {
      const r = mk(new THREE.CylinderGeometry(0.04, 0.04, 0.07, 10), gold, { outline: 0.004 });
      r.position.y = y;
      this.spear.add(r);
    }
    const collar = mk(new THREE.CylinderGeometry(0.052, 0.052, 0.1, 10), gold, { outline: 0.005 });
    collar.position.y = 0.88;
    this.spear.add(collar);
    const socket = mk(new THREE.CylinderGeometry(0.075, 0.03, 0.22, 6), gold, { outline: 0.006 });
    socket.position.y = 1.0;
    this.spear.add(socket);
    const guard = mk(new THREE.BoxGeometry(0.66, 0.045, 0.045), gold, { outline: 0.006 });
    guard.position.y = 0.78;
    this.spear.add(guard);
    for (const s of [-1, 1]) {
      const f = mk(new THREE.OctahedronGeometry(0.04), gold, { outline: 0.004 });
      f.position.set(s * 0.34, 0.78, 0);
      this.spear.add(f);
    }
    const blade = mk(new THREE.ConeGeometry(0.068, 0.46, 4), silver, { outline: 0.007 });
    blade.scale.z = 0.4;
    blade.rotation.y = Math.PI / 4;
    blade.position.y = 1.32;
    this.spear.add(blade);
    this.rig.add(this.spear);

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !o.userData.outline && o !== this.faceMesh) (o as THREE.Mesh).castShadow = true;
    });
    this.faceMesh.castShadow = false;
  }

  setFace(kind: FaceKind) {
    if (kind === this.faceKind) return;
    this.faceKind = kind;
    (this.faceMesh.material as THREE.MeshBasicMaterial).map = this.faces[kind];
  }

  spearTip(out = new V()) {
    return this.spear.localToWorld(out.copy(this.tipLocal));
  }

  private _P = new V();
  private _D = new V();
  private _t = new V();

  animate(
    dt: number,
    o: { time: number; speed: number; atkW: number; atk: number[] | null; peaceW: number; roll: number; tuck?: number; reach?: number; lift: number }
  ) {
    const sp = Math.min(1, o.speed / 6);
    this.phase += dt * o.speed * 1.5;
    const walk = Math.min(1, o.speed / 4);
    const sw = Math.sin(this.phase) * walk * 0.75;
    this.legL.rotation.x = sw + 0.3 * o.atkW;
    this.legR.rotation.x = -sw - 0.4 * o.atkW;
    const tuck = o.tuck ?? 0;
    const reach = o.reach ?? 0;
    this.pivot.rotation.set(o.roll, 0, -0.22 * tuck);
    this.pivot.position.y = 1 + o.lift;
    this.rig.scale.y = 1 - tuck * 0.32;
    this.rig.position.y = -this.rig.scale.y + Math.abs(Math.sin(this.phase)) * 0.06 * sp;
    this.legL.rotation.x = lerp(this.legL.rotation.x, -1.35, tuck);
    this.legR.rotation.x = lerp(this.legR.rotation.x, -1.65, tuck);

    const atk = o.atk;
    const pitchA = atk ? atk[7] : 0;
    const yawA = atk ? atk[6] : 0;
    this.up.position.y = 1 + Math.sin(o.time * 2.2) * 0.006;
    this.up.rotation.set(sp * 0.1 + pitchA * o.atkW, yawA * o.atkW, 0);
    this.head.rotation.set(-(sp * 0.1 + pitchA * o.atkW) * 0.6, -yawA * o.atkW * 0.5, Math.sin(o.time * 0.8) * 0.03 + o.peaceW * 0.1);

    this.skirt.rotation.x = sw * 0.06 - sp * 0.04;
    this.skirt.rotation.z = Math.sin(this.phase * 0.5) * 0.02 * walk;
    this.cape.rotation.x = sp * 0.45 + Math.sin(o.time * 2) * 0.03 + Math.abs(yawA * o.atkW) * 0.1;
    for (const s of this.strands) {
      s.g.rotation.x = Math.sin(o.time * 2 + s.ph) * 0.04 + sp * 0.55;
      s.g.rotation.z = s.side * (0.05 + Math.sin(o.time * 1.7 + s.ph) * 0.03 + sp * 0.12);
    }

    // mızrak duruşu
    const P = this._P.set(lerp(spearGripX, -0.3, sp), lerp(spearGripY, 0.98, sp), lerp(spearGripZ, 0.22, sp));
    const D = this._D.set(0, lerp(spearGripUp, 0.8, sp), lerp(spearGripForward, 0.6, sp));
    if (atk && o.atkW > 0) {
      P.set(lerp(P.x, atk[0], o.atkW), lerp(P.y, atk[1], o.atkW), lerp(P.z, atk[2], o.atkW));
      D.set(lerp(D.x, atk[3], o.atkW), lerp(D.y, atk[4], o.atkW), lerp(D.z, atk[5], o.atkW));
    }
    P.lerp(new V(-0.28, 0.95, 0.08), tuck);
    D.lerp(new V(-1, 0.12, 0.12), Math.max(tuck, reach));
    this.up.rotation.x += tuck * 0.65;
    this.head.rotation.x -= tuck * 0.45;
    if (reach > 0) {
      const target = rollReachTarget(this.root, this.armR, this._t, 0.32, 0.36);
      P.lerp(this.rig.worldToLocal(target), reach);
    }
    D.normalize();
    this.spear.position.copy(P);
    this.spear.quaternion.setFromUnitVectors(UP, D);
    this.root.updateMatrixWorld(true);

    // IK
    const tR = this.spear.localToWorld(this._t.set(0, 0, 0));
    solveArm(this.armR, tR, new V(-0.5, -0.4, -0.7));
    const grip = this.spear.localToWorld(new V(0, 0.58, 0));
    const rest = this.rig.localToWorld(new V(0.3, 0.84, 0.1));
    const peace = this.rig.localToWorld(new V(0.33, 1.64, 0.32));
    const hold = rest.lerp(peace, o.peaceW);
    const rollHand = this.rig.localToWorld(this._t.set(0.15, 0.92, 0.34));
    hold.lerp(grip, o.atkW).lerp(rollHand, tuck);
    if (reach > 0) hold.lerp(rollReachTarget(this.root, this.armL, this._t, 0.09, 0.54), reach);
    solveArm(this.armL, hold, new V(0.5, -0.4, -0.7));
    (this.armL.hand.userData.fingers as THREE.Object3D).visible = o.peaceW > 0.6 && o.atkW < 0.3 && tuck < 0.1;
  }
}

// =====================================================================

export class HammerGirl {
  root = new THREE.Group();
  pivot = new THREE.Group();
  rig = new THREE.Group();
  up = new THREE.Group();
  head = new THREE.Group();
  robe: THREE.Mesh;
  hammer = new THREE.Group();
  headG = new THREE.Group();
  armR!: Arm;
  armL!: Arm;
  footL = new THREE.Group();
  footR = new THREE.Group();
  faceMesh: THREE.Mesh;
  faces: Record<FaceKind, THREE.Texture>;
  faceKind: FaceKind = 'normal';
  phase = 0;

  constructor() {
    const cream = toon(0xf1ebdb, { side: THREE.DoubleSide });
    const skin = toon(0xf6d0c2);
    const glove = toon(0xf8f6f0);
    const gold = toon(GOLD, { emissive: 0x3a2800 });
    const hGold = toon(0xdcb43e, { emissive: 0x4a3600 });
    const hDark = toon(0xb98b29, { emissive: 0x2a1c00 });

    this.root.add(this.pivot);
    this.pivot.position.y = 1;
    this.pivot.add(this.rig);
    this.rig.position.y = -1;

    // cüppe (lathe + kıvrım)
    const pts = [
      [0.84, 0],
      [0.82, 0.08],
      [0.72, 0.36],
      [0.53, 0.66],
      [0.37, 0.9],
      [0.27, 1.08],
      [0.2, 1.2],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const lg = new THREE.LatheGeometry(pts, 36);
    const p = lg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        z = p.getZ(i),
        y = p.getY(i);
      const a = Math.atan2(z, x);
      const f = 1 + 0.04 * Math.sin(a * 13) * (1 - y / 1.4);
      p.setX(i, x * f);
      p.setZ(i, z * f);
    }
    lg.computeVertexNormals();
    this.robe = mk(lg, cream, { outline: 0.012 });
    this.rig.add(this.robe);

    // ayaklar
    for (const [g, x] of [
      [this.footL, 0.3],
      [this.footR, -0.3],
    ] as [THREE.Group, number][]) {
      g.position.set(x, 0.06, 0.58);
      const f = mk(new THREE.SphereGeometry(0.12, 12, 10), skin, { outline: 0.008 });
      f.scale.set(0.9, 0.5, 1.5);
      g.add(f);
      this.rig.add(g);
    }

    this.up.position.y = 0.85;
    this.rig.add(this.up);
    const shoulders = mk(new THREE.SphereGeometry(0.25, 16, 12), cream, { outline: 0.01 });
    shoulders.scale.set(1.1, 0.85, 0.9);
    shoulders.position.y = 0.2;
    this.up.add(shoulders);

    const mkA = (side: number) => {
      const a = makeArm({ side, L1: 0.36, L2: 0.34, rUp: 0.09, rLow: 0.075, upMat: cream, lowMat: cream, handMat: glove });
      a.upper.position.set(side * 0.25, 0.26, 0);
      this.up.add(a.upper);
      return a;
    };
    this.armR = mkA(-1);
    this.armL = mkA(1);

    // kafa + başlık
    this.head.position.y = 0.6;
    this.up.add(this.head);
    const skull = mk(new THREE.SphereGeometry(0.33, 32, 24), skin, { outline: 0.012 });
    this.head.add(skull);
    this.faces = {
      normal: faceTexture('normal', { iris: ['#f2a548', '#b3501b'], blush: true, serious: true }),
      happy: faceTexture('happy', { iris: ['#f2a548', '#b3501b'], blush: true }),
      hit: faceTexture('hit', { iris: ['#f2a548', '#b3501b'], blush: true }),
    };
    this.faceMesh = facePatch(0.334, this.faces.normal);
    this.head.add(this.faceMesh);
    const hood = mk(modelGeometry(characterModels.hammerHood), cream, { outline: 0.012 });
    this.head.add(hood);
    const edge = mk(new THREE.TorusGeometry(0.285, 0.045, 10, 30), cream, { outline: 0.008 });
    edge.scale.y = 1.18;
    edge.position.set(0, -0.01, 0.235);
    this.head.add(edge);
    const collar = mk(new THREE.TorusGeometry(0.26, 0.13, 10, 24), cream, { outline: 0.01 });
    collar.rotation.x = Math.PI / 2;
    collar.position.y = -0.3;
    this.head.add(collar);
    // taç
    const crown = new THREE.Group();
    crown.position.y = 0.17;
    crown.add(
      mk(modelGeometry(characterModels.hammerCrownRing), gold, { outline: 0.005 }),
      mk(modelGeometry(characterModels.hammerCrownOrnament), gold, { outline: 0.005 }),
    );
    this.head.add(crown);

    // çekiç
    const shaft = mk(new THREE.CylinderGeometry(0.045, 0.045, 2.4, 10), hGold, { outline: 0.01 });
    shaft.position.y = 0.1;
    this.hammer.add(shaft);
    for (const y of [-0.35, 0.35, 0.9]) {
      const b = mk(new THREE.CylinderGeometry(0.06, 0.06, 0.09, 10), hDark, { outline: 0.006 });
      b.position.y = y;
      this.hammer.add(b);
    }
    this.headG.position.y = 1.62;
    const barrel = mk(new THREE.CylinderGeometry(0.5, 0.5, 1.05, 8), hGold, { outline: 0.016 });
    barrel.rotation.z = Math.PI / 2;
    barrel.rotation.x = Math.PI / 8;
    this.headG.add(barrel);
    for (const s of [-1, 1]) {
      const r = mk(new THREE.TorusGeometry(0.5, 0.055, 6, 8), hDark, { outline: 0.01 });
      r.rotation.y = Math.PI / 2;
      r.rotation.z = Math.PI / 8;
      r.position.x = s * 0.4;
      this.headG.add(r);
    }
    const top = mk(new THREE.BoxGeometry(0.7, 0.34, 0.62), hGold, { outline: 0.012 });
    top.position.y = 0.52;
    this.headG.add(top);
    for (const s of [-1, 0, 1]) {
      const ridge = mk(new THREE.BoxGeometry(0.2, 0.08, 0.8), hDark, { outline: 0.006 });
      ridge.position.set(s * 0.28, 0.0, 0);
      ridge.position.y = 0.5;
      ridge.position.z = 0;
      ridge.scale.set(1, 0.5, 0.8);
      ridge.position.y = 0.52 + 0.17;
      this.headG.add(ridge);
    }
    const socket = mk(new THREE.CylinderGeometry(0.09, 0.07, 0.3, 8), hDark, { outline: 0.008 });
    socket.position.y = -0.55;
    this.headG.add(socket);
    this.hammer.add(this.headG);
    this.rig.add(this.hammer);

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !o.userData.outline) (o as THREE.Mesh).castShadow = true;
    });
    this.faceMesh.castShadow = false;
  }

  setFace(kind: FaceKind) {
    if (kind === this.faceKind) return;
    this.faceKind = kind;
    (this.faceMesh.material as THREE.MeshBasicMaterial).map = this.faces[kind];
  }

  hammerHeadWorld(out = new V()) {
    return this.headG.getWorldPosition(out);
  }

  private _t = new V();

  /** pose: [Px,Py,Pz, rx, rz, pitch] */
  animate(dt: number, o: { time: number; speed: number; active: number; pose: number[]; gripW: number; roll?: number; tuck?: number; reach?: number; lift?: number }) {
    const a = o.active;
    const walk = Math.min(1, o.speed / 3);
    this.phase += dt * o.speed * 2.4;
    const bob = Math.abs(Math.sin(this.phase)) * 0.07 * walk;
    const tuck = o.tuck ?? 0;
    const reach = o.reach ?? 0;
    this.pivot.rotation.set(o.roll ?? 0, 0, -0.24 * tuck);
    this.pivot.position.y = 1 + (o.lift ?? 0);
    this.rig.scale.y = 1 - tuck * 0.28;
    this.rig.position.y = -this.rig.scale.y + bob;
    this.rig.rotation.z = Math.sin(this.phase) * 0.06 * walk;
    this.up.position.y = 0.85 + 0.24 * a + Math.sin(o.time * 1.8) * 0.01 * (1 - a);
    this.robe.scale.set(1 - 0.17 * tuck, 1 + 0.22 * a, 1 - 0.23 * tuck);
    this.up.rotation.x = o.pose[5] + 0.08 * (1 - a) + 0.55 * tuck;
    this.head.rotation.set(-o.pose[5] * 0.5 - 0.24 * tuck, 0, Math.sin(o.time * 0.9) * 0.025);
    this.footL.position.z = 0.58 + Math.sin(this.phase) * 0.18 * walk;
    this.footR.position.z = 0.58 - Math.sin(this.phase) * 0.18 * walk;
    this.footL.position.y = 0.06 + Math.max(0, Math.cos(this.phase)) * 0.12 * walk;
    this.footR.position.y = 0.06 + Math.max(0, -Math.cos(this.phase)) * 0.12 * walk;

    this.footL.position.z -= 0.23 * tuck;
    this.footR.position.z -= 0.34 * tuck;
    this.footL.position.y += 0.23 * tuck;
    this.footR.position.y += 0.31 * tuck;

    // Keep the hammer across the body while the shoulders turn over.
    this.hammer.position.set(lerp(o.pose[0], -0.19, tuck), lerp(o.pose[1], 0.82, tuck), lerp(o.pose[2], 0.29, tuck));
    this.hammer.rotation.set(o.pose[3], 0, lerp(o.pose[4], 1.52, Math.max(tuck, reach)), 'ZXY');
    if (reach > 0) {
      const target = rollReachTarget(this.root, this.armR, this._t, 0.46, 0.34);
      this.hammer.position.lerp(this.rig.worldToLocal(target), reach);
    }
    this.root.updateMatrixWorld(true);

    const gR = this.hammer.localToWorld(this._t.set(0, 0, 0));
    solveArm(this.armR, gR, new V(-0.6, -0.5, -0.5));
    const gL = this.hammer.localToWorld(new V(0, -0.55, 0));
    const rest = this.rig.localToWorld(new V(0.66, 0.42, 0.36));
    rest.lerp(gL, Math.max(o.gripW, tuck));
    if (reach > 0) rest.lerp(rollReachTarget(this.root, this.armL, this._t, 0.11, 0.63), reach);
    solveArm(this.armL, rest, new V(0.6, -0.5, -0.5));
  }
}