import * as THREE from 'three';
import { SpearGirl, HammerGirl } from './characters';
import { Dummy } from './dummy';
import { ShadingController } from './shading';
import { BladeBoss, type BossStrike } from './boss';
type CombatTarget = Dummy | BladeBoss;
import { buildWorld, ARENA_X, ARENA_Z, type Circle } from './world';

// Aelyra yapay zekası (geçici olarak kapalı: sahneyi serbestçe incelemek için)
const BOSS_AI_ENABLED = false;
import { k, sample, type Key } from './toon';

const V = THREE.Vector3;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const smooth = (u: number) => u * u * (3 - 2 * u);

const LIGHT_ROLL_DURATION = 0.56;
const LIGHT_ROLL_DISTANCE = 4.4;
const LIGHT_ROLL_CONTACT = 0.36;
// Progress, forward rotation in turns, body tuck, pivot height offset, and hand reach.
const LIGHT_ROLL_POSE = [
  k(0, [0, 0, 0, 0]),
  k(0.15, [0.09, 0.65, -0.24, 0.68], 'in'),
  k(0.24, [0.21, 0.80, -0.29, 1], 'lin'),
  k(LIGHT_ROLL_CONTACT, [0.37, 1, -0.29, 0], 'lin'),
  k(0.62, [0.76, 0.95, -0.30, 0], 'lin'),
  k(0.82, [0.96, 0.42, -0.23, 0], 'out'),
  k(1, [1, 0, 0, 0], 'out'),
];

function lightRollTravel(progress: number) {
  return LIGHT_ROLL_DISTANCE * progress ** 1.25 * (2.25 - 1.25 * progress);
}

function turnToward(cur: number, target: number, amt: number) {
  let d = ((target - cur + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return cur + clamp(d, -amt, amt);
}

export interface Stats {
  hits: number;
  total: number;
  combo: number;
  best: number;
  last: string;
}
export interface CombatHUD {
  hp: number; maxHp: number; stamina: number; maxStamina: number;
  bossHp: number; bossMaxHp: number; bossName: string; phase: number;
  engaged: boolean; move: string; selected: string;
  result: 'playing' | 'defeat' | 'victory'; notice: string; locked: boolean; shaders: boolean;
}

// ---------------- saldırı tanımları ----------------
// pose: [Px,Py,Pz, Dx,Dy,Dz, yaw, pitch, move, lift]
const C = [-0.3, 0.98, 0.22, 0, 0.8, 0.6, 0, 0];
const c = (move = 0, lift = 0) => [...C, move, lift];

interface AtkDef {
  name: string;
  dur: number;
  keys: Key[];
  hit: [number, number];
  dmg: number;
  knock: number;
  queueFrom: number;
  land?: number;
  shake: number;
}

const ATTACKS: AtkDef[] = [
  {
    name: 'Mızrak Saplama',
    dur: 0.62,
    keys: [
      k(0, c()),
      k(0.2, [-0.15, 1.2, -0.25, 0.12, 0.18, 1, -0.5, -0.05, 0, 0]),
      k(0.31, [-0.1, 1.25, 0.5, 0.05, 0.14, 1, 0.45, 0.18, 0.9, 0], 'out'),
      k(0.4, [-0.1, 1.25, 0.5, 0.05, 0.14, 1, 0.45, 0.18, 0.9, 0], 'lin'),
      k(0.62, c(0.9)),
    ],
    hit: [0.22, 0.38],
    dmg: 18,
    knock: 3.6,
    queueFrom: 0.3,
    shake: 0.12,
  },
  {
    name: 'Çifte Saplama',
    dur: 0.6,
    keys: [
      k(0, c()),
      k(0.17, [0, 0.85, -0.2, -0.2, -0.05, 1, -0.6, 0.1, 0, 0]),
      k(0.29, [-0.05, 1.05, 0.55, 0.1, 0.2, 1, 0.55, 0.1, 1.0, 0], 'out'),
      k(0.38, [-0.05, 1.05, 0.55, 0.1, 0.2, 1, 0.55, 0.1, 1.0, 0], 'lin'),
      k(0.6, c(1.0)),
    ],
    hit: [0.2, 0.37],
    dmg: 22,
    knock: 4.2,
    queueFrom: 0.28,
    shake: 0.14,
  },
  {
    name: 'Süpürme Dönüşü',
    dur: 0.85,
    keys: [
      k(0, c()),
      k(0.3, [-0.1, 1.1, 0.15, -1, 0.1, 0.25, -1.1, 0.05, 0, 0]),
      k(0.5, [-0.05, 1.1, 0.35, 1, 0.1, 0.35, 1.2, 0.05, 0.5, 0], 'out'),
      k(0.58, [-0.05, 1.1, 0.35, 1, 0.1, 0.35, 1.2, 0.05, 0.5, 0], 'lin'),
      k(0.85, c(0.5)),
    ],
    hit: [0.32, 0.52],
    dmg: 30,
    knock: 6.5,
    queueFrom: 0.5,
    shake: 0.25,
  },
];

const HEAVY: AtkDef = {
  name: 'Gökyüzü Atılışı',
  dur: 1.05,
  keys: [
    k(0, c()),
    k(0.35, [-0.1, 1.55, -0.2, 0, 0.55, 0.85, -0.4, -0.25, 0, -0.12]),
    k(0.5, [-0.1, 1.35, 0.4, 0, -0.15, 1, 0.1, 0.2, 1.8, 0.9]),
    k(0.62, [-0.05, 1.05, 0.8, 0, -0.5, 1, 0.3, 0.55, 3, 0], 'in'),
    k(0.74, [-0.05, 1.05, 0.8, 0, -0.5, 1, 0.3, 0.55, 3, 0], 'lin'),
    k(1.05, c(3, 0)),
  ],
  hit: [0.5, 0.7],
  dmg: 36,
  knock: 8,
  queueFrom: 0.8,
  land: 0.62,
  shake: 0.5,
};

const HGC = [-0.28, 1.05, 0.25, 0, 0.85, 0];
const HG_KEYS: Key[] = [
  k(0, HGC),
  k(0.55, [-0.05, 1.75, -0.1, -1.15, 0, -0.3]),
  k(0.7, [0, 1.3, 0.35, 2.1, 0, 0.35], 'in'),
  k(1.2, [0, 1.3, 0.35, 2.1, 0, 0.35], 'lin'),
  k(2.0, HGC),
];
const HG_IDLE = [-0.28, 0.75, 0.25, 0, 0.85, 0];

// ---------------- efekt yardımcıları ----------------
class Trail {
  mesh: THREE.Mesh;
  geo = new THREE.BufferGeometry();
  N = 30;
  pos: Float32Array;
  col: Float32Array;
  pts: { a: THREE.Vector3; b: THREE.Vector3; age: number }[] = [];
  life = 0.28;
  base: THREE.Color;
  constructor(scene: THREE.Scene, color: number) {
    this.pos = new Float32Array(this.N * 6);
    this.col = new Float32Array(this.N * 6);
    this.base = new THREE.Color(color);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < this.N - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(
      this.geo,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }
  push(a: THREE.Vector3, b: THREE.Vector3) {
    this.pts.push({ a: a.clone(), b: b.clone(), age: 0 });
    if (this.pts.length > this.N) this.pts.shift();
  }
  update(dt: number) {
    for (const p of this.pts) p.age += dt;
    while (this.pts.length && this.pts[0].age > this.life) this.pts.shift();
    const n = this.pts.length;
    for (let i = 0; i < n; i++) {
      const p = this.pts[i];
      const al = Math.pow(1 - p.age / this.life, 1.5);
      this.pos.set([p.a.x, p.a.y, p.a.z, p.b.x, p.b.y, p.b.z], i * 6);
      this.col.set([this.base.r * al, this.base.g * al, this.base.b * al, this.base.r * al * 0.2, this.base.g * al * 0.2, this.base.b * al * 0.2], i * 6);
    }
    this.geo.setDrawRange(0, n > 1 ? (n - 1) * 6 : 0);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

interface Ring {
  mesh: THREE.Mesh;
  t: number;
  dur: number;
  maxR: number;
}

interface FloatText {
  el: HTMLDivElement;
  p: THREE.Vector3;
  t: number;
  dx: number;
}

export type Action = 'attack' | 'heavy' | 'roll' | 'hammer' | 'switch' | 'duel' | 'lock' | 'shaders' | 'reset';

export class Game {
  renderer: THREE.WebGLRenderer;
  shading: ShadingController;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(48, 1, 0.1, 300);
  world: ReturnType<typeof buildWorld>;
  player = new SpearGirl();
  hg = new HammerGirl();
  dummies: Dummy[] = [];
  boss: BladeBoss;
  hp = 200;
  readonly maxHp = 200;
  stamina = 100;
  readonly maxStamina = 100;
  staminaDelay = 0;
  exhausted = false;
  hurtCooldown = 0;
  switchCooldown = 0;
  assistCooldown = 0;
  result: 'playing' | 'defeat' | 'victory' = 'playing';
  notice = '';
  noticeT = 0;
  hudT = 0;
  locked = false;
  onHUD: (hud: CombatHUD) => void;
  get targets(): CombatTarget[] { return [...this.dummies, this.boss]; }
  overlay: HTMLDivElement;
  hpBars: { el: HTMLDivElement; fill: HTMLDivElement; d: Dummy }[] = [];
  keys = new Set<string>();
  stick = new THREE.Vector2();
  raf = 0;
  last = performance.now();
  time = 0;
  disposed = false;

  // kamera
  yaw = Math.PI;
  pitch = 0.16;
  dist = 6;
  camTarget = new V(0, 1.4, 0);
  shake = 0;
  paused = false;
  cameraSensitivity = 1;
  cameraShake = 0.5;
  // Stamina maliyeti kapalı: saldırı/takla/çekiç stamina harcamaz
  staminaCostsEnabled = false;
  introActive = true;
  introT = 0;
  touched = false;

  // oyuncu
  selected: 'spear' | 'hammer' = 'spear';
  pos = this.player.root.position;
  ry = Math.PI;
  vel = new V();
  speed = 0;
  state: 'free' | 'attack' | 'heavy' | 'roll' = 'free';
  st = 0;
  def: AtkDef = ATTACKS[0];
  comboIdx = -1;
  comboTimer = 0;
  queued: 'light' | 'heavy' | null = null;
  hitSet = new Set<CombatTarget>();
  landed = false;
  lastMove = 0;
  rollDir = new V();
  rollCd = 0;
  atkW = 0;
  peaceW = 1;
  idleT = 0;
  happyT = 0;
  hitstop = 0;
  atkPose: number[] = [];
  lift = 0;
  private rollPose: number[] = [];
  dustT = 0;

  // çekiç kız
  hgState: 'idle' | 'walk' | 'clip' | 'return' = 'idle';
  hgHome = new V(1.25, 0, 0.7);
  hgRy = Math.PI;
  hgClip = 0;
  hgImpact = false;
  hgTarget: CombatTarget | null = null;
  hgActive = 0;
  hgGrip = 0;
  hgSpeed = 0;
  hgPose: number[] = [...HG_IDLE];
  hgHappy = 0;

  // efektler
  trailS: Trail;
  trailH: Trail;
  rings: Ring[] = [];
  floats: FloatText[] = [];
  PN = 500;
  pMesh: THREE.InstancedMesh;
  pPos = new Float32Array(500 * 3);
  pVel = new Float32Array(500 * 3);
  pLife = new Float32Array(500);
  pMax = new Float32Array(500);
  pSize = new Float32Array(500);
  pI = 0;

  stats: Stats = { hits: 0, total: 0, combo: 0, best: 0, last: '' };
  comboReset = 0;
  onStats: (s: Stats) => void;

  // pointer
  drag: { x: number; y: number; moved: number; button: number } | null = null;

  constructor(private container: HTMLElement, onStats: (s: Stats) => void, onHUD: (hud: CombatHUD) => void) {
    this.onStats = onStats;
    this.onHUD = onHUD;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = 'none';
    this.renderer.domElement.style.display = 'block';

    this.overlay = document.createElement('div');
    this.overlay.className = 'fx-layer';
    container.appendChild(this.overlay);

    this.world = buildWorld(this.scene);

    // karakterler
    this.scene.add(this.player.root, this.hg.root);
    this.pos.set(-1.2, 0, 0);
    this.hg.root.position.copy(this.hgHome);
    this.hg.root.rotation.y = this.hgRy;

    // mankenler
    const dpos: [number, number][] = [
      [-16, -6.1],
      [-6, 6.1],
      [4, -6.1],
    ];
    for (const [x, z] of dpos) {
      const d = new Dummy(x, z);
      this.dummies.push(d);
      this.scene.add(d.root);
      const el = document.createElement('div');
      el.className = 'fx-hp';
      const fill = document.createElement('div');
      fill.className = 'fx-hp-fill';
      el.appendChild(fill);
      this.overlay.appendChild(el);
      this.hpBars.push({ el, fill, d });
    }

    this.trailS = new Trail(this.scene, 0xffe6a8);
    this.trailH = new Trail(this.scene, 0xffc94a);

    // parçacıklar
    const pg = new THREE.OctahedronGeometry(1, 0);
    const pm = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    this.pMesh = new THREE.InstancedMesh(pg, pm, this.PN);
    this.pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pMesh.frustumCulled = false;
    const m4 = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.PN; i++) {
      this.pMesh.setMatrixAt(i, m4);
      this.pMesh.setColorAt(i, new THREE.Color(1, 1, 1));
    }
    this.scene.add(this.pMesh);

    this.boss = new BladeBoss(this.scene, {
      strike: (hit) => this.receiveBossStrike(hit),
      effect: (point, color, radius) => {
        this.ring(point, color, radius, 0.35);
        this.burst(point.clone().setY(1), 16, color, 4, 2, 0.09, 0.5);
      },
      announce: (message) => { this.notice = message; this.noticeT = 2.5; },
      collide: (point, radius) => this.collide(point, radius, false),
    });
    // Düello kapalıyken Aelyra modeli sahnede durmaz (orta koridor boş kalsın)
    if (!BOSS_AI_ENABLED) this.boss.root.visible = false;
    this.shading = new ShadingController(this.scene, this.renderer);
    this.bind();
    this.resize();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    this.pushStats();
  }

  // ---------------- girdi ----------------
  private onKeyDown = (e: KeyboardEvent) => {
    if (this.paused || e.repeat) return;
    const key = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'shift', ' ', 'j', 'k', 'q', 'r', 'f2', 'f3', 'tab', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) e.preventDefault();
    this.keys.add(key);
    this.touch();
    if (key === ' ') this.action('roll');
    if (key === 'j') this.action('attack');
    if (key === 'k') this.action('heavy');
    if (key === 'q') this.action('hammer');
    if (key === 'tab') this.action('lock');
    if (key === 'f3') this.action('shaders');
    if (key === 'f2') this.action('switch');
    if (key === 'r') this.action('reset');
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };
  private onBlur = () => this.keys.clear();
  private onResize = () => this.resize();
  private onDown = (e: PointerEvent) => {
    if (this.paused) return;
    this.drag = { x: e.clientX, y: e.clientY, moved: 0, button: e.button };
    this.renderer.domElement.setPointerCapture(e.pointerId);
  };
  private onMove = (e: PointerEvent) => {
    if (!this.drag) return;
    const dx = e.clientX - this.drag.x,
      dy = e.clientY - this.drag.y;
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
    this.drag.moved += Math.abs(dx) + Math.abs(dy);
    if (this.drag.moved > 6) {
      this.introActive = false;
      this.yaw -= dx * 0.0055 * this.cameraSensitivity;
      this.pitch = clamp(this.pitch + dy * 0.0045 * this.cameraSensitivity, 0.03, 1.25);
    }
  };
  private onUp = (e: PointerEvent) => {
    if (this.drag && this.drag.moved <= 6) {
      this.touch();
      if (this.drag.button === 0) this.action('attack');
      else if (this.drag.button === 2) this.action('heavy');
    }
    this.drag = null;
    try {
      this.renderer.domElement.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.dist = clamp(this.dist + e.deltaY * 0.01, 3.5, 16);
  };
  private onCtx = (e: Event) => e.preventDefault();

  private bind() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('resize', this.onResize);
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', this.onCtx);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('resize', this.onResize);
    this.shading.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.overlay.remove();
  }

  touch() {
    this.touched = true;
  }

  setStick(x: number, y: number) {
    this.stick.set(x, y);
    if (x || y) this.touch();
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.keys.clear();
    this.stick.set(0, 0);
    this.drag = null;
  }

  action(a: Action) {
    if (this.paused && a !== 'shaders') return;
    this.touch();
    if (a === 'shaders') {
      const enabled = this.shading.toggle();
      this.notice = enabled ? 'Shaderlar açık' : 'Shaderlar kapalı · sade görünüm'; this.noticeT = 1.5;
      this.pushHUD(); return;
    }
    if (a === 'reset') { this.resetCombat(this.boss.engaged || this.result !== 'playing'); return; }
    if (this.result !== 'playing') return;
    if (a === 'duel') { this.resetCombat(true); return; }
    if (a === 'lock') { this.locked = !this.locked; this.introActive = false; return; }
    if (a === 'attack') this.startAttack('light');
    else if (a === 'heavy') this.startAttack('heavy');
    else if (a === 'roll') this.startRoll();
    else if (a === 'hammer') this.callHammer();
    else if (a === 'switch') this.switchCharacter();
  }

  private resetCombat(startDuel = false) {
    this.hp = this.maxHp; this.stamina = this.maxStamina;
    this.result = 'playing'; this.hurtCooldown = this.staminaDelay = this.switchCooldown = this.assistCooldown = 0;
    this.exhausted = false; this.state = 'free'; this.st = this.rollCd = this.atkW = this.speed = this.hitstop = 0;
    this.queued = null; this.comboIdx = -1; this.comboTimer = 0; this.atkPose = []; this.hitSet.clear();
    this.vel.set(0, 0, 0); this.keys.clear(); this.stick.set(0, 0);
    this.player.root.visible = this.hg.root.visible = true;
    this.player.root.position.set(-1.2, 0, startDuel ? -5 : 0);
    this.hg.root.position.set(1.25, 0, startDuel ? -4.3 : 0.7);
    this.hgHome.copy(this.hg.root.position); this.hgState = 'idle'; this.hgTarget = null;
    this.hgActive = this.hgGrip = this.hgSpeed = this.hgClip = 0; this.hgPose = [...HG_IDLE];
    this.hgRy = this.ry = Math.PI; this.pos = this.selected === 'hammer' ? this.hg.root.position : this.player.root.position;
    this.player.animate(0, { time: this.time, speed: 0, atkW: 0, atk: null, peaceW: 0, roll: 0, lift: 0 });
    this.hg.animate(0, { time: this.time, speed: 0, active: 0, pose: HG_IDLE, gripW: 0 });
    this.boss.reset(); this.trailS.pts.length = this.trailH.pts.length = 0;
    for (const d of this.dummies) {
      d.hp = d.maxHp; d.dead = false; d.deadT = d.ax = d.az = d.vx = d.vz = 0;
    }
    this.stats = { hits: 0, total: 0, combo: 0, best: 0, last: '' }; this.comboReset = 0;
    this.notice = startDuel ? 'Düello başladı · Tab ile hedefe kilitlen' : ''; this.noticeT = 3;
    this.locked = startDuel; this.introActive = false; this.yaw = 0; this.pitch = 0.3; this.dist = 9;
    this.pushStats(); this.pushHUD();
  }

  private spendStamina(amount: number) {
    if (!this.staminaCostsEnabled) return true;
    if (this.stamina + 1e-6 < amount) { this.notice = 'Stamina yetersiz'; this.noticeT = 0.8; return false; }
    this.stamina = Math.max(0, this.stamina - amount); this.staminaDelay = 0.7;
    return true;
  }

  private pushHUD() {
    this.onHUD({ hp: this.hp, maxHp: this.maxHp, stamina: this.stamina, maxStamina: this.maxStamina,
      bossHp: this.boss.hp, bossMaxHp: this.boss.maxHp, bossName: this.boss.name, phase: this.boss.phase,
      engaged: this.boss.engaged, move: this.boss.moveName, selected: this.selected === 'hammer' ? 'Çekiç Kız' : 'Mızrak Kız',
      result: this.result, notice: this.noticeT > 0 ? this.notice : '', locked: this.locked, shaders: this.shading.enabled });
  }

  private updateVitals(dt: number) {
    this.hurtCooldown = Math.max(0, this.hurtCooldown - dt);
    this.switchCooldown = Math.max(0, this.switchCooldown - dt);
    this.assistCooldown = Math.max(0, this.assistCooldown - dt);
    this.staminaDelay = Math.max(0, this.staminaDelay - dt); this.noticeT = Math.max(0, this.noticeT - dt);
    if (this.result === 'playing' && this.state === 'free' && this.staminaDelay <= 0)
      this.stamina = Math.min(this.maxStamina, this.stamina + 27 * dt);
    if (this.stamina >= 22) this.exhausted = false;
    const activeRoot = this.selected === 'hammer' ? this.hg.root : this.player.root;
    activeRoot.visible = this.hurtCooldown <= 0 || Math.floor(this.time * 20) % 2 === 0 || this.hp <= 0;
    this.hudT -= dt;
    if (this.hudT <= 0) { this.hudT = 0.05; this.pushHUD(); }
  }

  private receiveBossStrike(hit: BossStrike) {
    if (this.result !== 'playing' || this.hurtCooldown > 0) return false;
    if (this.state === 'roll' && this.st >= 0.05 && this.st <= 0.37) return false;
    const offset = this.pos.clone().sub(hit.center).setY(0);
    if (offset.length() > hit.radius + 0.32) return false;
    const angle = Math.atan2(offset.x, offset.z);
    const delta = Math.atan2(Math.sin(angle - hit.facing), Math.cos(angle - hit.facing));
    if (Math.abs(delta) > hit.arc / 2) return false;
    this.hp = Math.max(0, this.hp - hit.damage); this.hurtCooldown = 0.5;
    this.shake = Math.max(this.shake, 0.35); this.hitstop = Math.max(this.hitstop, 0.045);
    this.floatText(this.pos.clone().setY(2), `−${hit.damage}`, 'hurt');
    this.burst(this.pos.clone().setY(1), 14, 0xff6673, 4, 3, 0.1, 0.5);
    this.queued = null; this.state = 'free'; this.st = this.atkW = 0; this.atkPose = [];
    this.vel.set(0, 0, 0);
    if (this.hp <= 0) {
      this.result = 'defeat'; this.locked = false; this.hgState = 'idle'; this.hgTarget = null;
      this.player.root.visible = this.hg.root.visible = true;
    }
    this.pushHUD(); return true;
  }

  private switchCharacter() {
    if (this.state !== 'free' || this.switchCooldown > 0 || this.hurtCooldown > 0) return;
    this.switchCooldown = 1;
    this.player.root.visible = this.hg.root.visible = true;
    this.state = 'free';
    this.st = 0;
    this.queued = null;
    this.comboIdx = -1;
    this.comboTimer = 0;
    this.atkW = 0;
    this.atkPose = [];
    this.vel.set(0, 0, 0);
    this.speed = 0;
    this.hitSet.clear();
    this.trailS.pts.length = this.trailH.pts.length = 0;
    this.hgState = 'idle';
    this.hgTarget = null;
    this.hgGrip = this.hgActive = 0;
    this.selected = this.selected === 'spear' ? 'hammer' : 'spear';
    this.pos = this.selected === 'hammer' ? this.hg.root.position : this.player.root.position;
    this.ry = this.selected === 'hammer' ? this.hgRy : this.player.root.rotation.y;
    this.hgHome.copy(this.hg.root.position);
    this.player.animate(0, { time: this.time, speed: 0, atkW: 0, atk: null, peaceW: 0, roll: 0, lift: 0 });
    this.hg.animate(0, { time: this.time, speed: 0, active: 0, pose: HG_IDLE, gripW: 0 });
    this.introActive = false;
    this.floatText(this.pos.clone().setY(2.8), this.selected === 'hammer' ? 'Çekiç Kız' : 'Mızrak Kız', 'ko');
  }

  private resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 62 : 48;
    this.camera.updateProjectionMatrix();
  }

  private pushStats() {
    this.onStats({ ...this.stats });
  }

  private readInput() {
    let x = 0,
      y = 0;
    const k = this.keys;
    if (k.has('w') || k.has('arrowup')) y += 1;
    if (k.has('s') || k.has('arrowdown')) y -= 1;
    if (k.has('d')) x += 1;
    if (k.has('a')) x -= 1;
    x += this.stick.x;
    y += this.stick.y;
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    return { x, y, m: Math.min(1, m) };
  }

  private camMove(ix: number, iy: number) {
    const fx = -Math.sin(this.yaw),
      fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw),
      rz = -Math.sin(this.yaw);
    return new V(rx * ix + fx * iy, 0, rz * ix + fz * iy);
  }

  // ---------------- oyuncu aksiyonları ----------------
  private nearestDummy(from: THREE.Vector3, maxD: number) {
    let best: CombatTarget | null = null,
      bd = maxD;
    for (const d of this.targets) {
      if (d.dead) continue;
      const dd = Math.hypot(d.pos.x - from.x, d.pos.z - from.z);
      if (dd < bd) {
        bd = dd;
        best = d;
      }
    }
    return best;
  }

  private faceForAttack() {
    const inp = this.readInput();
    if (inp.m > 0.1) {
      const mv = this.camMove(inp.x, inp.y);
      this.ry = Math.atan2(mv.x, mv.z);
    } else {
      const d = this.nearestDummy(this.pos, 6.5);
      if (d) this.ry = Math.atan2(d.pos.x - this.pos.x, d.pos.z - this.pos.z);
    }
  }

  private beginAtk(def: AtkDef, heavy: boolean) {
    if (this.result !== 'playing' || !this.spendStamina(heavy ? 30 : this.selected === 'hammer' ? 22 : 16)) {
      this.state = 'free'; this.queued = null; return;
    }
    this.state = heavy ? 'heavy' : 'attack';
    this.def = def;
    this.st = 0;
    this.queued = null;
    this.hitSet.clear();
    this.landed = false;
    this.lastMove = 0;
    this.vel.set(0, 0, 0);
    this.trailS.pts.length = 0;
    this.faceForAttack();
  }

  startAttack(kind: 'light' | 'heavy') {
    if (this.result !== 'playing' || this.hurtCooldown > 0.3) return;
    if (this.state === 'roll') return;
    if (this.selected === 'hammer') {
      if (this.state !== 'free') { this.queued = kind; return; }
      this.beginAtk({ ...HEAVY, name: kind === 'heavy' ? 'Altın Çekiç Darbesi' : 'Çekiç Darbesi', dur: kind === 'heavy' ? 1.6 : 1.05, keys: [k(0, c()), k(2, c())] }, kind === 'heavy');
      return;
    }
    if (this.state === 'free') {
      if (kind === 'heavy') {
        this.beginAtk(HEAVY, true);
      } else {
        this.comboIdx = this.comboTimer > 0 ? (this.comboIdx + 1) % ATTACKS.length : 0;
        this.beginAtk(ATTACKS[this.comboIdx], false);
      }
    } else if (this.st > this.def.queueFrom * 0.8) {
      this.queued = kind;
    }
  }

  private endAtk() {
    const q = this.queued;
    this.queued = null;
    if (q && this.selected === 'hammer') {
      this.state = 'free';
      this.startAttack(q);
    } else if (q === 'heavy') {
      this.beginAtk(HEAVY, true);
    } else if (q === 'light') {
      const heavyBefore = this.state === 'heavy';
      this.comboIdx = heavyBefore ? 0 : (this.comboIdx + 1) % ATTACKS.length;
      this.beginAtk(ATTACKS[this.comboIdx], false);
    } else {
      if (this.state === 'heavy') this.comboIdx = -1;
      this.state = 'free';
      this.comboTimer = 0.5;
    }
  }

  private startRoll() {
    if (this.result !== 'playing' || this.state !== 'free' || this.rollCd > 0 || !this.spendStamina(24)) return;
    const inp = this.readInput();
    if (inp.m > 0.1) {
      this.rollDir.copy(this.camMove(inp.x, inp.y)).normalize();
    } else {
      this.rollDir.set(Math.sin(this.ry), 0, Math.cos(this.ry));
    }
    this.ry = Math.atan2(this.rollDir.x, this.rollDir.z);
    this.state = 'roll';
    this.st = 0;
    this.rollCd = LIGHT_ROLL_DURATION;
    this.vel.set(0, 0, 0);
  }

  callHammer() {
    if (this.selected === 'hammer') { this.startAttack('heavy'); return; }
    if (this.hgState !== 'idle' || this.assistCooldown > 0) return;
    this.assistCooldown = 12;
    const d = this.nearestDummy(this.pos, 80) ?? this.dummies[0];
    this.hgTarget = d;
    this.hgState = 'walk';
    this.hg.setFace('normal');
  }

  // ---------------- efektler ----------------
  burst(p: THREE.Vector3, n: number, color: number, speed: number, up: number, size: number, life: number) {
    const col = new THREE.Color(color);
    for (let j = 0; j < n; j++) {
      const i = this.pI;
      this.pI = (this.pI + 1) % this.PN;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.8);
      this.pPos[i * 3] = p.x;
      this.pPos[i * 3 + 1] = p.y;
      this.pPos[i * 3 + 2] = p.z;
      this.pVel[i * 3] = Math.cos(a) * s;
      this.pVel[i * 3 + 1] = up * (0.4 + Math.random());
      this.pVel[i * 3 + 2] = Math.sin(a) * s;
      this.pLife[i] = this.pMax[i] = life * (0.6 + Math.random() * 0.6);
      this.pSize[i] = size * (0.6 + Math.random() * 0.8);
      this.pMesh.setColorAt(i, col);
    }
    if (this.pMesh.instanceColor) this.pMesh.instanceColor.needsUpdate = true;
  }

  ring(p: THREE.Vector3, color: number, maxR: number, dur: number) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1, 56),
      new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, 0.06, p.z);
    m.scale.setScalar(0.1);
    this.scene.add(m);
    this.rings.push({ mesh: m, t: 0, dur, maxR });
  }

  floatText(p: THREE.Vector3, text: string, cls = '') {
    const el = document.createElement('div');
    el.className = 'fx-dmg ' + cls;
    el.textContent = text;
    this.overlay.appendChild(el);
    this.floats.push({ el, p: p.clone(), t: 0, dx: (Math.random() - 0.5) * 50 });
  }

  private project(p: THREE.Vector3) {
    const v = p.clone().project(this.camera);
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, vis: v.z < 1 && v.z > -1 };
  }

  private registerHit(d: CombatTarget, point: THREE.Vector3, dmg: number, from: THREE.Vector3, knock: number, big: boolean, name: string) {
    if (d.dead || (d === this.boss && this.boss.state === 'transform')) return;
    const dir = new V(d.pos.x - from.x, 0, d.pos.z - from.z);
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
    dir.normalize();
    const killed = d.hit(dmg, dir, knock);
    this.floatText(point.clone().add(new V(0, 0.3, 0)), String(dmg), big ? 'big' : '');
    this.burst(point, big ? 22 : 12, 0xffe08a, big ? 7 : 5, 4, big ? 0.14 : 0.1, 0.55);
    this.burst(point, 6, 0xffffff, 3, 2.5, 0.08, 0.35);
    this.hitstop = Math.max(this.hitstop, big ? 0.11 : 0.06);
    this.shake = Math.max(this.shake, big ? 0.35 : 0.14);
    if (killed) {
      this.floatText(d.pos.clone().add(new V(0, 3, 0)), d === this.boss ? 'ZAFER!' : 'K.O.!', 'ko');
      if (d === this.boss) { this.result = 'victory'; this.locked = false; this.hgState = 'idle'; this.hgTarget = null; this.pushHUD(); }
      this.burst(d.pos.clone().setY(1.8), 36, 0xffd35a, 9, 7, 0.16, 0.9);
    }
    this.stats.hits++;
    this.stats.total += dmg;
    this.stats.combo++;
    this.stats.best = Math.max(this.stats.best, this.stats.combo);
    this.stats.last = name;
    this.comboReset = 2.6;
    this.pushStats();
  }

  private aoe(center: THREE.Vector3, radius: number, dmg: number, knock: number, name: string) {
    for (const d of this.targets) {
      if (d.dead) continue;
      const dd = Math.hypot(d.pos.x - center.x, d.pos.z - center.z);
      if (dd < radius + d.radius && !d.dead) {
        this.registerHit(d, d.pos.clone().setY(1.4), Math.round(dmg * (0.9 + Math.random() * 0.2)), center, knock, true, name);
      }
    }
  }

  private shockwave(center: THREE.Vector3, big: number) {
    this.ring(center, 0xffd070, 3 + big * 1.5, 0.55);
    this.ring(center, 0xffffff, 1.8 + big, 0.4);
    this.burst(center.clone().setY(0.15), 34 + big * 10, 0xcdb394, 6 + big * 2, 3, 0.18, 0.8);
    this.burst(center.clone().setY(0.3), 22, 0xffd35a, 7, 6, 0.12, 0.7);
  }

  // ---------------- ana döngü ----------------
  private loop() {
    if (this.paused) {
      this.last = performance.now();
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(this.loop);
      return;
    }
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const realDt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const scale = this.hitstop > 0 ? 0.08 : 1;
    this.hitstop = Math.max(0, this.hitstop - realDt);
    const dt = realDt * scale;
    this.time += dt;

    this.updateVitals(dt);
    if (this.result === 'playing') { this.updatePlayer(dt); this.updateHammerGirl(dt); }
    if (BOSS_AI_ENABLED) this.boss.update(dt, this.pos, this.result === 'playing');
    this.updateFx(dt, realDt);
    this.updateCamera(realDt);

    for (const d of this.dummies) d.update(dt);
    this.world.update(realDt, this.time, this.pos);
    this.updateOverlay(realDt);

    if (this.comboReset > 0) {
      this.comboReset -= realDt;
      if (this.comboReset <= 0 && this.stats.combo !== 0) {
        this.stats.combo = 0;
        this.pushStats();
      }
    }
    this.shading.update();
    this.renderer.render(this.scene, this.camera);
  }

  private collide(p: THREE.Vector3, r: number, includeBoss = true) {
    const circles: Circle[] = this.world.obstacles;
    const push = (cx: number, cz: number, cr: number) => {
      const dx = p.x - cx,
        dz = p.z - cz;
      const dd = Math.hypot(dx, dz);
      const min = cr + r;
      if (dd < min && dd > 1e-4) {
        p.x = cx + (dx / dd) * min;
        p.z = cz + (dz / dd) * min;
      }
    };
    for (const c of circles) push(c.x, c.z, c.r);
    for (const d of this.dummies) push(d.pos.x, d.pos.z, d.radius);
    if (!includeBoss) push(this.pos.x, this.pos.z, 0.38);
    if (includeBoss && !this.boss.dead) push(this.boss.pos.x, this.boss.pos.z, this.boss.radius);
    p.x = clamp(p.x, -ARENA_X, ARENA_X);
    p.z = clamp(p.z, -ARENA_Z, ARENA_Z);
  }

  private updatePlayer(dt: number) {
    const inp = this.readInput();
    this.rollCd = Math.max(0, this.rollCd - dt);
    this.happyT = Math.max(0, this.happyT - dt);
    let rollAngle = 0;
    let lift = 0;
    let rollTuck = 0;
    let rollReach = 0;
    let pose: number[] | null = null;
    let wantAtk = 0;

    if (this.state === 'free') {
      this.comboTimer = Math.max(0, this.comboTimer - dt);
      const wantsSprint = this.keys.has('shift') && inp.m > 0.05;
      const sprint = wantsSprint && !this.exhausted && this.stamina >= 15 * dt;
      if (sprint) { this.stamina = Math.max(0, this.stamina - 15 * dt); this.staminaDelay = 0.65; }
      if (wantsSprint && this.stamina < 15 * dt) this.exhausted = true;
      const mv = this.camMove(inp.x, inp.y);
      const sp = inp.m > 0.05 ? (sprint ? 9.5 : 5.4) * inp.m : 0;
      const target = mv.multiplyScalar(sp);
      this.vel.lerp(target, 1 - Math.exp(-12 * dt));
      this.pos.addScaledVector(this.vel, dt);
      if (inp.m > 0.05) this.ry = turnToward(this.ry, Math.atan2(mv.x, mv.z), 16 * dt);
      this.speed = this.vel.length();
      if (this.speed < 0.1 && inp.m < 0.05) this.idleT += dt;
      else this.idleT = 0;
      if (this.speed > 8) {
        this.dustT -= dt;
        if (this.dustT <= 0) {
          this.dustT = 0.12;
          this.burst(this.pos.clone().setY(0.08), 3, 0xd9c2a0, 1.2, 0.8, 0.1, 0.5);
        }
      }
    } else if (this.state === 'roll') {
      const previous = this.st / LIGHT_ROLL_DURATION;
      this.st = Math.min(this.st + dt, LIGHT_ROLL_DURATION);
      const progress = this.st / LIGHT_ROLL_DURATION;
      this.pos.addScaledVector(this.rollDir, lightRollTravel(progress) - lightRollTravel(previous));

      const [turns, tuck, height, reach] = sample(LIGHT_ROLL_POSE, progress, this.rollPose);
      rollAngle = turns * Math.PI * 2;
      rollTuck = tuck;
      rollReach = reach;
      lift = height;
      if (previous < LIGHT_ROLL_CONTACT && progress >= LIGHT_ROLL_CONTACT) {
        this.burst(this.pos.clone().setY(0.06), 7, 0xd9c2a0, 1.8, 0.9, 0.1, 0.4);
      }
      this.speed = 0;
      this.idleT = 0;
      if (progress >= 1) this.state = 'free';
    } else {
      this.idleT = 0;
      this.st += dt;
      const def = this.def;
      this.atkPose = sample(def.keys, this.st, this.atkPose);
      pose = this.atkPose;
      wantAtk = 1;
      const dm = pose[8] - this.lastMove;
      this.lastMove = pose[8];
      this.pos.x += Math.sin(this.ry) * dm;
      this.pos.z += Math.cos(this.ry) * dm;
      lift = pose[9];
      this.speed = 0;
      this.vel.set(0, 0, 0);
      if (this.st >= def.dur) this.endAtk();
    }

    this.collide(this.pos, 0.38);
    if (this.selected === 'hammer') {
      this.hgRy = this.ry;
      this.hg.root.rotation.y = this.ry;
      const attacking = this.state === 'attack' || this.state === 'heavy';
      const heavy = this.state === 'heavy';
      const clipTime = attacking ? this.st / this.def.dur * 2 : 0;
      this.hgPose = attacking ? sample(HG_KEYS, clipTime, this.hgPose) : [...HG_IDLE];
      this.hg.animate(dt, { time: this.time, speed: this.speed, active: attacking ? 1 : 0,
        pose: this.hgPose, gripW: attacking ? 1 : 0, roll: rollAngle, tuck: rollTuck, reach: rollReach, lift });
      this.hg.setFace(attacking ? 'hit' : 'normal');
      if (attacking && clipTime > 0.2 && clipTime < 0.85)
        this.trailH.push(this.hg.hammerHeadWorld(), this.hg.hammer.localToWorld(new V(0, 0.4, 0)));
      if (attacking && !this.landed && clipTime >= 0.7) {
        this.landed = true;
        const impact = this.pos.clone().add(new V(Math.sin(this.ry) * 1.8, 0, Math.cos(this.ry) * 1.8));
        this.shockwave(impact, heavy ? 2 : 1);
        this.aoe(impact, heavy ? 3.4 : 2.2, heavy ? 60 : 32, heavy ? 9 : 5, this.def.name);
        this.shake = Math.max(this.shake, heavy ? 0.6 : 0.25);
        this.hitstop = Math.max(this.hitstop, heavy ? 0.1 : 0.05);
      }
      this.player.animate(dt, { time: this.time, speed: 0, atkW: 0, atk: null, peaceW: 0, roll: 0, lift: 0 });
      return;
    }
    this.player.root.rotation.y = this.ry;

    // yumuşak geçiş
    const rate = wantAtk ? 16 : 9;
    this.atkW += (wantAtk - this.atkW) * Math.min(1, dt * rate);
    const peaceT = !this.touched || this.idleT > 4.5 ? 1 : 0;
    this.peaceW += (peaceT - this.peaceW) * Math.min(1, dt * 5);

    // yüz
    if (this.happyT > 0) this.player.setFace('happy');
    else if (this.state === 'attack' || this.state === 'heavy') this.player.setFace('hit');
    else this.player.setFace('normal');

    this.player.animate(dt, {
      time: this.time,
      speed: this.speed,
      atkW: this.atkW,
      atk: pose ?? (this.atkW > 0.01 ? this.atkPose : null),
      peaceW: this.peaceW,
      roll: rollAngle,
      tuck: rollTuck,
      reach: rollReach,
      lift,
    });

    // isabet kontrolü
    if (pose && (this.state === 'attack' || this.state === 'heavy')) {
      const def = this.def;
      const inWin = this.st >= def.hit[0] && this.st <= def.hit[1];
      const tip = this.player.spear.localToWorld(new V(0, 1.55, 0));
      const mid = this.player.spear.localToWorld(new V(0, 0.45, 0));
      if (this.st >= def.hit[0] - 0.05 && this.st <= def.hit[1] + 0.08) this.trailS.push(tip, mid);
      if (inWin) {
        for (const d of this.targets) {
          if (this.hitSet.has(d) || d.dead) continue;
          for (let i = 0; i <= 6; i++) {
            const lp = this.player.spear.localToWorld(new V(0, 0.2 + (1.35 * i) / 6, 0));
            const dd = Math.hypot(lp.x - d.pos.x, lp.z - d.pos.z);
            if (dd < d.radius + 0.25 && lp.y > 0.05 && lp.y < 2.6) {
              this.hitSet.add(d);
              const dmg = Math.round(def.dmg * (0.9 + Math.random() * 0.25));
              this.registerHit(d, lp, dmg, this.pos, def.knock, this.state === 'heavy' || def.dmg >= 30, def.name);
              this.happyT = 0.8;
              break;
            }
          }
        }
      }
      if (def.land && !this.landed && this.st >= def.land) {
        this.landed = true;
        const p = this.player.spear.localToWorld(new V(0, 1.55, 0));
        p.y = 0;
        this.shockwave(p, 1);
        this.shake = Math.max(this.shake, def.shake);
        this.hitstop = Math.max(this.hitstop, 0.05);
        const fresh = this.targets.filter((d) => !this.hitSet.has(d));
        for (const d of fresh) {
          const dd = Math.hypot(d.pos.x - p.x, d.pos.z - p.z);
          if (dd < 3.2 + d.radius && !d.dead) {
            this.hitSet.add(d);
            this.registerHit(d, d.pos.clone().setY(1.3), Math.round(def.dmg * 0.7), p.clone().lerp(this.pos, 0.3), def.knock * 0.8, true, 'Atılış Şoku');
            this.happyT = 0.8;
          }
        }
      }
    }
  }

  private updateHammerGirl(dt: number) {
    if (this.selected === 'hammer') return;
    const hg = this.hg;
    const p = hg.root.position;
    let targetActive = this.hgState === 'idle' ? 0 : 1;
    let spd = 0;
    this.hgHappy = Math.max(0, this.hgHappy - dt);

    if (this.hgState === 'walk' && this.hgTarget) {
      const t = this.hgTarget.pos;
      const dx = t.x - p.x,
        dz = t.z - p.z;
      const dd = Math.hypot(dx, dz);
      this.hgRy = turnToward(this.hgRy, Math.atan2(dx, dz), 9 * dt);
      if (dd > 1.78) {
        spd = 5;
        p.x += (dx / dd) * spd * dt;
        p.z += (dz / dd) * spd * dt;
        spd = 3.5;
      } else {
        this.hgState = 'clip';
        this.hgClip = 0;
        this.hgImpact = false;
      }
    } else if (this.hgState === 'clip' && this.hgTarget) {
      const t = this.hgTarget.pos;
      this.hgRy = turnToward(this.hgRy, Math.atan2(t.x - p.x, t.z - p.z), 6 * dt);
      this.hgClip += dt;
      this.hgGrip += (1 - this.hgGrip) * Math.min(1, dt * 12);
      if (this.hgClip > 0.3 && this.hgClip < 0.7) hg.setFace('hit');
      if (this.hgClip > 0.2 && this.hgClip < 0.85) {
        const a = hg.hammerHeadWorld();
        const b = hg.hammer.localToWorld(new V(0, 0.4, 0));
        this.trailH.push(a, b);
      }
      if (!this.hgImpact && this.hgClip >= 0.7) {
        this.hgImpact = true;
        const c = hg.hammerHeadWorld();
        c.y = 0;
        this.shockwave(c, 2);
        this.shake = Math.max(this.shake, 0.6);
        this.hitstop = Math.max(this.hitstop, 0.1);
        this.aoe(c, 3.4, 60, 9, 'Altın Çekiç Darbesi');
        this.floatText(hg.root.position.clone().add(new V(0, 2.8, 0)), 'ÇEKİÇ!', 'ko');
        this.hgHappy = 1.2;
      }
      if (this.hgClip > 0.85 && this.hgHappy > 0) hg.setFace('happy');
      if (this.hgClip >= 2.0) {
        this.hgState = 'return';
        hg.setFace('normal');
      }
    } else if (this.hgState === 'return') {
      this.hgGrip += (0 - this.hgGrip) * Math.min(1, dt * 6);
      const dx = this.hgHome.x - p.x,
        dz = this.hgHome.z - p.z;
      const dd = Math.hypot(dx, dz);
      if (dd > 0.12) {
        this.hgRy = turnToward(this.hgRy, Math.atan2(dx, dz), 9 * dt);
        p.x += (dx / dd) * 4.5 * dt;
        p.z += (dz / dd) * 4.5 * dt;
        spd = 3.3;
      } else {
        this.hgRy = turnToward(this.hgRy, Math.PI, 5 * dt);
        if (Math.abs(Math.atan2(Math.sin(this.hgRy - Math.PI), Math.cos(this.hgRy - Math.PI))) < 0.05) {
          this.hgState = 'idle';
          this.hgTarget = null;
        }
      }
    } else {
      this.hgGrip += (0 - this.hgGrip) * Math.min(1, dt * 6);
    }

    this.hgActive += (targetActive - this.hgActive) * Math.min(1, dt * 4);
    this.hgSpeed += (spd - this.hgSpeed) * Math.min(1, dt * 8);

    if (this.hgState === 'clip') {
      this.hgPose = sample(HG_KEYS, this.hgClip, this.hgPose);
    } else {
      const a = clamp(this.hgActive, 0, 1);
      for (let i = 0; i < 6; i++) this.hgPose[i] = HG_IDLE[i] + (HGC[i] - HG_IDLE[i]) * a;
    }
    // çekiç kız çevreyi iter
    this.collide(p, 0.6);
    hg.root.rotation.y = this.hgRy;
    if (this.hgState === 'idle') {
      // şirin bekleme: ara sıra göz kırp (mutlu yüz)
      hg.setFace(Math.sin(this.time * 0.7) > 0.985 ? 'happy' : 'normal');
    }
    hg.animate(dt, { time: this.time, speed: this.hgSpeed, active: clamp(this.hgActive, 0, 1), pose: this.hgPose, gripW: this.hgGrip });
  }

  private updateFx(dt: number, realDt: number) {
    this.trailS.update(realDt);
    this.trailH.update(realDt);

    // parçacıklar
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pv = new V(),
      sv = new V();
    for (let i = 0; i < this.PN; i++) {
      if (this.pLife[i] > 0) {
        this.pLife[i] -= dt;
        this.pVel[i * 3 + 1] -= 14 * dt;
        this.pPos[i * 3] += this.pVel[i * 3] * dt;
        this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt;
        this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
        if (this.pPos[i * 3 + 1] < 0.04) {
          this.pPos[i * 3 + 1] = 0.04;
          this.pVel[i * 3 + 1] *= -0.25;
          this.pVel[i * 3] *= 0.6;
          this.pVel[i * 3 + 2] *= 0.6;
        }
        const s = this.pSize[i] * Math.max(0, this.pLife[i] / this.pMax[i]);
        m.compose(pv.set(this.pPos[i * 3], this.pPos[i * 3 + 1], this.pPos[i * 3 + 2]), q, sv.set(s, s, s));
        this.pMesh.setMatrixAt(i, m);
        if (this.pLife[i] <= 0) this.pMesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
      }
    }
    this.pMesh.instanceMatrix.needsUpdate = true;

    // halkalar
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const u = r.t / r.dur;
      const e = 1 - Math.pow(1 - clamp(u, 0, 1), 3);
      r.mesh.scale.setScalar(Math.max(0.05, e * r.maxR));
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - u);
      if (u >= 1) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        (r.mesh.material as THREE.Material).dispose();
        this.rings.splice(i, 1);
      }
    }
  }

  private updateCamera(dt: number) {
    if (this.introActive) {
      this.introT += dt * (this.touched ? 3.5 : 1);
      const u = clamp(this.introT / 6, 0, 1);
      const e = smooth(u);
      this.yaw = Math.PI * (1 - e) + Math.sin(u * Math.PI) * 0.0;
      this.pitch = 0.14 + 0.22 * e;
      this.dist = 6.2 + 2.6 * e;
      if (u >= 1) this.introActive = false;
    }
    const mid = new V().addVectors(this.pos, this.hg.root.position).multiplyScalar(0.5);
    const desired = new V(this.pos.x, 1.45, this.pos.z);
    if (this.introActive) {
      const u = smooth(clamp(this.introT / 6, 0, 1));
      desired.lerp(new V(mid.x, 1.25, mid.z), 1 - u);
    }
    this.camTarget.lerp(desired, 1 - Math.exp(-9 * dt));
    if (this.keys.has('arrowleft')) {
      this.yaw += 2.2 * dt * this.cameraSensitivity;
      this.introActive = false;
    }
    if (this.keys.has('arrowright')) {
      this.yaw -= 2.2 * dt * this.cameraSensitivity;
      this.introActive = false;
    }
    if (this.locked && !this.boss.dead) {
      const delta = this.boss.pos.clone().sub(this.pos);
      const desiredYaw = Math.atan2(-delta.x, -delta.z);
      this.yaw = turnToward(this.yaw, desiredYaw, dt * 4);
      this.camTarget.lerp(this.pos.clone().lerp(this.boss.pos, 0.35).setY(1.3), 1 - Math.exp(-6 * dt));
    }
    const cp = Math.cos(this.pitch);
    const d = this.dist;
    this.camera.position.set(this.camTarget.x + Math.sin(this.yaw) * cp * d, Math.max(0.4, this.camTarget.y + Math.sin(this.pitch) * d), this.camTarget.z + Math.cos(this.yaw) * cp * d);
    this.shake *= Math.exp(-9 * dt);
    const sh = this.shake * this.cameraShake;
    this.camera.position.x += (Math.random() - 0.5) * sh;
    this.camera.position.y += (Math.random() - 0.5) * sh;
    const limX = ARENA_X + 1.5;
    const limZ = ARENA_Z + 1.5;
    this.camera.position.x = clamp(this.camera.position.x, -limX, limX);
    this.camera.position.z = clamp(this.camera.position.z, -limZ, limZ);
    this.camera.lookAt(this.camTarget);
  }

  private updateOverlay(dt: number) {
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt;
      const sp = this.project(f.p);
      const u = f.t / 1.0;
      f.el.style.transform = `translate(${sp.x + f.dx * u}px, ${sp.y - 70 * u - 10}px) translate(-50%,-50%) scale(${1 + Math.max(0, 0.4 - u * 2)})`;
      f.el.style.opacity = String(u < 0.7 ? 1 : Math.max(0, 1 - (u - 0.7) / 0.3));
      f.el.style.display = sp.vis ? 'block' : 'none';
      if (u >= 1) {
        f.el.remove();
        this.floats.splice(i, 1);
      }
    }
    for (const b of this.hpBars) {
      const p = b.d.pos.clone().add(new V(0, 3.2, 0));
      const sp = this.project(p);
      const near = this.camera.position.distanceTo(b.d.pos) < 40;
      const show = sp.vis && near && (b.d.hp < b.d.maxHp || b.d.hitT < 6);
      b.el.style.display = show ? 'block' : 'none';
      if (show) {
        b.el.style.transform = `translate(${sp.x}px, ${sp.y}px) translate(-50%,-50%)`;
        b.fill.style.width = (b.d.hp / b.d.maxHp) * 100 + '%';
      }
    }
  }
}
