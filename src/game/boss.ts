import * as THREE from 'three';
import { mk, toon, faceTexture, facePatch } from './toon';

const V = THREE.Vector3;
const clamp = THREE.MathUtils.clamp;
const ease = (t: number) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };
export type BossMove = 'combo' | 'thrust' | 'flurry' | 'bloom';
type BossState = 'waiting' | 'chase' | 'attack' | 'recover' | 'transform' | 'dead';
export interface BossStrike {
  center: THREE.Vector3;
  radius: number;
  damage: number;
  facing: number;
  arc: number;
}
export interface BossEvents {
  strike: (hit: BossStrike) => boolean;
  effect: (position: THREE.Vector3, color: number, radius: number) => void;
  announce: (message: string) => void;
  collide: (position: THREE.Vector3, radius: number) => void;
}

/** Original scarlet duelist: deliberately timed windups, locked lunges and punish windows. */
export class BladeBoss {
  readonly name = 'Aelyra, Kızıl Çiçeğin Kılıcı';
  root = new THREE.Group();
  body = new THREE.Group();
  torso = new THREE.Group();
  head = new THREE.Group();
  swordArm = new THREE.Group();
  sword = new THREE.Group();
  cape = new THREE.Group();
  wings = new THREE.Group();
  legs: THREE.Group[] = [];
  hair: THREE.Group[] = [];
  petals: THREE.Object3D[] = [];
  slash = new THREE.Group();
  warning: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  scarlet = toon(0x9b2638);
  armor = toon(0xc6a05b);
  hp = 1200;
  readonly maxHp = 1200;
  readonly radius = 0.65;
  dead = false;
  engaged = false;
  phase: 1 | 2 = 1;
  state: BossState = 'waiting';
  move: BossMove = 'combo';
  timer = 0;
  clock = 0;
  cooldown = 1.2;
  attackIndex = 0;
  eventIndex = 0;
  heading = Math.PI;
  flash = 0;
  deathT = 0;
  private dashFrom = new V();
  private dashTo = new V();
  private dashReady = false;
  private bloomPoint = new V();
  private events: BossEvents;

  get pos() { return this.root.position; }
  get moveName() {
    if (this.state === 'transform') return 'İKİNCİ FAZ · Kızıl Uyanış';
    if (this.state !== 'attack') return this.state === 'recover' ? 'Açık verdi · saldır!' : '';
    return { combo: 'Üç Yaprak · üçlü kılıç kombosu', thrust: 'Altın İğne · ileri saplama',
      flurry: 'Yaprak Fırtınası · üç atılış', bloom: 'Kızıl Çiçek · alandan uzaklaş!' }[this.move];
  }

  constructor(scene: THREE.Scene, events: BossEvents) {
    this.events = events;
    this.root.add(this.body);
    this.body.add(this.torso);
    this.torso.position.y = 1.15;
    const skin = toon(0xeacbb9);
    const dark = toon(0x393136);
    const redHair = toon(0xaa3e36);
    const cloth = toon(0xe5d2b2, { side: THREE.DoubleSide });
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const mesh = mk(geo, mat, { outline: 0.009 });
      mesh.position.set(x, y, z); parent.add(mesh); return mesh;
    };
    for (const side of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(side * 0.15, 1.05, 0);
      add(leg, new THREE.CapsuleGeometry(0.1, 0.7, 4, 10), this.armor, 0, -0.47, 0);
      const foot = add(leg, new THREE.BoxGeometry(0.18, 0.13, 0.35), dark, 0, -0.94, 0.08);
      foot.rotation.x = -0.08; this.body.add(leg); this.legs.push(leg);
      const skirt = add(this.torso, new THREE.ConeGeometry(0.29, 0.8, 5, 1, true), cloth, side * 0.16, -0.32, -0.02);
      skirt.rotation.z = side * -0.16;
    }
    add(this.torso, new THREE.CylinderGeometry(0.24, 0.19, 0.58, 16), this.armor, 0, 0.23, 0);
    add(this.torso, new THREE.TorusGeometry(0.22, 0.035, 6, 24), dark, 0, -0.03, 0).rotation.x = Math.PI / 2;
    this.head.position.y = 0.83; this.torso.add(this.head);
    add(this.head, new THREE.SphereGeometry(0.275, 24, 18), skin, 0, 0, 0);
    this.head.add(facePatch(0.28, faceTexture('normal', { iris: ['#b99c52', '#62412a'], blush: false, serious: true })));
    add(this.head, new THREE.SphereGeometry(0.3, 24, 16, 0, Math.PI * 2, 0, 1.35), redHair, 0, 0.02, -0.03);
    add(this.head, new THREE.SphereGeometry(0.306, 20, 14, 0, Math.PI * 2, 0, 0.95), this.armor, 0, 0.07, 0.015);
    const visor = add(this.head, new THREE.BoxGeometry(0.5, 0.075, 0.055), this.armor, 0, 0.065, 0.265);
    visor.rotation.z = -0.06;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const feather = add(this.head, new THREE.ConeGeometry(0.065, 0.47 - i * 0.06, 4), this.armor, side * (0.29 + i * 0.045), 0.2 + i * 0.025, -0.06);
        feather.rotation.z = side * -0.8; feather.rotation.x = -0.35;
      }
      for (let i = 0; i < 3; i++) {
        const strand = new THREE.Group(); strand.position.set(side * (0.1 + i * 0.055), 0.04, -0.22);
        const lock = add(strand, new THREE.CapsuleGeometry(0.065, 0.8 + i * 0.08, 3, 8), redHair, 0, -0.46, -0.07);
        lock.rotation.x = 0.2; this.head.add(strand); this.hair.push(strand);
      }
    }
    this.cape.position.set(0, 0.44, -0.16); this.torso.add(this.cape);
    const cape = add(this.cape, new THREE.CylinderGeometry(0.27, 0.59, 1.5, 18, 1, true, Math.PI / 2, Math.PI), this.scarlet, 0, -0.67, -0.08);
    cape.rotation.x = -0.16;
    this.swordArm.position.set(-0.31, 0.42, 0); this.torso.add(this.swordArm);
    add(this.swordArm, new THREE.SphereGeometry(0.16, 12, 10), this.armor, 0, 0, 0);
    add(this.swordArm, new THREE.CapsuleGeometry(0.075, 0.57, 4, 10), this.armor, 0, -0.37, 0);
    this.sword.position.set(0, -0.72, 0); this.sword.rotation.x = -Math.PI / 2; this.swordArm.add(this.sword);
    add(this.sword, new THREE.CylinderGeometry(0.033, 0.033, 0.3, 8), dark, 0, 0, 0);
    add(this.sword, new THREE.BoxGeometry(0.34, 0.045, 0.09), this.armor, 0, 0.17, 0);
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(-0.055, 0.18); bladeShape.quadraticCurveTo(-0.11, 1.55, 0.2, 2.38);
    bladeShape.quadraticCurveTo(0.06, 1.45, 0.055, 0.18); bladeShape.closePath();
    const blade = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.025, bevelEnabled: false, curveSegments: 20 });
    add(this.sword, blade, toon(0xf3e2a7, { emissive: 0x322307 }), 0, 0, 0);
    const leftArm = add(this.torso, new THREE.CapsuleGeometry(0.075, 0.57, 4, 10), skin, 0.33, 0.05, 0);
    leftArm.rotation.z = 0.15;
    this.wings.position.set(0, 0.4, -0.23); this.torso.add(this.wings);
    const petalMat = toon(0xcf526b, { side: THREE.DoubleSide, emissive: 0x30101b });
    for (const side of [-1, 1]) {
      for (let i = 0; i < 10; i++) {
        const petal = add(this.wings, new THREE.SphereGeometry(1, 10, 8), petalMat, side * (0.55 + (i % 3) * 0.42), 0.3 + Math.floor(i / 3) * 0.28, -0.3 - (i % 2) * 0.1);
        petal.scale.set(0.18, 0.65 + (i % 3) * 0.22, 0.055);
        petal.rotation.z = side * (-0.8 - i * 0.06); this.petals.push(petal);
      }
    }
    this.wings.visible = false;
    for (let i = 0; i < 3; i++) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(1.45 + i * 0.28, 0.025, 4, 48, Math.PI * 1.35),
        new THREE.MeshBasicMaterial({ color: i ? 0xffd5ac : 0xff7181, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }));
      arc.rotation.x = Math.PI / 2 + i * 0.14; arc.rotation.z = i * 0.5; this.slash.add(arc);
    }
    this.slash.position.y = 1.15; this.root.add(this.slash); this.slash.visible = false;
    this.warning = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 64),
      new THREE.MeshBasicMaterial({ color: 0xff4263, transparent: true, opacity: 0.65, depthWrite: false, side: THREE.DoubleSide }));
    this.warning.rotation.x = -Math.PI / 2; this.warning.position.y = 0.065; this.warning.visible = false;
    scene.add(this.root, this.warning); this.reset();
  }

  reset() {
    this.hp = this.maxHp; this.dead = false; this.engaged = false; this.phase = 1;
    this.state = 'waiting'; this.timer = this.clock = this.attackIndex = this.eventIndex = this.deathT = this.flash = 0;
    this.cooldown = 1.2; this.heading = 0; this.root.position.set(12, 0, 0);
    this.root.rotation.set(0, 0, 0); this.body.position.set(0, 0, 0); this.body.rotation.set(0, 0, 0);
    this.root.scale.setScalar(1.12); this.wings.visible = this.warning.visible = this.slash.visible = false;
    this.dashReady = false;
  }

  hit(damage: number, _direction: THREE.Vector3, _knock: number) {
    if (this.dead || this.state === 'transform') return false;
    this.engaged = true;
    if (this.state === 'waiting') this.state = 'chase';
    this.hp = Math.max(0, this.hp - damage); this.flash = 1;
    if (this.hp <= 0) {
      this.dead = true; this.state = 'dead'; this.timer = 0;
      this.warning.visible = this.slash.visible = false;
      this.events.effect(this.pos.clone(), 0xffbf88, 5);
      return true;
    }
    return false;
  }

  private face(target: THREE.Vector3, rate: number, dt: number) {
    const desired = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
    const delta = Math.atan2(Math.sin(desired - this.heading), Math.cos(desired - this.heading));
    this.heading += clamp(delta, -rate * dt, rate * dt);
  }

  private begin(move: BossMove, target: THREE.Vector3) {
    this.move = move; this.state = 'attack'; this.timer = 0; this.eventIndex = 0; this.dashReady = false;
    this.bloomPoint.copy(target); this.face(target, 100, 1);
    this.events.announce(this.moveName);
  }

  private dash(target: THREE.Vector3, progress: number, reach: number) {
    if (!this.dashReady) {
      this.dashFrom.copy(this.pos);
      const delta = new V().subVectors(target, this.pos).setY(0);
      const distance = delta.length(); delta.normalize();
      this.dashTo.copy(this.pos).addScaledVector(delta, Math.min(reach, Math.max(0, distance - 1.35)));
      this.dashReady = true;
    }
    this.pos.lerpVectors(this.dashFrom, this.dashTo, ease(progress));
  }

  private strike(radius: number, damage: number, arc = Math.PI * 1.35, point = this.pos) {
    const connected = this.events.strike({ center: point.clone(), radius, damage: Math.round(damage * (this.phase === 2 ? 1.15 : 1)), facing: this.heading, arc });
    // Life steal is awarded only by an actual player hit, never by an avoided strike.
    if (connected) this.hp = Math.min(this.maxHp, this.hp + 8);
    this.events.effect(point.clone(), this.phase === 2 ? 0xff6688 : 0xffd6a0, radius);
  }

  update(dt: number, target: THREE.Vector3, playerAlive: boolean) {
    this.clock += dt; this.flash = Math.max(0, this.flash - dt * 5);
    this.armor.emissive.setRGB(this.flash * 0.5, this.flash * 0.18, this.flash * 0.1);
    this.warning.visible = this.slash.visible = false;
    if (this.dead) {
      this.deathT += dt;
      this.body.rotation.x = -Math.min(1.45, this.deathT * 0.9);
      this.body.position.y = -Math.min(0.5, this.deathT * 0.25);
      return;
    }
    const distance = this.pos.distanceTo(target);
    if (!playerAlive) { this.state = 'waiting'; this.engaged = false; this.pose(0); return; }
    if (!this.engaged && distance < 10) { this.engaged = true; this.state = 'chase'; this.events.announce('Aelyra · düello başladı'); }
    if (!this.engaged) { this.pose(0); return; }
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) {
      this.phase = 2; this.state = 'transform'; this.timer = 0; this.wings.visible = true;
      this.events.announce('Kızıl Uyanış · ikinci faz');
    }
    this.timer += dt;
    let moving = 0;
    if (this.state === 'transform') {
      this.body.position.y = Math.sin(clamp(this.timer / 2.4, 0, 1) * Math.PI) * 0.8;
      if (this.timer >= 2.4) { this.body.position.y = 0; this.begin('bloom', target); }
    } else if (this.state === 'chase') {
      this.cooldown = Math.max(0, this.cooldown - dt); this.face(target, 4, dt);
      if (distance > 2.9) {
        moving = this.phase === 2 ? 4.4 : 3.5;
        const direction = new V().subVectors(target, this.pos).setY(0).normalize();
        this.pos.addScaledVector(direction, Math.min(moving * dt, Math.max(0, distance - 2.9)));
      }
      if (this.cooldown <= 0 && distance < 8) {
        const pattern: BossMove[] = this.phase === 1 ? ['combo', 'thrust', 'combo', 'flurry'] : ['combo', 'flurry', 'thrust', 'bloom', 'flurry'];
        this.begin(pattern[this.attackIndex++ % pattern.length], target);
      }
    } else if (this.state === 'recover') {
      this.body.position.y = 0;
      const duration = this.move === 'flurry' || this.move === 'bloom' ? 1.8 : 1.05;
      if (this.timer >= duration) { this.state = 'chase'; this.cooldown = this.phase === 2 ? 0.45 : 0.8; }
    } else if (this.state === 'attack') {
      const t = this.timer;
      if (this.move === 'combo') {
        const timings = [0.68, 1.24, 1.94];
        const next = timings[this.eventIndex];
        if (next !== undefined && t < next - 0.15) this.face(target, 2.8, dt);
        if (this.eventIndex < 3 && distance > 2 && t < 1.9) {
          this.pos.addScaledVector(new V(Math.sin(this.heading), 0, Math.cos(this.heading)), dt * 1.6); moving = 1.6;
        }
        if (next !== undefined && t >= next) { this.strike(3.05, this.eventIndex === 2 ? 27 : 18); this.eventIndex++; }
        this.slash.visible = timings.some(v => t >= v && t < v + 0.19);
        if (t >= 2.32) this.recover();
      } else if (this.move === 'thrust') {
        if (t < 0.72) this.face(target, 3, dt);
        if (t >= 0.8 && t <= 1.18) this.dash(target, (t - 0.8) / 0.32, 7);
        if (t >= 1.08 && this.eventIndex === 0) { this.strike(3.7, 30, Math.PI * 0.32); this.eventIndex++; }
        this.slash.visible = t > 0.98 && t < 1.28;
        if (t >= 1.5) this.recover();
      } else if (this.move === 'flurry') {
        this.body.position.y = t < 1.1 ? Math.sin(clamp(t / 1.1, 0, 1) * Math.PI * 0.5) * 1.6 : Math.max(0, 1.6 - (t - 1.1) * 3.5);
        const starts = [1.15, 1.98, 2.81];
        for (let i = 0; i < 3; i++) {
          const start = starts[i];
          if (this.eventIndex === i && t >= start && t < start + 0.38) {
            if (!this.dashReady) this.face(target, 100, 1);
            this.dash(target, (t - start) / 0.3, 5.5);
            this.slash.visible = true;
          }
          if (this.eventIndex === i && t >= start + 0.28) {
            this.strike(2.7, 22, Math.PI * 2); this.eventIndex++; this.dashReady = false;
          }
        }
        if (t >= 3.48) this.recover();
      } else {
        // The bloom commits to a point after a readable 1.1 second warning.
        if (t < 1.1) this.bloomPoint.copy(target);
        this.warning.visible = t < 2.05;
        this.warning.position.set(this.bloomPoint.x, 0.07, this.bloomPoint.z);
        this.warning.scale.setScalar(4.6);
        this.warning.material.opacity = 0.35 + Math.sin(t * 13) * 0.15;
        this.body.position.y = t < 1.2 ? ease(t / 1.2) * 3.2 : Math.max(0, 3.2 * (1 - ease((t - 1.2) / 0.65)));
        if (t > 1.2 && t < 1.9) this.dash(this.bloomPoint, (t - 1.2) / 0.65, 12);
        if (t >= 1.9 && this.eventIndex === 0) { this.strike(4.6, 42, Math.PI * 2, this.bloomPoint); this.eventIndex++; }
        if (t >= 2.75) this.recover();
      }
    }
    this.events.collide(this.pos, this.radius);
    this.root.rotation.y = this.heading;
    this.pose(moving);
  }

  private recover() { this.state = 'recover'; this.timer = 0; this.body.position.y = 0; this.slash.visible = false; }

  private pose(speed: number) {
    const t = this.timer;
    const attack = this.state === 'attack';
    this.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(this.clock * 9 + i * Math.PI) * Math.min(0.55, speed * 0.14); });
    this.torso.rotation.x = this.state === 'recover' ? 0.17 : speed * 0.025;
    this.torso.rotation.y = 0;
    this.swordArm.rotation.set(-0.2, 0, -0.15);
    if (attack) {
      if (this.move === 'combo') {
        const timing = this.eventIndex === 0 ? 0.68 : this.eventIndex === 1 ? 1.24 : 1.94;
        const swing = ease((t - timing + 0.22) / 0.36);
        const side = this.eventIndex % 2 ? -1 : 1;
        this.torso.rotation.y = side * (-0.7 + swing * 1.5);
        this.swordArm.rotation.set(-1.4, side * (-1.1 + swing * 2.6), -0.7);
      } else if (this.move === 'thrust') {
        this.swordArm.rotation.set(-1.6, 0.15, -0.05);
        this.torso.rotation.x = t < 0.8 ? -0.15 : 0.4;
      } else if (this.move === 'flurry') {
        this.swordArm.rotation.set(-2.5, t * 15, -0.7);
        this.torso.rotation.y = t < 1.1 ? 0 : t * 14;
      } else { this.swordArm.rotation.set(-2.8, 0.4, -0.5); }
    }
    this.cape.rotation.x = -0.12 + speed * 0.09 + Math.sin(this.clock * 3) * 0.06;
    this.hair.forEach((strand, i) => { strand.rotation.x = speed * 0.08 + Math.sin(this.clock * 3 + i) * 0.08; });
    this.wings.rotation.y = Math.sin(this.clock * 2) * 0.07;
    this.wings.scale.setScalar(0.95 + Math.sin(this.clock * 3) * 0.06);
    this.slash.rotation.y = this.clock * 24;
  }
}
