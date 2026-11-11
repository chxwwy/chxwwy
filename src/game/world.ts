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
  pew: 0x9a6a44,
  pewEnd: 0x7a5034,
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
  // Tonoz: duvar birleşimi (yan kenarlar) ve tepe daha karanlık, orta kemer açık
  return shadeVertices(g, (_x, y, z) => {
    const edge = 1 - 0.3 * (1 - smoothstep(0, 4, HALF_W - Math.abs(z)));
    const crown = 1 - 0.08 * smoothstep(0.6, 1, Math.abs(z) / HALF_W);
    return edge * crown * (0.85 + 0.15 * smoothstep(WALL_H, WALL_H + HALF_W, y));
  });
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
    g.strokeStyle = '#8a6a4e';
    g.fillStyle = '#8a6a4e';
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

// Köşe gölgelendirmesi: her köşeye yüksekliğe/konuma göre koyu-açık ton yazar.
// Taban ve tavan kenarları, sütun ve duvar birleşimleri daha karanlık görünür.
function shadeVertices(geo: THREE.BufferGeometry, fn: (x: number, y: number, z: number) => number) {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const v = fn(pos.getX(i), pos.getY(i), pos.getZ(i));
    col[i * 3] = v;
    col[i * 3 + 1] = v;
    col[i * 3 + 2] = v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Duvarlar: tabanda kir/nem karartısı, tavana doğru hafif kararma
function wallAO(x: number, y: number, z: number) {
  const floor = 0.55 + 0.45 * smoothstep(0, 4.5, y);
  const ceil = 1 - 0.18 * smoothstep(WALL_H - 5, WALL_H, y);
  const edge = 1 - 0.12 * (1 - smoothstep(0, 1.5, Math.min(Math.abs(Math.abs(z) - HALF_W), Math.abs(Math.abs(x) - HALF_LEN))));
  return floor * ceil * edge;
}

// Noise katmanı: canvas üstüne ince grenli doku (taş yüzeyi)
function addGrain(g: CanvasRenderingContext2D, w: number, h: number, amount: number, seed: number) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const r = rnd(seed);
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n * 255));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n * 230));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 200));
  }
  g.putImageData(img, 0, 0);
}

// Büyük taş blok dokusu (duvar): 2 sıra, derz, blok içi kenar ışığı/gölgesi, leke ve gren
function stoneTexture() {
  const r = rnd(7);
  const S = 512;
  return canvasTexture(S, S, (g) => {
    const mortar = '#6e5d50';
    g.fillStyle = mortar;
    g.fillRect(0, 0, S, S);
    const rows = 2;
    const cols = 4;
    const bh = S / rows;
    const bw = S / cols;
    for (let row = 0; row < rows; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let c = -1; c <= cols; c++) {
        const x = c * bw + off;
        const y = row * bh;
        const L = 0.86 + r() * 0.24;
        const warm = r() * 0.1;
        const base = [
          Math.round(204 * L * (1 + warm)),
          Math.round(186 * L),
          Math.round(164 * L * (1 - warm * 0.5)),
        ];
        // Blok gövdesi
        const grd = g.createLinearGradient(0, y + 4, 0, y + bh - 4);
        grd.addColorStop(0, `rgb(${base[0] + 12},${base[1] + 10},${base[2] + 8})`);
        grd.addColorStop(0.6, `rgb(${base[0]},${base[1]},${base[2]})`);
        grd.addColorStop(1, `rgb(${base[0] - 26},${base[1] - 24},${base[2] - 20})`);
        g.fillStyle = grd;
        g.fillRect(x + 5, y + 5, bw - 10, bh - 10);
        // Blok içinde yumuşak lekeler
        for (let k = 0; k < 6; k++) {
          const bx = x + 10 + r() * (bw - 20);
          const by = y + 10 + r() * (bh - 20);
          const rad = 10 + r() * 30;
          const sp = g.createRadialGradient(bx, by, 0, bx, by, rad);
          const dark = r() < 0.6;
          sp.addColorStop(0, dark ? 'rgba(70,40,20,0.08)' : 'rgba(255,240,210,0.07)');
          sp.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = sp;
          g.fillRect(bx - rad, by - rad, rad * 2, rad * 2);
        }
        // Kenar bevel: üst-sol açık, alt-sağ koyu
        g.fillStyle = 'rgba(255,236,200,0.35)';
        g.fillRect(x + 5, y + 5, bw - 10, 2);
        g.fillRect(x + 5, y + 5, 2, bh - 10);
        g.fillStyle = 'rgba(30,15,8,0.35)';
        g.fillRect(x + 5, y + bh - 7, bw - 10, 2);
        g.fillRect(x + bw - 7, y + 5, 2, bh - 10);
      }
    }
    // Çatlak ve kir izleri
    g.strokeStyle = 'rgba(40,28,20,0.25)';
    g.lineWidth = 1.2;
    for (let k = 0; k < 14; k++) {
      let x0 = r() * S;
      let y0 = r() * S;
      g.beginPath();
      g.moveTo(x0, y0);
      for (let q = 0; q < 4; q++) {
        x0 += (r() - 0.5) * 26;
        y0 += (r() - 0.5) * 26;
        g.lineTo(x0, y0);
      }
      g.stroke();
    }
    addGrain(g, S, S, 0.09, 31);
  });
}

// Taş döşeme: 4x4 düzensiz dörtgen plaka, derzli, her plaka farklı tonda
function floorStoneTexture() {
  const r = rnd(19);
  const S = 512;
  return canvasTexture(S, S, (g) => {
    g.fillStyle = '#6f6660';
    g.fillRect(0, 0, S, S);
    const n = 4;
    const cell = S / n;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const jx = (r() - 0.5) * 14;
        const jy = (r() - 0.5) * 14;
        const x = i * cell + 3 + jx;
        const y = j * cell + 3 + jy;
        const L = 0.9 + r() * 0.14;
        const grd = g.createLinearGradient(x, y, x + cell, y + cell);
        grd.addColorStop(0, `rgb(${Math.round(218 * L)},${Math.round(204 * L)},${Math.round(184 * L)})`);
        grd.addColorStop(1, `rgb(${Math.round(182 * L)},${Math.round(168 * L)},${Math.round(150 * L)})`);
        g.fillStyle = grd;
        g.fillRect(x, y, cell - 6 + (r() - 0.5) * 6, cell - 6 + (r() - 0.5) * 6);
        for (let k = 0; k < 5; k++) {
          const bx = x + r() * cell;
          const by = y + r() * cell;
          const rad = 8 + r() * 26;
          const sp = g.createRadialGradient(bx, by, 0, bx, by, rad);
          sp.addColorStop(0, r() < 0.5 ? 'rgba(90,55,30,0.10)' : 'rgba(255,245,220,0.08)');
          sp.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = sp;
          g.fillRect(bx - rad, by - rad, rad * 2, rad * 2);
        }
        // Kenar kirliliği
        const dirt = g.createLinearGradient(x, y + cell - 8, x, y);
        dirt.addColorStop(0, 'rgba(60,50,46,0.18)');
        dirt.addColorStop(0.3, 'rgba(60,50,46,0)');
        g.fillStyle = dirt;
        g.fillRect(x, y, cell - 6, cell - 6);
        // Plaka kenarında aşınma çizgisi
        g.fillStyle = 'rgba(255,240,215,0.25)';
        g.fillRect(x, y, cell - 8, 2);
      }
    }
    addGrain(g, S, S, 0.11, 47);
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
  // Sis: sıcak sepya yerine soğuk-mor bir taş iç mekân havası; uzak duvarlar mesafeyle kaybolur
  const fogColor = new THREE.Color(0x4a4150);
  scene.background = fogColor;
  scene.fog = new THREE.Fog(fogColor, 26, 92);

  // Gökyüzü ışığı soğuk, zemin yansıması sıcak: gölgeler mavimsi, ışık huzmeleri altın
  const hemi = new THREE.HemisphereLight(0xc4d4f2, 0x5a4a50, 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd6a0, 2.6);
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
  const floorTex = floorStoneTexture();
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
    opacity: 0.3,
    fog: false,
  });
  const beamSideMat = beamMainMat.clone();
  beamSideMat.opacity = 0.2;

  const wallTex = stoneTexture();
  const stoneMat = toon(C.stone);

  // Zemin ve duvarlar
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF_LEN * 2, HALF_W * 2), toon(0xffffff, { map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);

  // Her duvar kendi tekrar oranıyla: blok boyutu ~4 x 2.5 birim
  const wallSpecs: [THREE.BufferGeometry, number, number][] = [
    [shadeVertices(new THREE.BoxGeometry(HALF_LEN * 2 + 1.2, WALL_H, 0.6).translate(0, WALL_H / 2, HALF_W + 0.3), wallAO), (HALF_LEN * 2) / 8, WALL_H / 5],
    [shadeVertices(new THREE.BoxGeometry(HALF_LEN * 2 + 1.2, WALL_H, 0.6).translate(0, WALL_H / 2, -HALF_W - 0.3), wallAO), (HALF_LEN * 2) / 8, WALL_H / 5],
    [shadeVertices(new THREE.BoxGeometry(0.6, WALL_H, HALF_W * 2 + 1.2).translate(HALF_LEN + 0.3, WALL_H / 2, 0), wallAO), (HALF_W * 2) / 8, WALL_H / 5],
    [shadeVertices(new THREE.BoxGeometry(0.6, WALL_H, HALF_W * 2 + 1.2).translate(-HALF_LEN - 0.3, WALL_H / 2, 0), wallAO), (HALF_W * 2) / 8, WALL_H / 5],
  ];
  for (const [g, rx, ry] of wallSpecs) {
    const t = wallTex.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    const m = new THREE.Mesh(g, toon(0xffffff, { map: t, vertexColors: true }));
    m.receiveShadow = true;
    root.add(m);
  }

  // Mimari detay: duvar tabanında kaide (plinth) ve tonoz hizasında kornişi
  {
    const molding = toon(C.stone, { vertexColors: false });
    const L = HALF_LEN * 2 + 1.2;
    const W = HALF_W * 2 + 1.2;
    const parts = [
      new THREE.BoxGeometry(L, 0.7, 0.3).translate(0, 0.35, HALF_W - 0.1),
      new THREE.BoxGeometry(L, 0.7, 0.3).translate(0, 0.35, -HALF_W + 0.1),
      new THREE.BoxGeometry(0.3, 0.7, W).translate(HALF_LEN - 0.1, 0.35, 0),
      new THREE.BoxGeometry(0.3, 0.7, W).translate(-HALF_LEN + 0.1, 0.35, 0),
    ];
    const plinthGeo = shadeVertices(mergeGeometries(parts)!, (_x, y) => 0.8 + 0.2 * smoothstep(0, 0.7, y));
    const plinth = new THREE.Mesh(plinthGeo, toon(C.stone, { vertexColors: true }));
    plinth.receiveShadow = true;
    root.add(plinth);
    const cornParts = [
      new THREE.BoxGeometry(L, 0.5, 0.5).translate(0, WALL_H - 0.25, HALF_W - 0.05),
      new THREE.BoxGeometry(L, 0.5, 0.5).translate(0, WALL_H - 0.25, -HALF_W + 0.05),
    ];
    const cg = mergeGeometries(cornParts)!;
    const cornice = new THREE.Mesh(cg, molding);
    cornice.receiveShadow = true;
    root.add(cornice);
  }

  // Tonoz ve tonoz kaburgaları
  const vault = new THREE.Mesh(vaultGeometry(), toon(C.vault, { side: THREE.DoubleSide, vertexColors: true }));
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
  pillarMesh(shafts.map(g => shadeVertices(g, (_x, y) => 0.7 + 0.3 * smoothstep(0, 5, y))), toon(C.pillar, { vertexColors: true }));
  // Sütun başlıklarına ince halka (astragal): taş detayını artırır
  const rings: THREE.BufferGeometry[] = [];
  for (const x of PILLAR_X) {
    for (const s of [-1, 1]) {
      rings.push(new THREE.TorusGeometry(PILLAR_R * 0.98, 0.08, 6, 16).rotateX(Math.PI / 2).translate(x, WALL_H - 0.85, s * PILLAR_Z));
    }
  }
  pillarMesh(rings, toon(C.capital));
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
      new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, depthWrite: false, fog: false, opacity: 0.5, color: 0xfff1d8 })
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
  // Ana pencere: pencere önünde yumuşak, katmanlı ışık halesi (bloom taklidi)
  {
    const haloTex = canvasTexture(128, 128, (g) => {
      const r = g.createRadialGradient(64, 64, 4, 64, 64, 64);
      r.addColorStop(0, 'rgba(255,220,150,0.9)');
      r.addColorStop(0.5, 'rgba(255,190,110,0.25)');
      r.addColorStop(1, 'rgba(255,170,90,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, 128, 128);
    });
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(MAIN_WIN.w * 2.4, MAIN_WIN.h * 1.7),
      new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.55, side: THREE.DoubleSide })
    );
    halo.position.set(HALF_LEN - 0.6, MAIN_WIN.y0 + MAIN_WIN.h * 0.5, 0);
    halo.rotation.y = Math.PI / 2;
    halo.renderOrder = 3;
    root.add(halo);
  }

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
      opacity: 0.75,
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
