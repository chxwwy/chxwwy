import * as THREE from 'three';

/** Reversible unlit view: retain textures and transparency while removing stylized shading. */
export class ShadingController {
  enabled = true;
  private fog: THREE.Scene['fog'];
  private shadows: boolean;
  private originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private outlines = new Map<THREE.Object3D, boolean>();
  private flatCache = new Map<THREE.Material, THREE.MeshBasicMaterial>();

  constructor(private scene: THREE.Scene, private renderer: THREE.WebGLRenderer) {
    this.fog = scene.fog;
    this.shadows = renderer.shadowMap.enabled;
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) {
      this.scene.fog = this.fog;
      this.renderer.shadowMap.enabled = this.shadows;
      this.renderer.shadowMap.needsUpdate = true;
      for (const [mesh, material] of this.originals) mesh.material = material;
      for (const [outline, visible] of this.outlines) outline.visible = visible;
      this.originals.clear();
      this.outlines.clear();
    } else {
      this.fog = this.scene.fog;
      this.shadows = this.renderer.shadowMap.enabled;
      this.scene.fog = null;
      this.renderer.shadowMap.enabled = false;
      this.update();
    }
    return this.enabled;
  }

  private flat(material: THREE.Material) {
    if (material instanceof THREE.MeshBasicMaterial) return material;
    let flat = this.flatCache.get(material);
    if (!flat) {
      const source = material as THREE.MeshStandardMaterial;
      flat = new THREE.MeshBasicMaterial({
        name: `${material.name || material.type}_Unlit`,
        color: source.color?.clone() ?? new THREE.Color(0xffffff),
        map: source.map ?? null,
        alphaMap: source.alphaMap ?? null,
        vertexColors: material.vertexColors,
        transparent: material.transparent,
        opacity: material.opacity,
        side: material.side,
        alphaTest: material.alphaTest,
        depthWrite: material.depthWrite,
        depthTest: material.depthTest,
        blending: material.blending,
        polygonOffset: material.polygonOffset,
        polygonOffsetFactor: material.polygonOffsetFactor,
        polygonOffsetUnits: material.polygonOffsetUnits,
        wireframe: source.wireframe ?? false,
        fog: false,
        toneMapped: false,
      });
      this.flatCache.set(material, flat);
    }
    return flat;
  }

  update() {
    if (this.enabled) return;
    // Also handles meshes created during combat without changing gameplay visibility.
    this.scene.traverse(object => {
      if (object.userData.outline) {
        if (!this.outlines.has(object)) this.outlines.set(object, object.visible);
        object.visible = false;
        return;
      }
      if (!(object instanceof THREE.Mesh) || this.originals.has(object)) return;
      const material = object.material;
      if (Array.isArray(material) ? material.every(m => m instanceof THREE.MeshBasicMaterial) : material instanceof THREE.MeshBasicMaterial) return;
      this.originals.set(object, material);
      object.material = Array.isArray(material) ? material.map(m => this.flat(m)) : this.flat(material);
    });
  }

  dispose() {
    if (!this.enabled) this.toggle();
    for (const material of this.flatCache.values()) material.dispose();
    this.flatCache.clear();
  }
}
