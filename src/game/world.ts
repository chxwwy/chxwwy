import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { toon } from './toon';
import cathedralUrl from '../assets/katedral.glb?url';

export interface Circle {
  x: number;
  z: number;
  r: number;
}

// Oynanabilir yarı genişlik (katedral iç mekânı)
export const ARENA = 32;

function rnd(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Pencere ışık huzmesi dokusu: yukarıdan aşağı solan, kenarları yumuşak gradyan
function beamTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d')!;
  const v = g.createLinearGradient(0, 256, 0, 0);
  v.addColorStop(0, 'rgba(255,225,160,0.9)');
  v.addColorStop(0.6, 'rgba(255,205,130,0.25)');
  v.addColorStop(1, 'rgba(255,190,110,0)');
  g.fillStyle = v;
  g.fillRect(0, 0, 64, 256);
  g.globalCompositeOperation = 'destination-in';
  const h = g.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, 'rgba(0,0,0,0)');
  h.addColorStop(0.3, 'rgba(0,0,0,1)');
  h.addColorStop(0.7, 'rgba(0,0,0,1)');
  h.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = h;
  g.fillRect(0, 0, 64, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Sabit sütun çemberleri (oyuncu / boss çarpışması için)
const PILLARS: Circle[] = [
  { x: -17.114, z: -16.9955, r: 1.9076 },
  { x: -17.4701, z: 19.8428, r: 1.9076 },
  { x: 21.2518, z: 18.9692, r: 1.9076 },
  { x: 21.2086, z: -21.8257, r: 1.9076 },
  { x: 21.2224, z: 0.0033, r: 1.9076 },
  { x: -17.3058, z: 0.0033, r: 1.9076 },
];

export function buildWorld(scene: THREE.Scene) {
  const fogColor = new THREE.Color(0xc69764);
  scene.background = fogColor;
  scene.fog = new THREE.Fog(fogColor, 38, 110);

  // ışıklar
  const hemi = new THREE.HemisphereLight(0xffe9c8, 0x6a4a44, 1.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffdca0, 2.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -24;
  sc.right = 24;
  sc.top = 24;
  sc.bottom = -24;
  sc.near = 1;
  sc.far = 120;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  const root = new THREE.Group();
  scene.add(root);
  let disposed = false;

  // Işık huzmesi: turuncu-altın, yumuşak kenarlı, toplamsal karışım
  const beamMat = new THREE.MeshBasicMaterial({
    map: beamTexture(),
    color: 0xff9a4a,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    opacity: 0.45,
    fog: false,
  });
  const beamGeos: THREE.PlaneGeometry[] = [];

  // Kutsal pencere camı: sıcak turuncu parıltı
  const amberGlass = new THREE.MeshBasicMaterial({
    color: 0xff9a3c,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });

  // Pencere ışık huzmesi: pencere boyutuyla orantılı, zemine kadar uzanan iki düzlem
  const addBeams = (win: THREE.Object3D) => {
    const box = new THREE.Box3().setFromObject(win);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const dir = new THREE.Vector3(-Math.sign(center.x) * 0.72, -0.62, 0).normalize();
    // pencere merkezinden zemine (y = 0) kadar olan yol
    const length = center.y / Math.abs(dir.y);
    const mid = center.clone().addScaledVector(dir, length / 2);
    const zAxis = new THREE.Vector3(0, 0, 1);
    const sideAxis = new THREE.Vector3().crossVectors(dir, zAxis).normalize();
    const sheets: [THREE.Vector3, number][] = [
      [zAxis, size.z],
      [sideAxis, size.z * 0.6],
    ];
    for (const [axis, width] of sheets) {
      const geo = new THREE.PlaneGeometry(width, length);
      beamGeos.push(geo);
      const beam = new THREE.Mesh(geo, beamMat);
      const normal = new THREE.Vector3().crossVectors(axis, dir).normalize();
      beam.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(axis, dir, normal));
      beam.position.copy(mid);
      beam.renderOrder = 3;
      root.add(beam);
    }
  };

  // Katedral modeli (Blender'dan dışa aktarılmış GLB)
  new GLTFLoader().load(
    cathedralUrl,
    ({ scene: model }) => {
      if (disposed) return;
      root.add(model);
      model.updateMatrixWorld(true);

      const remap = new Map<THREE.Material, THREE.Material>();
      model.traverse((obj) => {
        // Sade kapı: taş pervaz, demir kenar ve kapı halkaları gizlenir
        if (/^Kapı (taş pervazı|demir kenarı|halkası)/.test(obj.name)) {
          obj.visible = false;
          return;
        }
        if (!(obj instanceof THREE.Mesh)) return;

        const mat = obj.material;
        if (mat instanceof THREE.MeshStandardMaterial && mat.name.startsWith('Kehribar cam')) {
          obj.material = amberGlass;
          obj.castShadow = false;
          obj.receiveShadow = false;
        } else if (mat instanceof THREE.MeshStandardMaterial && mat.name === 'Kapı | eski meşe') {
          // Sade meşe kapı: süsleme yok, düz ahşap renk
          if (!remap.has(mat)) remap.set(mat, toon(0x5b3b27));
          obj.material = remap.get(mat)!;
          obj.receiveShadow = true;
        } else if (mat instanceof THREE.MeshStandardMaterial) {
          if (!remap.has(mat)) {
            remap.set(
              mat,
              toon(mat.color, {
                map: mat.map,
                side: mat.side,
                emissive: mat.emissive,
                emissiveIntensity: mat.emissiveIntensity,
              })
            );
          }
          obj.material = remap.get(mat)!;
          obj.receiveShadow = true;
        } else if (mat instanceof THREE.MeshBasicMaterial) {
          mat.depthWrite = false;
        }

        // Huzmeler malzemeden bağımsız olarak her pencere için üretilir
        if (obj.name.startsWith('Pencere_Isik')) addBeams(obj);
      });
    },
    undefined,
    (err) => console.error('Arena yüklenemedi', err)
  );

  // toz zerrecikleri
  const N = 600;
  const dp = new Float32Array(N * 3);
  const dv = new Float32Array(N * 3);
  const rr = rnd(99);
  for (let i = 0; i < N; i++) {
    dp[i * 3] = (rr() - 0.5) * 90;
    dp[i * 3 + 1] = rr() * 20;
    dp[i * 3 + 2] = (rr() - 0.5) * 90;
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
    obstacles: PILLARS,
    sun,
    dispose() {
      disposed = true;
      beamGeos.forEach((g) => g.dispose());
      beamMat.map?.dispose();
      beamMat.dispose();
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
        if (dp[i * 3 + 2] > 45) dp[i * 3 + 2] = -45;
        if (dp[i * 3 + 2] < -45) dp[i * 3 + 2] = 45;
      }
      dg.attributes.position.needsUpdate = true;
    },
  };
}
