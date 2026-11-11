import * as THREE from 'three';
import { mk, toon } from './toon';

function dummyFace() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 192;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#2b1b12';
  g.lineWidth = 9;
  g.lineCap = 'round';
  for (const s of [-1, 1]) {
    const cx = 128 + s * 52,
      cy = 86;
    g.beginPath();
    g.moveTo(cx - 17, cy - 17);
    g.lineTo(cx + 17, cy + 17);
    g.moveTo(cx + 17, cy - 17);
    g.lineTo(cx - 17, cy + 17);
    g.stroke();
  }
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(88, 142);
  for (let i = 0; i < 7; i++) g.lineTo(88 + (i + 1) * 13, 142 + (i % 2 ? 0 : 10));
  g.stroke();
  g.fillStyle = 'rgba(255,100,100,0.5)';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(128 + s * 88, 124, 18, 11, 0, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let faceTex: THREE.Texture | null = null;

export class Dummy {
  root = new THREE.Group();
  pivot = new THREE.Group();
  hp = 600;
  maxHp = 600;
  ax = 0;
  az = 0;
  vx = 0;
  vz = 0;
  flash = 0;
  dead = false;
  deadT = 0;
  lastDir = new THREE.Vector3(0, 0, 1);
  hitT = 99;
  radius = 0.62;
  mats: THREE.MeshToonMaterial[] = [];
  head: THREE.Group;
  hat: THREE.Object3D;

  constructor(x: number, z: number) {
    const reg = (m: THREE.MeshToonMaterial) => {
      this.mats.push(m);
      return m;
    };
    const wood = reg(toon(0x8a5e3c));
    const darkWood = toon(0x5a3c28);
    const burlap = reg(toon(0xd2ae72));
    const rope = reg(toon(0x9a7440));
    const red = reg(toon(0xd1453b));
    const white = reg(toon(0xf6efe0));

    this.root.position.set(x, 0, z);
    const base = mk(new THREE.CylinderGeometry(0.62, 0.7, 0.2, 20), darkWood, { outline: 0.018, receive: true });
    base.position.y = 0.1;
    this.root.add(base);
    this.pivot.position.y = 0.2;
    this.root.add(this.pivot);

    const post = mk(new THREE.CylinderGeometry(0.1, 0.12, 1.5, 10), wood, { outline: 0.014 });
    post.position.y = 0.75;
    this.pivot.add(post);
    const body = mk(new THREE.CapsuleGeometry(0.34, 0.7, 6, 14), burlap, { outline: 0.016 });
    body.position.y = 1.3;
    this.pivot.add(body);
    for (const y of [0.98, 1.62]) {
      const r = mk(new THREE.TorusGeometry(0.345, 0.03, 6, 20), rope, { outline: 0.006 });
      r.rotation.x = Math.PI / 2;
      r.position.y = y;
      this.pivot.add(r);
    }
    const arms = mk(new THREE.CylinderGeometry(0.06, 0.06, 1.7, 8), wood, { outline: 0.012 });
    arms.rotation.z = Math.PI / 2;
    arms.position.y = 1.5;
    this.pivot.add(arms);
    for (const s of [-1, 1]) {
      const h = mk(new THREE.SphereGeometry(0.15, 12, 10), burlap, { outline: 0.01 });
      h.position.set(s * 0.88, 1.5, 0);
      this.pivot.add(h);
    }
    // hedef tahtası
    const rings: [number, THREE.Material, number][] = [
      [0.24, red, 0.0],
      [0.17, white, 0.004],
      [0.1, red, 0.008],
      [0.045, white, 0.012],
    ];
    for (const [r, m, o] of rings) {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.02, 20), m);
      d.rotation.x = Math.PI / 2;
      d.position.set(0, 1.28, 0.335 + o);
      this.pivot.add(d);
    }
    // kafa
    this.head = new THREE.Group();
    this.head.position.y = 2.0;
    const hs = mk(new THREE.SphereGeometry(0.29, 20, 16), burlap, { outline: 0.014 });
    this.head.add(hs);
    faceTex = faceTex ?? dummyFace();
    const fp = new THREE.Mesh(
      new THREE.SphereGeometry(0.294, 24, 18, Math.PI / 2 - 0.8, 1.6, 0.9, 1.2),
      new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
    );
    this.head.add(fp);
    const scarf = mk(new THREE.TorusGeometry(0.2, 0.07, 8, 20), red, { outline: 0.008 });
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = -0.27;
    this.head.add(scarf);
    const hatBase = mk(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 20), reg(toon(0xe2c46a)), { outline: 0.01 });
    hatBase.position.y = 0.22;
    this.head.add(hatBase);
    const hatTop = mk(new THREE.CylinderGeometry(0.17, 0.25, 0.2, 16), reg(toon(0xe2c46a)), { outline: 0.01 });
    hatTop.position.y = 0.34;
    this.head.add(hatTop);
    const band = mk(new THREE.CylinderGeometry(0.255, 0.255, 0.05, 16), red, { outline: 0.006 });
    band.position.y = 0.27;
    this.head.add(band);
    this.hat = hatBase;
    this.pivot.add(this.head);

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !o.userData.outline) (o as THREE.Mesh).castShadow = true;
    });
  }

  get pos() {
    return this.root.position;
  }

  hit(dmg: number, dir: THREE.Vector3, power: number) {
    if (this.dead) return false;
    this.hp = Math.max(0, this.hp - dmg);
    this.vx += dir.x * power;
    this.vz += dir.z * power;
    this.flash = 1;
    this.hitT = 0;
    this.lastDir.copy(dir);
    if (this.hp <= 0) {
      this.dead = true;
      this.deadT = 0;
      return true;
    }
    return false;
  }

  update(dt: number) {
    this.hitT += dt;
    if (this.dead) {
      this.deadT += dt;
      const target = 1.45;
      const f = Math.min(1, this.deadT * 3);
      const ease = f * f;
      this.ax = this.lastDir.x * target * ease;
      this.az = this.lastDir.z * target * ease;
      this.vx = this.vz = 0;
      if (this.deadT > 2.6) {
        this.dead = false;
        this.hp = this.maxHp;
        this.ax = this.az = 0;
      }
    } else {
      const k = 55,
        c = 5.2;
      this.vx += (-k * this.ax - c * this.vx) * dt;
      this.vz += (-k * this.az - c * this.vz) * dt;
      this.ax += this.vx * dt;
      this.az += this.vz * dt;
      const m = 0.7;
      this.ax = Math.max(-m, Math.min(m, this.ax));
      this.az = Math.max(-m, Math.min(m, this.az));
    }
    this.pivot.rotation.set(this.az, 0, -this.ax);
    this.head.rotation.set(Math.sin(this.hitT * 22) * 0.2 * Math.exp(-this.hitT * 4), 0, Math.cos(this.hitT * 18) * 0.25 * Math.exp(-this.hitT * 4));
    this.flash = Math.max(0, this.flash - dt * 5);
    for (const m of this.mats) m.emissive.setRGB(this.flash * 0.9, this.flash * 0.55, this.flash * 0.35);
  }
}
