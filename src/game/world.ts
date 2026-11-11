import * as THREE from 'three';
import { toon } from './toon';

export interface Circle {
  x: number;
  z: number;
  r: number;
}

// Oyuncunun gidebileceği sınırlar (katedral iç mekânı: uzun ve dar nef)
export const ARENA_X = 31;
export const ARENA_Z = 12.5;

const HALF_LEN = 32; // nef yarı uzunluğu (x)
const HALF_W = 14; // nef yarı genişliği (z)
const WALL_H = 20; // duvar yüksekliği
const VAULT_R = 14; // tonoz yarıçapı (z yönünde)

// Sıcak, açık renk paleti
const C = {
  wall: 0xb98b6c,
  vault: 0xd9b78f,
  floor: 0xdcbb93,
  carpet: 0x9e4f45,
  pillar: 0xd2ac86,
  capital: 0xe8cfa6,
  pew: 0x8e5f40,
  pewSeat: 0x9f6d4b,
  dais: 0xcaa27a,
  altar: 0x7a4a36,
  altarCloth: 0xf2e4c8,
  doorPanel: 0xe2c496,
  doorFrame: 0xf4e4c4,
  glass: 0xffb25e,
  mullion: 0x6b4a33,
};

// Pencere ışık konisi dokusu: alt kısım (pencere) parlak, üst kısım (zemin) sönük
function coneTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const v = g.createLinearGradient(0, 256, 0, 0);
  v.addColorStop(0, 'rgba(255,214,150,0.95)');
  v.addColorStop(0.55, 'rgba(255,200,130,0.4)');
  v.addColorStop(1, 'rgba(255,190,110,0)');
  g.fillStyle = v;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Kemerli pencere geometrisi (XY düzleminde; genişlik w, alt y0, yükseklik h)
function archWindowGeo(w: number, h: number, y0: number) {
  const r = w / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-r, y0);
  shape.lineTo(r, y0);
  shape.lineTo(r, y0 + h - r);
  shape.absarc(0, y0 + h - r, r, 0, Math.PI, false);
  shape.lineTo(-r, y0);
  return new THREE.ShapeGeometry(shape, 8);
}

// Kolon dizisi ve sıralar için konumlar
const COLUMN_XS = [-24, -12, 0, 12, 24];
const COLUMN_Z = 11.2;

const OBSTACLES: Circle[] = [];
for (const x of COLUMN_XS) {
  OBSTACLES.push({ x, z: COLUMN_Z, r: 0.95 });
  OBSTACLES.push({ x, z: -COLUMN_Z, r: 0.95 });
}

export function buildWorld(scene: THREE.Scene) {
  const fogColor = new THREE.Color(0xc69764);
  scene.background = fogColor;
  scene.fog = new THREE.Fog(fogColor, 40, 115);

  // ışıklar
  const hemi = new THREE.HemisphereLight(0xffe9c8, 0x6a4a44, 1.45);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffdca0, 2.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -26;
  sc.right = 26;
  sc.top = 26;
  sc.bottom = -26;
  sc.near = 1;
  sc.far = 140;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  const root = new THREE.Group();
  scene.add(root);

  // Malzemeler
  const wallMat = toon(C.wall);
  const vaultMat = toon(C.vault, { side: THREE.DoubleSide });
  const floorMat = toon(C.floor);
  const carpetMat = toon(C.carpet);
  const pillarMat = toon(C.pillar);
  const capitalMat = toon(C.capital);
  const pewMat = toon(C.pew);
  const seatMat = toon(C.pewSeat);
  const daisMat = toon(C.dais);
  const altarMat = toon(C.altar);
  const clothMat = toon(C.altarCloth);
  const doorPanelMat = toon(C.doorPanel);
  const doorFrameMat = toon(C.doorFrame);
  const glassMat = new THREE.MeshBasicMaterial({ color: C.glass, side: THREE.DoubleSide, fog: false });
  const mullionMat = toon(C.mullion);

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, cast = false) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    root.add(m);
    return m;
  };
  const boxGeo = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

  // Zemin ve sunak halısı
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF_LEN * 2 + 2, HALF_W * 2 + 2), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);
  add(boxGeo(HALF_LEN * 2 - 2, 0.04, 5.2), carpetMat, 0, 0.02, 0);

  // Duvarlar: iki uzun yan duvar, batı ve doğu kısa duvarlar
  add(boxGeo(HALF_LEN * 2 + 2, WALL_H, 1), wallMat, 0, WALL_H / 2, HALF_W + 0.5);
  add(boxGeo(HALF_LEN * 2 + 2, WALL_H, 1), wallMat, 0, WALL_H / 2, -HALF_W - 0.5);
  add(boxGeo(1, WALL_H, HALF_W * 2 + 2), wallMat, HALF_LEN + 0.5, WALL_H / 2, 0);
  add(boxGeo(1, WALL_H, HALF_W * 2 + 2), wallMat, -HALF_LEN - 0.5, WALL_H / 2, 0);

  // Tonoz: duvar üstünden yukarı kavis eden yarım silindir (elle üretilmiş)
  {
    const NX = 32;
    const NA = 18;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let j = 0; j <= NA; j++) {
      const phi = (Math.PI * j) / NA;
      const y = WALL_H + VAULT_R * Math.sin(phi);
      const z = VAULT_R * Math.cos(phi);
      for (let i = 0; i <= NX; i++) {
        const x = -HALF_LEN + (2 * HALF_LEN * i) / NX;
        pos.push(x, y, z);
      }
    }
    for (let j = 0; j < NA; j++) {
      for (let i = 0; i < NX; i++) {
        const a = j * (NX + 1) + i;
        const b = a + 1;
        const c2 = a + (NX + 1);
        const d = c2 + 1;
        idx.push(a, c2, b, b, c2, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const vault = new THREE.Mesh(g, vaultMat);
    root.add(vault);
  }

  // Kolonlar ve başlıkları
  for (const x of COLUMN_XS) {
    for (const z of [COLUMN_Z, -COLUMN_Z]) {
      const shaft = new THREE.CylinderGeometry(0.75, 0.9, WALL_H - 0.6, 10);
      add(shaft, pillarMat, x, (WALL_H - 0.6) / 2, z, true);
      add(boxGeo(2.0, 0.6, 2.0), capitalMat, x, 0.3, z);
      add(boxGeo(2.1, 0.8, 2.1), capitalMat, x, WALL_H - 0.9, z);
    }
  }

  // Sıralar: nefin iki yanında, orta koridor boş
  const pewZs = [-7.8, -4.4, 4.4, 7.8];
  for (const zc of pewZs) {
    const back = zc + Math.sign(zc) * 0.5;
    for (let x = -27; x <= 21; x += 3) {
      add(boxGeo(2.6, 0.45, 1.1), seatMat, x + 1.3, 0.45, zc, true);
      add(boxGeo(2.6, 1.1, 0.16), pewMat, x + 1.3, 1.0, back, true);
    }
  }

  // Sunak kürsüsü (nefin doğu ucu)
  add(boxGeo(7, 0.6, 9), daisMat, 27.5, 0.3, 0, true);
  add(boxGeo(1.6, 1.1, 3), altarMat, 29.8, 1.15, 0, true);
  add(boxGeo(1.8, 0.1, 3.2), clothMat, 29.8, 1.7, 0);

  // Büyük ana pencere (doğu ucu, kürsünün arkası)
  const bigGlass = new THREE.Mesh(archWindowGeo(7, 15, 4), glassMat);
  bigGlass.position.set(HALF_LEN - 0.12, 0, 0);
  bigGlass.rotation.y = Math.PI / 2;
  root.add(bigGlass);
  add(boxGeo(0.2, 0.2, 7.2), mullionMat, HALF_LEN - 0.2, 11.5, 0);
  add(boxGeo(0.2, 15.6, 0.2), mullionMat, HALF_LEN - 0.2, 11.5, 0);
  add(boxGeo(0.2, 15.6, 0.2), mullionMat, HALF_LEN - 0.2, 11.5, 1.8);
  add(boxGeo(0.2, 15.6, 0.2), mullionMat, HALF_LEN - 0.2, 11.5, -1.8);

  // Yan küçük pencereler: her iki yanda ikişer adet
  const sideWindows: { x: number; z: number }[] = [
    { x: -16, z: HALF_W - 0.1 },
    { x: -4, z: HALF_W - 0.1 },
    { x: -16, z: -HALF_W + 0.1 },
    { x: -4, z: -HALF_W + 0.1 },
  ];
  const smallGeo = archWindowGeo(3, 8.5, 6.5);
  for (const sw of sideWindows) {
    const g = new THREE.Mesh(smallGeo, glassMat);
    g.position.set(sw.x, 0, sw.z);
    if (sw.z < 0) g.rotation.y = Math.PI;
    root.add(g);
  }

  // Kapı (batı ucu): düşük poligonlu, açık renkli, basit
  add(boxGeo(0.3, 8.2, 5.2), doorFrameMat, -HALF_LEN + 0.2, 4.1, 0);
  add(boxGeo(0.25, 7.2, 4.2), doorPanelMat, -HALF_LEN + 0.45, 3.6, 0);

  // Işık konileri: büyük pencereden zemine, yan pencerelerden daha küçük
  const coneTex = coneTexture();
  const coneMat = new THREE.MeshBasicMaterial({
    map: coneTex,
    color: 0xffb865,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const coneGeos: THREE.BufferGeometry[] = [];

  const addCone = (
    from: THREE.Vector3,
    inward: THREE.Vector3,
    slope: number,
    topR: number,
    bottomR: number
  ) => {
    const dir = new THREE.Vector3(inward.x, -slope, inward.z).normalize();
    const length = from.y / Math.abs(dir.y);
    const geo = new THREE.CylinderGeometry(topR, bottomR, length, 24, 1, true);
    coneGeos.push(geo);
    const cone = new THREE.Mesh(geo, coneMat);
    cone.position.copy(from).addScaledVector(dir, length / 2);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    cone.renderOrder = 3;
    root.add(cone);
    return { dir, length };
  };

  // büyük pencere: iki koni (dış geniş, iç dar)
  const bigFrom = new THREE.Vector3(HALF_LEN - 0.3, 11.5, 0);
  const bigIn = new THREE.Vector3(-1, 0, 0);
  const big = addCone(bigFrom, bigIn, 0.85, 6.2, 3.2);
  addCone(bigFrom, bigIn, 0.85, 4.0, 2.0);
  // zemindeki ışık havuzu
  const landX = bigFrom.x + big.dir.x * big.length;
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(5.5, 32),
    new THREE.MeshBasicMaterial({
      map: coneTex,
      color: 0xffc070,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(landX, 0.05, 0);
  root.add(pool);

  // yan pencere konileri
  for (const sw of sideWindows) {
    const from = new THREE.Vector3(sw.x, 11, sw.z > 0 ? HALF_W - 0.5 : -HALF_W + 0.5);
    const inward = new THREE.Vector3(0, 0, sw.z > 0 ? -1 : 1);
    addCone(from, inward, 0.85, 2.6, 1.0);
  }

  // Toz zerrecikleri
  const N = 600;
  const dp = new Float32Array(N * 3);
  const dv = new Float32Array(N * 3);
  const rr = rnd(99);
  for (let i = 0; i < N; i++) {
    dp[i * 3] = (rr() - 0.5) * 90;
    dp[i * 3 + 1] = rr() * 20;
    dp[i * 3 + 2] = (rr() - 0.5) * 26;
    dv[i * 3] = (rr() - 0.5) * 0.3;
    dv[i * 3 + 1] = 0.05 + rr() * 0.2;
    dv[i * 3 + 2] = (rr() - 0.5) * 0.3;
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
    obstacles: OBSTACLES,
    sun,
    dispose() {
      coneGeos.forEach((g) => g.dispose());
      coneTex.dispose();
      coneMat.dispose();
      glassMat.dispose();
    },
    update(dt: number, t: number, center: THREE.Vector3) {
      sun.position.set(center.x + 22, center.y + 34, center.z + 14);
      sun.target.position.copy(center);
      sun.target.updateMatrixWorld();
      for (let i = 0; i < N; i++) {
        dp[i * 3] += (dv[i * 3] + Math.sin(t * 0.4 + i) * 0.05) * dt;
        dp[i * 3 + 1] += dv[i * 3 + 1] * dt;
        dp[i * 3 + 2] += (dv[i * 3 + 2] + Math.cos(t * 0.3 + i) * 0.05) * dt;
        if (dp[i * 3 + 1] > 20) dp[i * 3 + 1] = 0;
        if (dp[i * 3] > 45) dp[i * 3] = -45;
        if (dp[i * 3] < -45) dp[i * 3] = 45;
        if (dp[i * 3 + 2] > 13) dp[i * 3 + 2] = -13;
        if (dp[i * 3 + 2] < -13) dp[i * 3 + 2] = 13;
      }
      dg.attributes.position.needsUpdate = true;
    },
  };
}

function rnd(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
