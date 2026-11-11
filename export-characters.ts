import * as THREE from 'three';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { SpearGirl } from './export-characters-node.ts';
import { HammerGirl } from './export-characters-node.ts';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

// Node.js için canvas/document polyfill (faceTexture için)
class MockCanvas {
  width = 512;
  height = 384;
  getContext(type: string) {
    if (type === '2d') {
      return {
        clearRect: () => {},
        fillRect: () => {},
        strokeRect: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        arc: () => {},
        ellipse: () => {},
        quadraticCurveTo: () => {},
        closePath: () => {},
        fill: () => {},
        stroke: () => {},
        fillText: () => {},
        measureText: () => ({ width: 0 }),
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        save: () => {},
        restore: () => {},
        translate: () => {},
        rotate: () => {},
        scale: () => {},
        clip: () => {},
        drawImage: () => {},
        getImageData: () => ({ data: new Uint8ClampedArray(512 * 384 * 4) }),
        putImageData: () => {},
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        lineCap: 'butt',
        font: '',
        textAlign: 'start',
        textBaseline: 'alphabetic',
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
      };
    }
    return null;
  }
  toDataURL() { return ''; }
  toBlob(callback: (blob: Blob | null) => void, _type?: string, _quality?: number) {
    const blob = new Blob([new Uint8Array(100)], { type: 'image/png' });
    setTimeout(() => callback(blob), 0);
  }
}

globalThis.document = {
  createElement: (tag: string) => {
    if (tag === 'canvas') return new MockCanvas();
    return { getContext: () => null, style: {} };
  },
  createElementNS: () => ({}),
} as any;

globalThis.HTMLCanvasElement = MockCanvas as any;
globalThis.CanvasRenderingContext2D = Object as any;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Export klasörü
const exportDir = join(__dirname, 'blender-export');
if (!existsSync(exportDir)) {
  mkdirSync(exportDir, { recursive: true });
}

// OBJ Exporter (basit, texture'siz, Node'da çalışır)
const exporter = new OBJExporter();

// Karakterleri oluştur
console.log('🎮 Karakterler oluşturuluyor...');

const spearGirl = new SpearGirl();
const hammerGirl = new HammerGirl();

// T-pose / idle pozisyonuna getir (animate ile)
const dummyTime = 0;
spearGirl.animate(0, {
  time: dummyTime,
  speed: 0,
  atkW: 0,
  atk: null,
  peaceW: 1,
  roll: 0,
  tuck: 0,
  reach: 0,
  lift: 0,
});

hammerGirl.animate(0, {
  time: dummyTime,
  speed: 0,
  active: 0,
  pose: [-0.28, 0.75, 0.25, 0, 0.85, 0], // HG_IDLE
  gripW: 0,
  roll: 0,
  tuck: 0,
  reach: 0,
  lift: 0,
});

// Outline mesh'lerini kaldır (Blender'da temiz olsun)
function removeOutlines(group: THREE.Group) {
  group.traverse((obj) => {
    if (obj.userData.outline === true) {
      obj.parent?.remove(obj);
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (obj.material instanceof THREE.Material) obj.material.dispose();
      }
    }
  });
}

removeOutlines(spearGirl.root);
removeOutlines(hammerGirl.root);

// Materyalleri basitleştir - texture'ları kaldır, vertex color/renk koru
function simplifyMaterials(group: THREE.Group) {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const newMats = mats.map((mat) => {
        // Vertex color varsa kullan, yoksa materyal rengi
        const color = mat.vertexColors ? undefined : (mat.color ? mat.color.clone() : new THREE.Color(0xcccccc));
        return new THREE.MeshBasicMaterial({
          color,
          vertexColors: mat.vertexColors ?? false,
          transparent: mat.transparent ?? false,
          opacity: mat.opacity ?? 1,
          side: mat.side ?? THREE.FrontSide,
          depthWrite: mat.depthWrite ?? true,
          depthTest: mat.depthTest ?? true,
          alphaTest: mat.alphaTest ?? 0,
        });
      });
      obj.material = newMats.length === 1 ? newMats[0] : newMats;
      // Eski materyalleri dispose et
      mats.forEach(m => m.dispose());
    }
  });
}

simplifyMaterials(spearGirl.root);
simplifyMaterials(hammerGirl.root);

// Export fonksiyonu - OBJ format
function exportCharacterOBJ(name: string, root: THREE.Group) {
  const scene = new THREE.Scene();
  const clone = root.clone();
  scene.add(clone);

  // Merkeze al
  const box = new THREE.Box3().setFromObject(clone);
  const center = box.getCenter(new THREE.Vector3());
  clone.position.sub(center);

  // OBJExporter parse eder ve string döndürür
  const objString = exporter.parse(scene);
  const filepath = join(exportDir, `${name}.obj`);
  writeFileSync(filepath, objString);
  console.log(`✅ ${name}.obj kaydedildi: ${filepath}`);
}

async function main() {
  try {
    console.log('📦 OBJ export başlıyor...');
    exportCharacterOBJ('SpearGirl', spearGirl.root);
    exportCharacterOBJ('HammerGirl', hammerGirl.root);
    
    // Materyalleri de temizle
    spearGirl.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material.dispose();
        }
        obj.geometry.dispose();
      }
    });
    hammerGirl.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material.dispose();
        }
        obj.geometry.dispose();
      }
    });

    console.log('\n🎉 Export tamamlandı!');
    console.log(`📁 Dosyalar: ${exportDir}`);
    console.log('   - SpearGirl.glb (Mızrak Kız)');
    console.log('   - HammerGirl.glb (Çekiç Kız)');
    console.log('\n💡 Blender\'da: File > Import > glTF 2.0 (.glb/.gltf)');
  } catch (error) {
    console.error('❌ Hata:', error);
    process.exit(1);
  }
}

main();