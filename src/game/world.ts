import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon } from './toon';

export interface Circle {
  x: number;
  z: number;
  r: number;
}

// Oyuncunun gezebileceği iç alan sınırları
export const ARENA_X = 31;
export const ARENA_Z = 12.5;

const HALF_LEN = 32; // nef yarı uzunluğu (x)
const HALF_W = 14; // nef yarı genişliği (z): geniş ama ince bir nef için dar tutuldu
const WALL_H = 20; // duvar yüksekliği; tonoz bu hizadan başlar

// Simetrik sütunlar: iki uzun duvara bağlı (yarısı duvarın içinde)
const PILLAR_X = [-24, -12, 0, 12, 24];
const PILLAR_Z = HALF_W - 0.45;
const PILLAR_R = 0.8;

// Her yanda 2 küçük pencere, sütunların arasına yerleşik
const SIDE_WIN_X = [-18, 18];
const SIDE_WIN = { w: 2.4, h: 6.2, y0: 7.5 };

// Tek büyük pencere: nefin doğu ucunda, kürsünün arkasında
const MAIN_WIN = { w: 6.4, h: 11, y0: 4.5 };

// Kapı: batı ucunda, sade ahşap
const DOOR = { w: 3.0, h: 5.8 };

// Sıralar: koridorun iki yanında, kürsüye bakacak şekilde (oturma yüzü +x)
const PEW_ROWS = [-24, -19, -14, -9, 9, 14, 19];
const PEW_SEGS: [number, number][] = [
  [2.4, 6.4],
  [7.6, 11.6],
];
const PEW_LEN = 4.0;

const C = {
  wall: 0xa8785a,
  vault: 0xc39d76,
  floor: 0xcaa37a,
  floorLine: 0xa6805a,
  pillar: 0xb48c68,
  capital: 0xd2b088,
  rib: 0x9c7456,
  stone: 0xd4b28a,
  dais: 0xb48c68,
  altar: 0x7a4a36,
  cloth: 0xf2e4c8,
  pew: 0x7a4c30,
  pewEnd: 0x643e26,
  doorLeaf: 0x8b5a34,
  doorPanel: 0x744a2b,
  knob: 0xd9b06a,
};

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Kemerli (sivri olmayan, yuvarlak tepeli) yol: tabanı y0, genişliği w, dikey kısmı h
function addArch(path: THREE.Path, w: number, h: number, y0: number) {
  const r = w / 2;
  const yc = y0 + h - r;
  path.moveTo(-r, y0);
  path.lineTo(r, y0);
  path.lineTo(r, yc);
  path.absarc(0, yc, r, 0, Math.PI, false);
  path.lineTo(-r, y0);
}

// Düz tabanlı, kemerli bir kutu parçası (tek geometri) — birleştirme için
function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

// Sütunun gövdesi, kaidesi ve başlığı
function pillarParts(x: number, z: number) {
  return {
    shaft: new THREE.CylinderGeometry(PILLAR_R, PILLAR_R * 1.05, WALL_H - 0.8, 16).translate(x, (WALL_H - 0.8) / 2, z),
    base: box(2.0, 0.6, 2.0, x, 0.3, z),
    capital: box(1.9, 0.8, 1.9, x, WALL_H - 0.4, z),
  };
}

// Tonoz: iki uzun duvar arasında yarım silindir yüzey
function vaultGeometry() {
  const seg = 28;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = (Math.PI * i) / seg;
    const y = WALL_H + HALF_W * Math.sin(t);
    const z = HALF_W * Math.cos(t);
    pos.push(-HALF_LEN, y, z, HALF_LEN, y, z);
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Tek bir sıra: oturma yüzü +x'e (kürsüye) bakar, sırtlık -x tarafındadır
function pewParts(x: number, z: number) {
  return {
    wood: [
      box(0.8, 0.1, PEW_LEN, x, 0.5, z), // oturak
      box(0.09, 0.8, PEW_LEN, x - 0.38, 0.95, z), // sırtlık (ince)
      box(0.16, 0.1, PEW_LEN, x - 0.38, 1.38, z), // sırtlık üst kenarı
      box(0.55, 0.42, PEW_LEN - 0.3, x, 0.21, z), // alçak kaide
    ],
    ends: [
      box(0.12, 0.62, 0.1, x - 0.02, 0.5, z - PEW_LEN / 2 + 0.05),
      box(0.12, 0.62, 0.1, x - 0.02, 0.5, z + PEW_LEN / 2 - 0.05),
    ],
  };
}

// Pencere camı: alttan üste aydınlık, sıcak turuncu-altın (opak, arkası görünmez)
function glassTexture() {
  return canvasTexture(128, 128, (g) => {
    const r = g.createRadialGradient(64, 70, 4, 64, 64, 92);
    r.addColorStop(0, '#fff0b4');
    r.addColorStop(0.45, '#ffc46c');
    r.addColorStop(1, '#b65f1e');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
  });
}

// Işık huzmesi dokusu: pencerede dolgun, zeminde yumuşak sönen; kenarları yumuşak
function beamTexture() {
  return canvasTexture(64, 128, (g) => {
    // y=0 zemin, y=128 pencere: pencere yakınında sönük, orta gövdede parlak, zeminde sönük
    const v = g.createLinearGradient(0, 0, 0, 128);
    v.addColorStop(0, 'rgba(255,200,120,0)');
    v.addColorStop(0.4, 'rgba(255,200,120,1)');
    v.addColorStop(1, 'rgba(255,200,120,0.02)');
    g.fillStyle = v;
    g.fillRect(0, 0, 64, 128);
    g.globalCompositeOperation = 'destination-in';
    const h = g.createLinearGradient(0, 0, 64, 0);
    h.addColorStop(0, 'rgba(0,0,0,0)');
    h.addColorStop(0.15, 'rgba(0,0,0,0.8)');
    h.addColorStop(0.5, 'rgba(0,0,0,0.45)');
    h.addColorStop(0.85, 'rgba(0,0,0,0.8)');
    h.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = h;
    g.fillRect(0, 0, 64, 128);
  });
}

// Yerdeki güneş amblemi (halının yerine)
function sunTexture() {
  return canvasTexture(512, 512, (g) => {
    g.translate(256, 256);
    g.strokeStyle = '#b8773a';
    g.fillStyle = '#b8773a';
    g.lineWidth = 16;
    g.beginPath();
    g.arc(0, 0, 190, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, 110, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8;
      const a1 = a - 0.09;
      const a2 = a + 0.09;
      g.beginPath();
      g.moveTo(Math.cos(a1) * 215, Math.sin(a1) * 215);
      g.lineTo(Math.cos(a) * 275, Math.sin(a) * 275);
      g.lineTo(Math.cos(a2) * 215, Math.sin(a2) * 215);
      g.closePath();
      g.fill();
    }
  });
}

// Büyük, sakin taş blok dokusu: geniş bloklar, ince derz, az ton farkı (tuğla değil)
function stoneTexture() {
  const r = rnd(7);
  return canvasTexture(256, 256, (g) => {
    g.fillStyle = '#9c7656';
    g.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 2; row++) {
      const y = row * 128;
      const off = row % 2 ? 64 : 0;
      for (let c = -1; c < 3; c++) {
        const x = c * 128 + off;
        const L = 0.96 + r() * 0.08;
        g.fillStyle = `rgb(${Math.round(222 * L)},${Math.round(190 * L)},${Math.round(150 * L)})`;
        g.fillRect(x + 2, y + 2, 124, 124);
      }
    }
  });
}

function rnd(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function buildWorld(scene: THREE.Scene) {
  const fogColor = new THREE.Color(0x8e6246);
  scene.background = fogColor;
  scene.fog = new THREE.Fog(fogColor, 30, 95);

  const hemi = new THREE.HemisphereLight(0xffe2b8, 0x3a2822, 0.8);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd090, 2.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -26;
  sc.right = 26;
  sc.top = 26;
  sc.bottom = -26;
  sc.near = 1;
  sc.far = 120;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  const root = new THREE.Group();
  scene.add(root);
  let disposed = false;

  const glassTex = glassTexture();
  const beamTex = beamTexture();
  const sunTex = sunTexture();
  const floorTex = canvasTexture(128, 128, (g) => {
    g.fillStyle = '#dcbb93';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#c69f74';
    g.fillRect(0, 0, 128, 3);
    g.fillRect(0, 0, 3, 128);
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(HALF_LEN / 2, HALF_W / 2);

  const glassMat = new THREE.MeshBasicMaterial({ map: glassTex, side: THREE.DoubleSide, fog: false });
  const beamMainMat = new THREE.MeshBasicMaterial({
    map: beamTex,
    color: 0xffb060,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    opacity: 0.17,
    fog: false,
  });
  const beamSideMat = beamMainMat.clone();
  beamSideMat.opacity = 0.11;

  const wallTex = stoneTexture();
  const stoneMat = toon(C.stone);

  // Zemin ve duvarlar
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF_LEN * 2, HALF_W * 2), toon(0xffffff, { map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);

  // Her duvar kendi tekrar oranıyla: blok boyutu ~4 x 2.5 birim
  const wallSpecs: [THREE.BufferGeometry, number, number][] = [
    [new THREE.BoxGeometry(HALF_LEN * 2 + 1.2, WALL_H, 0.6).translate(0, WALL_H / 2, HALF_W + 0.3), (HALF_LEN * 2) / 4, WALL_H / 2.5],
    [new THREE.BoxGeometry(HALF_LEN * 2 + 1.2, WALL_H, 0.6).translate(0, WALL_H / 2, -HALF_W - 0.3), (HALF_LEN * 2) / 4, WALL_H / 2.5],
    [new THREE.BoxGeometry(0.6, WALL_H, HALF_W * 2 + 1.2).translate(HALF_LEN + 0.3, WALL_H / 2, 0), (HALF_W * 2) / 4, WALL_H / 2.5],
    [new THREE.BoxGeometry(0.6, WALL_H, HALF_W * 2 + 1.2).translate(-HALF_LEN - 0.3, WALL_H / 2, 0), (HALF_W * 2) / 4, WALL_H / 2.5],
  ];
  for (const [g, rx, ry] of wallSpecs) {
    const t = wallTex.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    const m = new THREE.Mesh(g, toon(0xffffff, { map: t }));
    m.receiveShadow = true;
    root.add(m);
  }

  // Tonoz ve tonoz kaburgaları
  const vault = new THREE.Mesh(vaultGeometry(), toon(C.vault, { side: THREE.DoubleSide }));
  vault.receiveShadow = true;
  root.add(vault);
  const ribMat = toon(C.rib);
  for (const x of PILLAR_X) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(HALF_W, 0.38, 8, 40, Math.PI), ribMat);
    rib.rotation.y = Math.PI / 2;
    rib.position.set(x, WALL_H, 0);
    root.add(rib);
  }

  // Sütunlar (duvara bağlı, simetrik)
  const shafts: THREE.BufferGeometry[] = [];
  const bases: THREE.BufferGeometry[] = [];
  const capitals: THREE.BufferGeometry[] = [];
  const pillarCircles: Circle[] = [];
  for (const x of PILLAR_X) {
    for (const s of [-1, 1]) {
      const z = s * PILLAR_Z;
      const p = pillarParts(x, z);
      shafts.push(p.shaft);
      bases.push(p.base);
      capitals.push(p.capital);
      pillarCircles.push({ x, z, r: PILLAR_R });
    }
  }
  const pillarMesh = (geos: THREE.BufferGeometry[], mat: THREE.Material) => {
    const m = new THREE.Mesh(mergeGeometries(geos)!, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  };
  pillarMesh(shafts, toon(C.pillar));
  pillarMesh(bases, toon(C.capital));
  pillarMesh(capitals, toon(C.capital));


  // Pencere çerçevesi (taş) ve cam: kemerli yüzey, içinde çubuk yok
  function addWindow(x: number, rotY: number, win: { w: number; h: number; y0: number }, frameZ: number, glassZ: number, frameDepth = 0.3) {
    const grp = new THREE.Group();
    grp.position.set(x, 0, 0);
    grp.rotation.y = rotY;
    root.add(grp);
    const t = 0.3;
    const outer = new THREE.Shape();
    addArch(outer, win.w + 2 * t, win.h + 2 * t, win.y0 - t);
    const hole = new THREE.Path();
    addArch(hole, win.w, win.h, win.y0);
    outer.holes.push(hole);
    const frame = new THREE.Mesh(
      new THREE.ExtrudeGeometry(outer, { depth: frameDepth, bevelEnabled: false, curveSegments: 14 }),
      stoneMat
    );
    frame.position.z = frameZ;
    grp.add(frame);
    const gShape = new THREE.Shape();
    addArch(gShape, win.w, win.h, win.y0);
    const glass = new THREE.Mesh(new THREE.ShapeGeometry(gShape, 14), glassMat);
    glass.position.z = glassZ;
    grp.add(glass);
    return grp;
  }

  // Yan pencereler: iki uzun duvarda, her birinde 2 adet
  for (const x of SIDE_WIN_X) {
    addWindow(x, 0, SIDE_WIN, HALF_W - 0.3, HALF_W - 0.12);
    addWindow(x, Math.PI, SIDE_WIN, HALF_W - 0.3, HALF_W - 0.12);
  }

  // Büyük pencere: doğu ucunda (x = +HALF_LEN), kürsünün arkasında
  addWindow(HALF_LEN, -Math.PI / 2, MAIN_WIN, 0.05, 0.12, 0.35);

  // Kapı: batı ucunda, sade ahşap kapı (taş pervaz/halka yok)
  {
    const grp = new THREE.Group();
    grp.position.set(-HALF_LEN, 0, 0);
    grp.rotation.y = Math.PI / 2;
    root.add(grp);
    const t = 0.22;
    const outer = new THREE.Shape();
    addArch(outer, DOOR.w + 2 * t, DOOR.h + t, 0);
    const hole = new THREE.Path();
    addArch(hole, DOOR.w, DOOR.h, 0);
    outer.holes.push(hole);
    const frame = new THREE.Mesh(
      new THREE.ExtrudeGeometry(outer, { depth: 0.3, bevelEnabled: false, curveSegments: 14 }),
      toon(C.stone)
    );
    frame.position.z = 0.05;
    grp.add(frame);
    const leafShape = new THREE.Shape();
    addArch(leafShape, DOOR.w, DOOR.h, 0);
    const leaf = new THREE.Mesh(
      new THREE.ExtrudeGeometry(leafShape, { depth: 0.22, bevelEnabled: false, curveSegments: 14 }),
      toon(C.doorLeaf)
    );
    leaf.position.z = 0.1;
    grp.add(leaf);
    const panelMat = toon(C.doorPanel);
    const pTop = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.7, 0.06), panelMat);
    pTop.position.set(0, 3.6, 0.36);
    const pBot = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.7, 0.06), panelMat);
    pBot.position.set(0, 1.25, 0.36);
    grp.add(pTop, pBot);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), toon(C.knob));
    knob.position.set(1.0, 2.5, 0.42);
    grp.add(knob);
  }

  // Kürsü: taş sahanlık ve sunak (pencerenin önünde)
  {
    const dais = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.8, 8.4), toon(C.dais));
    dais.position.set(27.5, 0.4, 0);
    dais.receiveShadow = true;
    root.add(dais);
    const altar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 4.2), toon(C.altar));
    altar.position.set(29.2, 1.35, 0);
    altar.castShadow = true;
    root.add(altar);
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.1, 4.35), toon(C.cloth));
    cloth.position.set(29.2, 1.95, 0);
    root.add(cloth);
  }

  // Güneş amblemi: yerde, nefin ortasında
  {
    const sunDecal = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 8),
      new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, depthWrite: false, fog: false, opacity: 0.85 })
    );
    sunDecal.rotation.x = -Math.PI / 2;
    sunDecal.position.y = 0.015;
    root.add(sunDecal);
  }

  // Sıralar: iki yanda, seyrek, koridor boş
  {
    const woodGeos: THREE.BufferGeometry[] = [];
    const endGeos: THREE.BufferGeometry[] = [];
    for (const x of PEW_ROWS) {
      for (const [a, b] of PEW_SEGS) {
        for (const s of [-1, 1]) {
          const zc = (s * (a + b)) / 2;
          const p = pewParts(x, zc);
          woodGeos.push(...p.wood);
          endGeos.push(...p.ends);
        }
      }
    }
    const woodMesh = new THREE.Mesh(mergeGeometries(woodGeos)!, toon(C.pew));
    const endMesh = new THREE.Mesh(mergeGeometries(endGeos)!, toon(C.pewEnd));
    for (const m of [woodMesh, endMesh]) {
      m.castShadow = true;
      m.receiveShadow = true;
      root.add(m);
    }
  }

  // Işık huzmeleri: pencere boyutuna göre, iki düzlemli hacim
  const beamAxisQuad = (from: THREE.Vector3, to: THREE.Vector3, topW: number, botW: number, axis: THREE.Vector3) => {
    const a = from.clone().addScaledVector(axis, -topW / 2);
    const b = from.clone().addScaledVector(axis, topW / 2);
    const c = to.clone().addScaledVector(axis, botW / 2);
    const d = to.clone().addScaledVector(axis, -botW / 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    return g;
  };
  const addBeam = (from: THREE.Vector3, to: THREE.Vector3, topW: number, botW: number, axis1: THREE.Vector3, mat: THREE.Material) => {
    const dir = new THREE.Vector3().subVectors(to, from).normalize();
    const planes = [0, Math.PI / 3, (2 * Math.PI) / 3].map((a) => axis1.clone().applyAxisAngle(dir, a).normalize());
    for (const axis of planes) {
      const m = new THREE.Mesh(beamAxisQuad(from, to, topW, botW, axis), mat);
      m.renderOrder = 4;
      root.add(m);
    }
  };
  // Büyük pencere: en belirgin huzme
  addBeam(
    new THREE.Vector3(HALF_LEN - 0.8, MAIN_WIN.y0 + MAIN_WIN.h * 0.5, 0),
    new THREE.Vector3(5, 0.02, 0),
    MAIN_WIN.w * 0.95,
    15,
    new THREE.Vector3(0, 0, 1),
    beamMainMat
  );
  // Yan pencereler: daha zayıf
  for (const x of SIDE_WIN_X) {
    for (const s of [-1, 1]) {
      addBeam(
        new THREE.Vector3(x, SIDE_WIN.y0 + SIDE_WIN.h * 0.5, s * (HALF_W - 0.9)),
        new THREE.Vector3(x + 5, 0.02, s * 3.5),
        SIDE_WIN.w * 0.95,
        5.5,
        new THREE.Vector3(1, 0, 0),
        beamSideMat
      );
    }
  }

  // Toz zerrecikleri (sıcak, hafif)
  const N = 500;
  const dp = new Float32Array(N * 3);
  const dv = new Float32Array(N * 3);
  const rr = rnd(99);
  for (let i = 0; i < N; i++) {
    dp[i * 3] = (rr() - 0.5) * 60;
    dp[i * 3 + 1] = rr() * 20;
    dp[i * 3 + 2] = (rr() - 0.5) * 26;
    dv[i * 3] = (rr() - 0.5) * 0.25;
    dv[i * 3 + 1] = 0.04 + rr() * 0.15;
    dv[i * 3 + 2] = (rr() - 0.5) * 0.25;
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(
    dg,
    new THREE.PointsMaterial({
      color: 0xffe3b0,
      size: 0.14,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    })
  );
  dust.frustumCulled = false;
  scene.add(dust);

  return {
    obstacles: pillarCircles as Circle[],
    sun,
    dispose() {
      disposed = true;
      beamMainMat.dispose();
      beamSideMat.dispose();
      beamTex.dispose();
      glassTex.dispose();
      sunTex.dispose();
      floorTex.dispose();
      dg.dispose();
    },
    update(dt: number, t: number, center: THREE.Vector3) {
      if (disposed) return;
      sun.position.set(center.x + 22, center.y + 34, center.z + 14);
      sun.target.position.copy(center);
      sun.target.updateMatrixWorld();
      for (let i = 0; i < N; i++) {
        dp[i * 3] += (dv[i * 3] + Math.sin(t * 0.4 + i) * 0.04) * dt;
        dp[i * 3 + 1] += dv[i * 3 + 1] * dt;
        dp[i * 3 + 2] += (dv[i * 3 + 2] + Math.cos(t * 0.3 + i) * 0.04) * dt;
        if (dp[i * 3 + 1] > 20) dp[i * 3 + 1] = 0;
        if (dp[i * 3] > 30) dp[i * 3] = -30;
        if (dp[i * 3] < -30) dp[i * 3] = 30;
        if (dp[i * 3 + 2] > 13) dp[i * 3 + 2] = -13;
        if (dp[i * 3 + 2] < -13) dp[i * 3 + 2] = 13;
      }
      dg.attributes.position.needsUpdate = true;
    },
  };
}
