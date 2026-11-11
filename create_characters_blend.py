import bpy
import bmesh
import json
import math
from mathutils import Vector, Matrix, Euler, Quaternion
from pathlib import Path

# =============================================================================
# KONFIGÜRASYON
# =============================================================================
BLEND_OUTPUT = Path(bpy.path.abspath("//")) / "Soulslike_Karakterler.blend"

# Renk paleti (game ile birebir aynı)
COLORS = {
    "skin": (0.965, 0.824, 0.769, 1.0),      # 0xf6d2c4
    "skin_hammer": (0.965, 0.816, 0.761, 1.0), # 0xf6d0c2
    "white": (0.961, 0.949, 0.918, 1.0),     # 0xf5f2ea
    "cream": (0.945, 0.922, 0.859, 1.0),     # 0xf1ebdb
    "gray": (0.604, 0.612, 0.643, 1.0),      # 0x9a9ca4
    "light_gray": (0.843, 0.847, 0.859, 1.0),# 0xd7d8db
    "dark_gray": (0.553, 0.553, 0.584, 1.0), # 0x8d8f97
    "gold": (0.863, 0.682, 0.235, 1.0),      # 0xdcae3c
    "gold_emissive": (0.227, 0.157, 0.0, 1.0), # 0x3a2800
    "hair": (0.804, 0.718, 0.592, 1.0),      # 0xcdb797
    "black": (0.110, 0.110, 0.133, 1.0),     # 0x1c1c22
    "silver": (0.914, 0.929, 0.957, 1.0),    # 0xe9edf4
    "silver_emissive": (0.133, 0.165, 0.2, 1.0), # 0x222a33
    "wood": (0.541, 0.369, 0.235, 1.0),      # 0x8a5e3c
    "dark_wood": (0.353, 0.235, 0.157, 1.0), # 0x5a3c28
    "burlap": (0.824, 0.682, 0.447, 1.0),    # 0xd2ae72
    "rope": (0.604, 0.455, 0.251, 1.0),      # 0x9a7440
    "red": (0.820, 0.271, 0.231, 1.0),       # 0xd1453b
    "white_dummy": (0.965, 0.937, 0.878, 1.0),# 0xf6efe0
    "scarlet": (0.608, 0.149, 0.220, 1.0),   # 0x9b2638
    "armor": (0.776, 0.627, 0.357, 1.0),     # 0xc6a05b
    "dark_armor": (0.224, 0.192, 0.212, 1.0),# 0x393136
    "red_hair": (0.667, 0.243, 0.212, 1.0),  # 0xaa3e36
    "cloth": (0.898, 0.824, 0.698, 1.0),     # 0xe5d2b2
    "hammer_gold": (0.863, 0.706, 0.243, 1.0),# 0xdcb43e
    "hammer_gold_emissive": (0.290, 0.212, 0.0, 1.0), # 0x4a3600
    "hammer_dark": (0.725, 0.545, 0.161, 1.0), # 0xb98b29
    "hammer_dark_emissive": (0.165, 0.110, 0.0, 1.0), # 0x2a1c00
    "glove": (0.973, 0.965, 0.941, 1.0),     # 0xf8f6f0
    "wrap": (0.561, 0.569, 0.596, 1.0),      # 0x8f9198
}

# Toon shader gradient (4-stop)
TOON_RAMP = [(0.0, (0.333, 0.333, 0.333, 1.0)),
             (0.333, (0.549, 0.549, 0.549, 1.0)),
             (0.667, (0.804, 0.804, 0.804, 1.0)),
             (1.0, (1.0, 1.0, 1.0, 1.0))]

# =============================================================================
# YARDIMCI FONKSİYONLAR
# =============================================================================
def new_collection(name, parent=None):
    coll = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(coll)
    return coll

def new_object(name, mesh, collection):
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj

def set_active(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)

def deselect_all():
    bpy.ops.object.select_all(action='DESELECT')

def apply_transform(obj, location=True, rotation=True, scale=True):
    bpy.ops.object.transform_apply(location=location, rotation=rotation, scale=scale)

def shade_smooth(obj, angle=30):
    for mod in obj.modifiers:
        if mod.type == 'BEVEL':
            return
    bpy.ops.object.shade_smooth()
    obj.data.use_auto_smooth = True
    obj.data.auto_smooth_angle = math.radians(angle)

# --- Materyal ---
def create_toon_material(name, base_color, emissive=None, outline_thickness=0.01, double_sided=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    # Output
    out = nodes.new('ShaderNodeOutputMaterial')
    out.location = (600, 0)

    # Toon BSDF (Cycles) / Principled BSDF workaround for EEVEE
    # Blender 4.2'de Toon BSDF yok, node group yapacağız
    # Basit: Emission + ColorRamp (toon ramp) + Mix
    # Ama EEVEE için Outline ayrı pass gerekiyor -> Freestyle veya Geometry node outline
    # Burada EEVEE + Freestyle outline kullanacağız, materyal basit Diffuse

    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.location = (0, 0)
    bsdf.inputs['Base Color'].default_value = base_color
    bsdf.inputs['Roughness'].default_value = 0.9
    bsdf.inputs['Specular'].default_value = 0.0
    if emissive:
        bsdf.inputs['Emission Color'].default_value = (*emissive[:3], 1.0)
        bsdf.inputs['Emission Strength'].default_value = 1.0

    # ColorRamp for toon shading (lighting baked into material via node setup)
    # Actually for EEVEE we'll use a custom node group that does toon shading
    # But simplest: just use Principled with flat shading, rely on Freestyle for outline
    # For proper toon: create a node group "ToonShader" once

    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])

    # Settings
    mat.blend_method = 'OPAQUE'
    mat.shadow_method = 'OPAQUE'
    if double_sided:
        mat.use_backface_culling = False

    # Custom property for outline thickness (used by export script)
    mat["outline_thickness"] = outline_thickness
    mat["is_toon"] = True

    return mat

def create_outline_material(name, color=(0.227, 0.149, 0.149, 1.0), thickness=0.01):
    """Inverted hull outline material (for solidify modifier approach)"""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    out = nodes.new('ShaderNodeOutputMaterial')
    out.location = (300, 0)

    emission = nodes.new('ShaderNodeEmission')
    emission.location = (0, 0)
    emission.inputs['Color'].default_value = color
    emission.inputs['Strength'].default_value = 1.0

    links.new(emission.outputs['Emission'], out.inputs['Surface'])

    mat.blend_method = 'OPAQUE'
    mat.shadow_method = 'OPAQUE'
    mat.use_backface_culling = True  # Backface culling for inverted hull
    mat["is_outline"] = True
    return mat

def ensure_toon_node_group():
    """Create reusable toon shader node group"""
    if "ToonShader" in bpy.data.node_groups:
        return bpy.data.node_groups["ToonShader"]

    ng = bpy.data.node_groups.new("ToonShader", 'ShaderNodeTree')
    # Inputs
    ng.interface.new_socket("Base Color", in_out='INPUT', socket_type='NodeSocketColor')
    ng.interface.new_socket("Emission Color", in_out='INPUT', socket_type='NodeSocketColor')
    ng.interface.new_socket("Emission Strength", in_out='INPUT', socket_type='NodeSocketFloat')
    ng.interface.new_socket("Ramp", in_out='INPUT', socket_type='NodeSocketColor')  # 4-stop gradient texture
    # Output
    ng.interface.new_socket("BSDF", in_out='OUTPUT', socket_type='NodeSocketShader')

    nodes = ng.nodes
    links = ng.links

    inp = nodes.new('NodeGroupInput')
    inp.location = (-600, 0)
    out = nodes.new('NodeGroupOutput')
    out.location = (600, 0)

    # Diffuse ramp: Lighting -> Dot(N, L) -> ColorRamp -> Color
    # But in EEVEE we can't easily access light vector in shader nodes without OSL
    # Simpler: Use Diffuse BSDF + ColorRamp on shadow
    # Actually for stylized look, we'll use a simple setup:
    # Principled BSDF with custom lighting via nodes is complex.
    # Instead: Use a pre-baked approach - flat colors, rely on Freestyle for lines
    # For this script, we'll keep materials simple and use Freestyle for outline.

    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.location = (0, 0)
    links.new(inp.outputs['Base Color'], bsdf.inputs['Base Color'])
    links.new(inp.outputs['Emission Color'], bsdf.inputs['Emission Color'])
    links.new(inp.outputs['Emission Strength'], bsdf.inputs['Emission Strength'])
    bsdf.inputs['Roughness'].default_value = 0.9
    bsdf.inputs['Specular'].default_value = 0.0

    links.new(bsdf.outputs['BSDF'], out.inputs['BSDF'])

    return ng

def mat_with_nodegroup(name, base_color, emissive=None, emission_strength=0.0):
    ng = ensure_toon_node_group()
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    out = nodes.new('ShaderNodeOutputMaterial')
    out.location = (300, 0)

    group = nodes.new('ShaderNodeGroup')
    group.location = (0, 0)
    group.node_tree = ng
    group.inputs['Base Color'].default_value = base_color
    if emissive:
        group.inputs['Emission Color'].default_value = (*emissive[:3], 1.0)
        group.inputs['Emission Strength'].default_value = emission_strength
    else:
        group.inputs['Emission Strength'].default_value = 0.0

    links.new(group.outputs['BSDF'], out.inputs['Surface'])
    return mat

# --- Mesh helpers ---
def create_capsule_geometry(radius, height, cap_segments=4, radial_segments=10):
    """Returns a mesh for a capsule (cylinder with hemispherical ends)"""
    # Use bmesh to create
    bm = bmesh.new()
    # Bottom hemisphere
    bmesh.ops.create_uvsphere(bm, u_segments=radial_segments, v_segments=cap_segments//2, radius=radius,
                               matrix=Matrix.Translation((0, 0, -height/2 + radius)))
    # Cylinder
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=True, segments=radial_segments,
                           radius1=radius, radius2=radius, depth=height - 2*radius,
                           matrix=Matrix.Translation((0, 0, -height/2 + radius)))
    # Top hemisphere (already covered by cone cap_ends)
    mesh = bpy.data.meshes.new("Capsule")
    bm.to_mesh(mesh)
    bm.free()
    return mesh

def create_lathe_geometry(points, segments=36):
    """Lathe a 2D profile (list of (r, y)) around Y axis"""
    bm = bmesh.new()
    verts = []
    for r, y in points:
        verts.append(bm.verts.new((r, 0, y)))
    # Spin
    bmesh.ops.spin(bm, geom=verts, steps=segments, axis=(0, 1, 0), cent=(0, 0, 0), angle=2*math.pi)
    mesh = bpy.data.meshes.new("Lathe")
    bm.to_mesh(mesh)
    bm.free()
    return mesh

def add_outline_modifier(obj, thickness=0.01, mat_idx=0):
    """Add Solidify modifier for inverted hull outline"""
    mod = obj.modifiers.new(name="Outline", type='SOLIDIFY')
    mod.thickness = thickness
    mod.offset = 0
    mod.use_even_offset = True
    mod.use_quality_normals = True
    mod.material_offset = mat_idx
    mod.material_offset_rim = mat_idx
    return mod

# =============================================================================
# MATERYAL OLUŞTUR
# =============================================================================
print("Creating materials...")

# Toon materials
mats = {}
def tm(name, color_key, emissive=None, outline=0.011, double=False):
    m = create_toon_material(name, COLORS[color_key], emissive=COLORS.get(emissive) if emissive else None,
                              outline_thickness=outline, double_sided=double)
    mats[name] = m
    return m

# Spear Girl
mats["SG_Skin"] = tm("SG_Skin", "skin", "gold_emissive", 0.012)
mats["SG_White"] = tm("SG_White", "white", outline=0.01)
mats["SG_Gray"] = tm("SG_Gray", "gray", outline=0.008, double=True)
mats["SG_LightGray"] = tm("SG_LightGray", "light_gray", outline=0.01, double=True)
mats["SG_Gold"] = tm("SG_Gold", "gold", "gold_emissive", 0.008)
mats["SG_Hair"] = tm("SG_Hair", "hair", outline=0.01)
mats["SG_Black"] = tm("SG_Black", "black", outline=0.007)
mats["SG_Silver"] = tm("SG_Silver", "silver", "silver_emissive", 0.007)
mats["SG_Wrap"] = tm("SG_Wrap", "wrap", outline=0.005)
mats["SG_DarkWood"] = tm("SG_DarkWood", "dark_wood", outline=0.018)

# Hammer Girl
mats["HG_Cream"] = tm("HG_Cream", "cream", outline=0.012, double=True)
mats["HG_Skin"] = tm("HG_Skin", "skin_hammer", outline=0.012)
mats["HG_Glove"] = tm("HG_Glove", "glove", outline=0.008)
mats["HG_Gold"] = tm("HG_Gold", "gold", "gold_emissive", 0.005)
mats["HG_HGold"] = tm("HG_HGold", "hammer_gold", "hammer_gold_emissive", 0.01)
mats["HG_HDark"] = tm("HG_HDark", "hammer_dark", "hammer_dark_emissive", 0.006)

# Dummy
mats["DM_Wood"] = tm("DM_Wood", "wood", outline=0.014)
mats["DM_DarkWood"] = tm("DM_DarkWood", "dark_wood", outline=0.018)
mats["DM_Burlap"] = tm("DM_Burlap", "burlap", outline=0.016)
mats["DM_Rope"] = tm("DM_Rope", "rope", outline=0.006)
mats["DM_Red"] = tm("DM_Red", "red", outline=0.0)
mats["DM_White"] = tm("DM_White", "white_dummy", outline=0.0)

# Boss
mats["BS_Skin"] = tm("BS_Skin", "skin", outline=0.009)
mats["BS_Dark"] = tm("BS_Dark", "dark_armor", outline=0.009)
mats["BS_RedHair"] = tm("BS_RedHair", "red_hair", outline=0.009)
mats["BS_Cloth"] = tm("BS_Cloth", "cloth", outline=0.009, double=True)
mats["BS_Scarlet"] = tm("BS_Scarlet", "scarlet", outline=0.009)
mats["BS_Armor"] = tm("BS_Armor", "armor", outline=0.009)

# Outline material (shared)
outline_mat = create_outline_material("Outline_Standard", (0.227, 0.149, 0.149, 1.0), 0.011)

# =============================================================================
# ARMATURE / RIG OLUŞTURMA
# =============================================================================
def create_armature(name, bones_data, collection):
    """bones_data: list of (name, head, tail, parent_name, roll)"""
    arm = bpy.data.armatures.new(name + "_Arm")
    obj = new_object(name + "_Armature", arm, collection)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')

    bone_map = {}
    for bn, head, tail, parent_name, roll in bones_data:
        bone = arm.edit_bones.new(bn)
        bone.head = head
        bone.tail = tail
        bone.roll = roll
        if parent_name and parent_name in bone_map:
            bone.parent = bone_map[parent_name]
            bone.use_connect = False
        bone_map[bn] = bone

    bpy.ops.object.mode_set(mode='OBJECT')
    return obj, arm, bone_map

def add_vertex_groups_from_bones(mesh_obj, armature_obj, bone_names):
    """Create vertex groups matching bone names"""
    for bn in bone_names:
        mesh_obj.vertex_groups.new(name=bn)

def assign_auto_weights(mesh_obj, armature_obj):
    """Parent with automatic weights"""
    deselect_all()
    mesh_obj.select_set(True)
    armature_obj.select_set(True)
    bpy.context.view_layer.objects.active = armature_obj
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')

# =============================================================================
# SPEAR GIRL (MIZRAK KIZ)
# =============================================================================
print("Building Spear Girl...")

coll_sg = new_collection("SpearGirl")
coll_sg_geo = new_collection("Geometry", coll_sg)
coll_sg_rig = new_collection("Rig", coll_sg)

# --- Armature ---
# Bone hierarchy: Root -> Hips -> Spine -> Chest -> Neck -> Head
# Arms: Clavicle -> UpperArm -> Forearm -> Hand
# Legs: Thigh -> Shin -> Foot
sg_bones = [
    ("Root",       Vector((0, 0, 0)),       Vector((0, 0.1, 0)),      None,       0),
    ("Hips",       Vector((0, 0.1, 0)),    Vector((0, 0.9, 0)),      "Root",     0),
    ("Spine",      Vector((0, 0.9, 0)),    Vector((0, 1.3, 0)),      "Hips",     0),
    ("Chest",      Vector((0, 1.3, 0)),    Vector((0, 1.6, 0)),      "Spine",    0),
    ("Neck",       Vector((0, 1.6, 0)),    Vector((0, 1.8, 0)),      "Chest",    0),
    ("Head",       Vector((0, 1.8, 0)),    Vector((0, 2.1, 0)),      "Neck",     0),
    # Left leg
    ("Thigh_L",    Vector((-0.1, 0.9, 0)), Vector((-0.1, 0.2, 0)),   "Hips",     0),
    ("Shin_L",     Vector((-0.1, 0.2, 0)), Vector((-0.1, -0.5, 0)),  "Thigh_L",  0),
    ("Foot_L",     Vector((-0.1, -0.5, 0)),Vector((-0.1, -0.6, 0.05)),"Shin_L",  0),
    # Right leg
    ("Thigh_R",    Vector((0.1, 0.9, 0)),  Vector((0.1, 0.2, 0)),    "Hips",     0),
    ("Shin_R",     Vector((0.1, 0.2, 0)),  Vector((0.1, -0.5, 0)),   "Thigh_R",  0),
    ("Foot_R",     Vector((0.1, -0.5, 0)), Vector((0.1, -0.6, 0.05)), "Shin_R",  0),
    # Left arm
    ("Clavicle_L", Vector((-0.2, 1.55, 0)),Vector((-0.35, 1.55, 0)), "Chest",    0),
    ("UpperArm_L", Vector((-0.35, 1.55, 0)),Vector((-0.35, 1.0, 0)), "Clavicle_L",0),
    ("Forearm_L",  Vector((-0.35, 1.0, 0)), Vector((-0.35, 0.5, 0)), "UpperArm_L",0),
    ("Hand_L",     Vector((-0.35, 0.5, 0)), Vector((-0.35, 0.3, 0)), "Forearm_L", 0),
    # Right arm
    ("Clavicle_R", Vector((0.2, 1.55, 0)), Vector((0.35, 1.55, 0)),  "Chest",    0),
    ("UpperArm_R", Vector((0.35, 1.55, 0)), Vector((0.35, 1.0, 0)),  "Clavicle_R",0),
    ("Forearm_R",  Vector((0.35, 1.0, 0)),  Vector((0.35, 0.5, 0)),  "UpperArm_R",0),
    ("Hand_R",     Vector((0.35, 0.5, 0)),  Vector((0.35, 0.3, 0)),  "Forearm_R", 0),
    # Spear
    ("Spear_Root", Vector((0, 0, 0)),      Vector((0, 0, 0)),        "Hand_R",   0),
]

sg_arm_obj, sg_arm, sg_bone_map = create_armature("Mızrak", sg_bones, coll_sg_rig)
sg_arm_obj.show_in_front = True

# --- Geometry Construction ---
# We'll build the character mesh in parts, parent to armature with auto weights

def build_spear_girl():
    parts = []

    # Legs
    for side, x, name_suffix in [(-1, -0.1, "L"), (1, 0.1, "R")]:
        # Thigh
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=10,
                               radius1=0.07, radius2=0.07, depth=0.5,
                               matrix=Matrix.Translation((x, 0.82-0.25, 0)))
        # Shin
        bmesh.ops.create_cone(bm, cap_ends=True, segments=10,
                               radius1=0.06, radius2=0.055, depth=0.5,
                               matrix=Matrix.Translation((x, 0.82-0.75, 0)))
        # Foot
        bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=10, radius=0.09,
                                   matrix=Matrix.Translation((x, 0.82-1.02, 0.05)) @
                                   Matrix.Scale(0.85, 4, Vector((1, 0.5, 1.5))))
        # Ankle ring
        bmesh.ops.create_torus(bm, u_segments=6, v_segments=16,
                                major_radius=0.075, minor_radius=0.012,
                                matrix=Matrix.Translation((x, 0.82-0.62, 0)) @
                                Matrix.Rotation(math.pi/2, 4, 'X'))

        mesh = bpy.data.meshes.new(f"Leg_{name_suffix}")
        bm.to_mesh(mesh)
        bm.free()
        obj = new_object(f"Leg_{name_suffix}", mesh, coll_sg_geo)
        obj.data.materials.append(mats["SG_Skin"])
        # Outline
        obj.data.materials.append(outline_mat)
        add_outline_modifier(obj, 0.008, 1)
        parts.append(obj)

    # Skirt (pleated)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=30,
                           radius1=0.3, radius2=0.47, depth=0.68,
                           matrix=Matrix.Translation((0, 0.66+0.34, 0)))
    # Add pleats via vertex displacement
    for v in bm.verts:
        a = math.atan2(v.co.z, v.co.x)
        y_rel = (v.co.y - 0.66 - 0.34) / 0.68
        f = 1 + 0.045 * math.sin(a * 15) * (1 if y_rel < 0.5 else 0.4)
        v.co.x *= f
        v.co.z *= f
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("Skirt")
    bm.to_mesh(mesh)
    bm.free()
    skirt_obj = new_object("Skirt", mesh, coll_sg_geo)
    skirt_obj.data.materials.append(mats["SG_LightGray"])
    skirt_obj.data.materials.append(outline_mat)
    add_outline_modifier(skirt_obj, 0.01, 1)
    parts.append(skirt_obj)

    # Skirt hem
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=30,
                           radius1=0.463, radius2=0.476, depth=0.07,
                           matrix=Matrix.Translation((0, 0.36+0.035, 0)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("SkirtHem")
    bm.to_mesh(mesh)
    bm.free()
    hem_obj = new_object("SkirtHem", mesh, coll_sg_geo)
    hem_obj.data.materials.append(mats["SG_LightGray"])
    hem_obj.data.materials.append(outline_mat)
    add_outline_modifier(hem_obj, 0, 1)
    parts.append(hem_obj)

    # Torso
    bm = bmesh.new()
    # Waist
    bmesh.ops.create_torus(bm, u_segments=8, v_segments=28,
                            major_radius=0.255, minor_radius=0.05,
                            matrix=Matrix.Translation((0, 1.03, 0)) @
                            Matrix.Rotation(math.pi/2, 4, 'X'))
    # Torso cylinder
    bmesh.ops.create_cone(bm, cap_ends=True, segments=22,
                           radius1=0.185, radius2=0.215, depth=0.52,
                           matrix=Matrix.Translation((0, 1.26, 0)))
    # Neck
    bmesh.ops.create_cone(bm, cap_ends=True, segments=10,
                           radius1=0.055, radius2=0.06, depth=0.12,
                           matrix=Matrix.Translation((0, 1.56, 0)))
    # Scarf
    bmesh.ops.create_torus(bm, u_segments=10, v_segments=24,
                            major_radius=0.165, minor_radius=0.07,
                            matrix=Matrix.Translation((0, 1.53, 0)) @
                            Matrix.Rotation(math.pi/2, 4, 'X'))
    # Drape
    bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=10, radius=0.15,
                               matrix=Matrix.Translation((0, 1.45, 0.13)) @
                               Matrix.Scale(1.15, 4, Vector((1, 0.8, 0.55))))
    mesh = bpy.data.meshes.new("Torso")
    bm.to_mesh(mesh)
    bm.free()
    torso_obj = new_object("Torso", mesh, coll_sg_geo)
    torso_obj.data.materials.append(mats["SG_White"])
    torso_obj.data.materials.append(mats["SG_Gray"])  # scarf
    torso_obj.data.materials.append(outline_mat)
    add_outline_modifier(torso_obj, 0.01, 2)
    parts.append(torso_obj)

    # Medals
    medal_data = [
        (-0.085, 1.34, 0.19, 0.03, 0), (0.09, 1.36, 0.188, 0.034, 1),
        (0, 1.26, 0.2, 0.03, 0), (-0.11, 1.16, 0.2, 0.032, 1),
        (0.11, 1.17, 0.2, 0.03, 0), (0, 1.07, 0.21, 0.03, 1),
    ]
    for i, (x, y, z, r, mat_idx) in enumerate(medal_data):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=14,
                               radius1=r, radius2=r, depth=0.012,
                               matrix=Matrix.Translation((x, y, z)) @
                               Matrix.Rotation(math.pi/2, 4, 'X'))
        mesh = bpy.data.meshes.new(f"Medal_{i}")
        bm.to_mesh(mesh)
        bm.free()
        obj = new_object(f"Medal_{i}", mesh, coll_sg_geo)
        obj.data.materials.append(mats["SG_Gold"] if mat_idx % 2 == 0 else mats["SG_DarkWood"])
        obj.data.materials.append(outline_mat)
        add_outline_modifier(obj, 0.004, 1)
        parts.append(obj)

    # Chain
    bm = bmesh.new()
    # Simple torus chain
    for j in range(8):
        ang = j * math.pi / 4
        bmesh.ops.create_torus(bm, u_segments=6, v_segments=12,
                                major_radius=0.04, minor_radius=0.015,
                                matrix=Matrix.Translation((math.sin(ang)*0.12, 1.45, math.cos(ang)*0.12)) @
                                Matrix.Rotation(ang, 4, 'Z') @
                                Matrix.Rotation(math.pi/2, 4, 'X'))
    mesh = bpy.data.meshes.new("Chain")
    bm.to_mesh(mesh)
    bm.free()
    chain_obj = new_object("Chain", mesh, coll_sg_geo)
    chain_obj.data.materials.append(mats["SG_Gray"])
    parts.append(chain_obj)

    # Shoulder pads
    for side, x in [(-1, -0.225), (1, 0.225)]:
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=10, radius=0.085,
                                   matrix=Matrix.Translation((x, 1.45, 0)))
        mesh = bpy.data.meshes.new(f"ShoulderPad_{side}")
        bm.to_mesh(mesh)
        bm.free()
        obj = new_object(f"ShoulderPad_{side}", mesh, coll_sg_geo)
        obj.data.materials.append(mats["SG_White"])
        obj.data.materials.append(outline_mat)
        add_outline_modifier(obj, 0.008, 1)
        parts.append(obj)

    # Cape
    bm = bmesh.new()
    # Simple plane with subdivision
    bmesh.ops.create_grid(bm, x_segments=10, y_segments=10, size=0.6,
                           matrix=Matrix.Translation((0, 1.52, 0)) @
                           Matrix.Rotation(-0.16, 4, 'X'))
    # Displace for cape shape
    for v in bm.verts:
        v.co.z += -0.08 * (1 - abs(v.co.x)/0.3) * (1 - v.co.y/0.6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("Cape")
    bm.to_mesh(mesh)
    bm.free()
    cape_obj = new_object("Cape", mesh, coll_sg_geo)
    cape_obj.data.materials.append(mats["SG_Gray"])
    cape_obj.data.materials.append(outline_mat)
    add_outline_modifier(cape_obj, 0.008, 1)
    parts.append(cape_obj)

    # Arms (Upper + Lower + Hand)
    for side, x, suffix in [(-1, -0.235, "L"), (1, 0.235, "R")]:
        # Upper arm
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=10,
                               radius1=0.072, radius2=0.072, depth=0.3,
                               matrix=Matrix.Translation((x, 1.45, 0)) @
                               Matrix.Rotation(math.pi/2, 4, 'X'))
        # Lower arm
        bmesh.ops.create_cone(bm, cap_ends=True, segments=10,
                               radius1=0.058, radius2=0.058, depth=0.29,
                               matrix=Matrix.Translation((x, 1.45-0.3, 0)) @
                               Matrix.Rotation(math.pi/2, 4, 'X'))
        # Wrist wrap
        bmesh.ops.create_cone(bm, cap_ends=True, segments=12,
                               radius1=0.066, radius2=0.07, depth=0.09,
                               matrix=Matrix.Translation((x, 1.45-0.3-0.29+0.075, 0)) @
                               Matrix.Rotation(math.pi/2, 4, 'X'))
        mesh = bpy.data.meshes.new(f"Arm_{suffix}")
        bm.to_mesh(mesh)
        bm.free()
        obj = new_object(f"Arm_{suffix}", mesh, coll_sg_geo)
        obj.data.materials.append(mats["SG_White"])
        obj.data.materials.append(mats["SG_Wrap"])
        obj.data.materials.append(outline_mat)
        add_outline_modifier(obj, 0.008, 2)
        parts.append(obj)

    # Head
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=24, radius=0.3,
                               matrix=Matrix.Translation((0, 1.8, 0)))
    mesh = bpy.data.meshes.new("Head")
    bm.to_mesh(mesh)
    bm.free()
    head_obj = new_object("Head", mesh, coll_sg_geo)
    head_obj.data.materials.append(mats["SG_Skin"])
    head_obj.data.materials.append(outline_mat)
    add_outline_modifier(head_obj, 0.012, 1)
    parts.append(head_obj)

    # Hair
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=20, radius=0.316,
                               matrix=Matrix.Translation((0, 1.8, 0)))
    # Cut bottom
    for v in list(bm.verts):
        if v.co.y < 1.8 - 0.316 * 1.12:
            bm.verts.remove(v)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("Hair")
    bm.to_mesh(mesh)
    bm.free()
    hair_obj = new_object("Hair", mesh, coll_sg_geo)
    hair_obj.data.materials.append(mats["SG_Hair"])
    hair_obj.data.materials.append(outline_mat)
    add_outline_modifier(hair_obj, 0.01, 1)
    parts.append(hair_obj)

    # Side locks
    for side, x in [(-1, -0.285), (1, 0.285)]:
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=8,
                               radius1=0.04, radius2=0.02, depth=0.2,
                               matrix=Matrix.Translation((x, 1.7, 0.06)) @
                               Matrix.Rotation(math.pi/2, 4, 'X'))
        mesh = bpy.data.meshes.new(f"Lock_{side}")
        bm.to_mesh(mesh)
        bm.free()
        obj = new_object(f"Lock_{side}", mesh, coll_sg_geo)
        obj.data.materials.append(mats["SG_Hair"])
        obj.data.materials.append(outline_mat)
        add_outline_modifier(obj, 0.006, 1)
        parts.append(obj)

    # Veil (hood)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=18, radius=0.32,
                               matrix=Matrix.Translation((0, 1.8, 0)))
    # Keep only top/back
    for v in list(bm.verts):
        if v.co.y > 1.8 + 0.05 or v.co.z > 0.05:
            pass
        else:
            bm.verts.remove(v)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("Veil")
    bm.to_mesh(mesh)
    bm.free()
    veil_obj = new_object("Veil", mesh, coll_sg_geo)
    veil_obj.data.materials.append(mats["SG_Gray"])
    veil_obj.data.materials.append(outline_mat)
    add_outline_modifier(veil_obj, 0.01, 1)
    parts.append(veil_obj)

    # Strands
    strand_cfg = [
        (-0.3, -0.02, 0.02, 0.78, 0.17, -1),
        (0.3, -0.02, 0.02, 0.78, 0.17, 1),
        (0, -0.02, -0.3, 1.0, 0.4, 0),
    ]
    for i, (x, y, z, length, width, side) in enumerate(strand_cfg):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=8,
                               radius1=width, radius2=width*0.3, depth=length,
                               matrix=Matrix.Translation((x, 1.8+y, z)) @
                               Matrix.Rotation(-0.2, 4, 'X'))
        mesh = bpy.data.meshes.new(f"Strand_{i}")
        bm.to_mesh(mesh)
        bm.free()
        obj = new_object(f"Strand_{i}", mesh, coll_sg_geo)
        obj.data.materials.append(mats["SG_Gray"])
        obj.data.materials.append(outline_mat)
        add_outline_modifier(obj, 0.007, 1)
        parts.append(obj)

    # Headband
    bm = bmesh.new()
    bmesh.ops.create_torus(bm, u_segments=8, v_segments=40,
                            major_radius=0.327, minor_radius=0.018,
                            matrix=Matrix.Translation((0, 1.96, 0)) @
                            Matrix.Rotation(math.pi/2 - 0.05, 4, 'X'))
    mesh = bpy.data.meshes.new("Headband")
    bm.to_mesh(mesh)
    bm.free()
    hb_obj = new_object("Headband", mesh, coll_sg_geo)
    hb_obj.data.materials.append(mats["SG_Gold"])
    hb_obj.data.materials.append(outline_mat)
    add_outline_modifier(hb_obj, 0.005, 1)
    parts.append(hb_obj)

    # Tab + Gem
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=12,
                           radius1=0.05, radius2=0.025, depth=0.17,
                           matrix=Matrix.Translation((0, 2.0, 0.325)) @
                           Matrix.Rotation(-0.25, 4, 'X'))
    mesh = bpy.data.meshes.new("Tab")
    bm.to_mesh(mesh)
    bm.free()
    tab_obj = new_object("Tab", mesh, coll_sg_geo)
    tab_obj.data.materials.append(mats["SG_Gold"])
    tab_obj.data.materials.append(outline_mat)
    add_outline_modifier(tab_obj, 0.005, 1)
    parts.append(tab_obj)

    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=8, radius=0.03,
                               matrix=Matrix.Translation((0, 2.075, 0.33)))
    mesh = bpy.data.meshes.new("Gem")
    bm.to_mesh(mesh)
    bm.free()
    gem_obj = new_object("Gem", mesh, coll_sg_geo)
    gem_obj.data.materials.append(mats["SG_Silver"])
    parts.append(gem_obj)

    # Spear (Mızrak) - named "Mızrak" for export script
    bm = bmesh.new()
    # Shaft
    bmesh.ops.create_cone(bm, cap_ends=True, segments=10,
                           radius1=0.028, radius2=0.028, depth=1.9,
                           matrix=Matrix.Translation((0, 0.1+0.95, 0)) @
                           Matrix.Rotation(math.pi/2, 4, 'X'))
    # Butt
    bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=8, radius=0.036,
                               matrix=Matrix.Translation((0, 0.1-0.85, 0)))
    # Rings
    for y in [0.05, 0.42]:
        bmesh.ops.create_cone(bm, cap_ends=True, segments=10,
                               radius1=0.04, radius2=0.04, depth=0.07,
                               matrix=Matrix.Translation((0, 0.1+y, 0)) @
                               Matrix.Rotation(math.pi/2, 4, 'X'))
    # Collar
    bmesh.ops.create_cone(bm, cap_ends=True, segments=10,
                           radius1=0.052, radius2=0.052, depth=0.1,
                           matrix=Matrix.Translation((0, 0.1+0.88, 0)) @
                           Matrix.Rotation(math.pi/2, 4, 'X'))
    # Socket
    bmesh.ops.create_cone(bm, cap_ends=True, segments=6,
                           radius1=0.075, radius2=0.03, depth=0.22,
                           matrix=Matrix.Translation((0, 0.1+1.0, 0)) @
                           Matrix.Rotation(math.pi/2, 4, 'X'))
    # Guard
    bmesh.ops.create_cone(bm, cap_ends=False, segments=4,
                           radius1=0.33, radius2=0.33, depth=0.045,
                           matrix=Matrix.Translation((0, 0.1+0.78, 0)) @
                           Matrix.Rotation(math.pi/2, 4, 'X'))
    # Guard ornaments
    for s in [-1, 1]:
        bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.04,
                                   matrix=Matrix.Translation((s*0.34, 0.1+0.78, 0)))
    # Blade (cone)
    bmesh.ops.create_cone(bm, cap_ends=True, segments=4,
                           radius1=0.068, radius2=0.0, depth=0.46,
                           matrix=Matrix.Translation((0, 0.1+1.32, 0)) @
                           Matrix.Rotation(math.pi/2, 4, 'X') @
                           Matrix.Rotation(math.pi/4, 4, 'Z') @
                           Matrix.Scale(0.4, 4, Vector((0, 0, 1))))
    mesh = bpy.data.meshes.new("Mızrak")
    bm.to_mesh(mesh)
    bm.free()
    spear_obj = new_object("Mızrak", mesh, coll_sg_geo)
    spear_obj.data.materials.append(mats["SG_Black"])
    spear_obj.data.materials.append(mats["SG_Gold"])
    spear_obj.data.materials.append(mats["SG_Silver"])
    spear_obj.data.materials.append(outline_mat)
    add_outline_modifier(spear_obj, 0.007, 3)
    parts.append(spear_obj)

    # Parent all to armature with auto weights
    for obj in parts:
        assign_auto_weights(obj, sg_arm_obj)

    # Spear parent to Hand_R bone
    spear_obj.parent = sg_arm_obj
    spear_obj.parent_type = 'BONE'
    spear_obj.parent_bone = "Hand_R"
    # Reset spear local transform
    spear_obj.matrix_parent_inverse = sg_arm_obj.pose.bones["Hand_R"].matrix.inverted()

    # Face texture setup (UV + material slots for face swap)
    setup_face_textures(head_obj, "SpearGirl")

    return parts

def setup_face_textures(head_obj, prefix):
    """Add UV map and material slots for face textures (normal/happy/hit)"""
    # Ensure UV map exists
    if not head_obj.data.uv_layers:
        head_obj.data.uv_layers.new(name="FaceUV")
    uv_layer = head_obj.data.uv_layers.active
    # Simple planar projection for face area
    for poly in head_obj.data.polygons:
        center = poly.center
        if center.y > 1.7 and center.y < 2.1 and abs(center.z) < 0.2:  # face area
            for loop_idx in poly.loop_indices:
                loop = head_obj.data.loops[loop_idx]
                v = head_obj.data.vertices[loop.vertex_index].co
                uv_layer.data[loop_idx].uv = (0.5 + v.x/0.6, 0.5 + v.z/0.6)

    # Add face material slots (will be swapped at runtime)
    # We create 3 materials with image texture nodes
    for face_name in ["normal", "happy", "hit"]:
        mat = bpy.data.materials.new(f"{prefix}_Face_{face_name}")
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        nodes.clear()
        out = nodes.new('ShaderNodeOutputMaterial')
        out.location = (300, 0)
        bsdf = nodes.new('ShaderNodeBsdfPrincipled')
        bsdf.location = (0, 0)
        bsdf.inputs['Base Color'].default_value = (1,1,1,1)
        bsdf.inputs['Roughness'].default_value = 0.9
        bsdf.inputs['Specular'].default_value = 0.0
        # Image texture node (placeholder - user adds texture)
        tex = nodes.new('ShaderNodeTexImage')
        tex.location = (-300, 0)
        tex.label = f"Face_{face_name}"
        links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
        mat.blend_method = 'CLIP'
        mat.shadow_method = 'CLIP'
        head_obj.data.materials.append(mat)

# Build Spear Girl
sg_parts = build_spear_girl()
print(f"Spear Girl: {len(sg_parts)} parts created")

# =============================================================================
# HAMMER GIRL (ÇEKİÇ KIZ)
# =============================================================================
print("Building Hammer Girl...")

coll_hg = new_collection("HammerGirl")
coll_hg_geo = new_collection("Geometry", coll_hg)
coll_hg_rig = new_collection("Rig", coll_hg)

# Armature
hg_bones = [
    ("Root",       Vector((0, 0, 0)),       Vector((0, 0.1, 0)),      None,       0),
    ("Hips",       Vector((0, 0.1, 0)),    Vector((0, 0.85, 0)),     "Root",     0),
    ("Spine",      Vector((0, 0.85, 0)),   Vector((0, 1.2, 0)),      "Hips",     0),
    ("Chest",      Vector((0, 1.2, 0)),    Vector((0, 1.5, 0)),      "Spine",    0),
    ("Neck",       Vector((0, 1.5, 0)),    Vector((0, 1.7, 0)),      "Chest",    0),
    ("Head",       Vector((0, 1.7, 0)),    Vector((0, 2.0, 0)),      "Neck",     0),
    # Left leg
    ("Thigh_L",    Vector((0.3, 0.85, 0)), Vector((0.3, 0.2, 0)),    "Hips",     0),
    ("Shin_L",     Vector((0.3, 0.2, 0)),  Vector((0.3, -0.3, 0)),   "Thigh_L",  0),
    ("Foot_L",     Vector((0.3, -0.3, 0)), Vector((0.3, -0.4, 0.58)),"Shin_L",  0),
    # Right leg
    ("Thigh_R",    Vector((-0.3, 0.85, 0)),Vector((-0.3, 0.2, 0)),   "Hips",     0),
    ("Shin_R",     Vector((-0.3, 0.2, 0)), Vector((-0.3, -0.3, 0)),  "Thigh_R",  0),
    ("Foot_R",     Vector((-0.3, -0.3, 0)),Vector((-0.3, -0.4, 0.58)),"Shin_R",  0),
    # Left arm
    ("Clavicle_L", Vector((0.25, 1.1, 0)), Vector((0.45, 1.1, 0)),   "Chest",    0),
    ("UpperArm_L", Vector((0.45, 1.1, 0)), Vector((0.45, 0.6, 0)),   "Clavicle_L",0),
    ("Forearm_L",  Vector((0.45, 0.6, 0)), Vector((0.45, 0.1, 0)),   "UpperArm_L",0),
    ("Hand_L",     Vector((0.45, 0.1, 0)), Vector((0.45, -0.1, 0)),  "Forearm_L", 0),
    # Right arm
    ("Clavicle_R", Vector((-0.25, 1.1, 0)),Vector((-0.45, 1.1, 0)),  "Chest",    0),
    ("UpperArm_R", Vector((-0.45, 1.1, 0)),Vector((-0.45, 0.6, 0)),  "Clavicle_R",0),
    ("Forearm_R",  Vector((-0.45, 0.6, 0)),Vector((-0.45, 0.1, 0)),  "UpperArm_R",0),
    ("Hand_R",     Vector((-0.45, 0.1, 0)),Vector((-0.45, -0.1, 0)),  "Forearm_R", 0),
    # Hammer
    ("Hammer_Root",Vector((0, 0, 0)),      Vector((0, 0, 0)),        "Hand_R",   0),
]

hg_arm_obj, hg_arm, hg_bone_map = create_armature("ÇekiçKız", hg_bones, coll_hg_rig)
hg_arm_obj.show_in_front = True

def build_hammer_girl():
    parts = []

    # Robe (Lathe)
    pts = [
        (0.84, 0), (0.82, 0.08), (0.72, 0.36), (0.53, 0.66),
        (0.37, 0.9), (0.27, 1.08), (0.2, 1.2)
    ]
    bm = bmesh.new()
    verts = [bm.verts.new((r, 0, y)) for r, y in pts]
    bmesh.ops.spin(bm, geom=verts, steps=36, axis=(0, 1, 0), cent=(0, 0, 0), angle=2*math.pi)
    # Add wrinkles
    for v in bm.verts:
        a = math.atan2(v.co.z, v.co.x)
        y_rel = v.co.y / 1.2
        f = 1 + 0.04 * math.sin(a * 13) * (1 - y_rel)
        v.co.x *= f
        v.co.z *= f
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("Robe")
    bm.to_mesh(mesh)
    bm.free()
    robe_obj = new_object("Robe", mesh, coll_hg_geo)
    robe_obj.data.materials.append(mats["HG_Cream"])
    robe_obj.data.materials.append(outline_mat)
    add_outline_modifier(robe_obj, 0.012, 1)
    parts.append(robe_obj)

    # Feet
    for side, x, name in [(0.3, 0.3, "L"), (-0.3, -0.3, "R")]:
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=10, radius=0.12,
                                   matrix=Matrix.Translation((x, 0.06, 0.58)) @
                                   Matrix.Scale(0.9, 4, Vector((1, 0.5, 1.5))))
        mesh = bpy.data.meshes.new(f"Foot_{name}")
        bm.to_mesh(mesh)
        bm.free()
        obj = new_object(f"Foot_{name}", mesh, coll_hg_geo)
        obj.data.materials.append(mats["HG_Skin"])
        obj.data.materials.append(outline_mat)
        add_outline_modifier(obj, 0.008, 1)
        parts.append(obj)

    # Shoulders
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=12, radius=0.25,
                               matrix=Matrix.Translation((0, 1.05, 0)) @
                               Matrix.Scale(1.1, 4, Vector((1, 0.85, 0.9))))
    mesh = bpy.data.meshes.new("Shoulders")
    bm.to_mesh(mesh)
    bm.free()
    sh_obj = new_object("Shoulders", mesh, coll_hg_geo)
    sh_obj.data.materials.append(mats["HG_Cream"])
    sh_obj.data.materials.append(outline_mat)
    add_outline_modifier(sh_obj, 0.01, 1)
    parts.append(sh_obj)

    # Arms
    for side, x, suffix in [(-1, -0.25, "L"), (1, 0.25, "R")]:
        bm = bmesh.new()
        # Upper arm
        bmesh.ops.create_cone(bm, cap_ends=True, segments=10,
                               radius1=0.09, radius2=0.09, depth=0.36,
                               matrix=Matrix.Translation((x, 1.11, 0)) @
                               Matrix.Rotation(math.pi/2, 4, 'X'))
        # Lower arm
        bmesh.ops.create_cone(bm, cap_ends=True, segments=10,
                               radius1=0.075, radius2=0.075, depth=0.34,
                               matrix=Matrix.Translation((x, 1.11-0.36, 0)) @
                               Matrix.Rotation(math.pi/2, 4, 'X'))
        mesh = bpy.data.meshes.new(f"Arm_{suffix}")
        bm.to_mesh(mesh)
        bm.free()
        obj = new_object(f"Arm_{suffix}", mesh, coll_hg_geo)
        obj.data.materials.append(mats["HG_Cream"])
        obj.data.materials.append(mats["HG_Glove"])
        obj.data.materials.append(outline_mat)
        add_outline_modifier(obj, 0.008, 2)
        parts.append(obj)

    # Head
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=24, radius=0.33,
                               matrix=Matrix.Translation((0, 1.45, 0)))
    mesh = bpy.data.meshes.new("Head")
    bm.to_mesh(mesh)
    bm.free()
    head_obj = new_object("Head", mesh, coll_hg_geo)
    head_obj.data.materials.append(mats["HG_Skin"])
    head_obj.data.materials.append(outline_mat)
    add_outline_modifier(head_obj, 0.012, 1)
    parts.append(head_obj)

    # Hood
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=18, radius=0.35,
                               matrix=Matrix.Translation((0, 1.45, 0)))
    for v in list(bm.verts):
        if v.co.y < 1.45 - 0.1:
            bm.verts.remove(v)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("Hood")
    bm.to_mesh(mesh)
    bm.free()
    hood_obj = new_object("Hood", mesh, coll_hg_geo)
    hood_obj.data.materials.append(mats["HG_Cream"])
    hood_obj.data.materials.append(outline_mat)
    add_outline_modifier(hood_obj, 0.012, 1)
    parts.append(hood_obj)

    # Hood edge
    bm = bmesh.new()
    bmesh.ops.create_torus(bm, u_segments=10, v_segments=30,
                            major_radius=0.285, minor_radius=0.045,
                            matrix=Matrix.Translation((0, 1.44, 0.235)) @
                            Matrix.Rotation(math.pi/2, 4, 'X') @
                            Matrix.Scale(1.18, 4, Vector((1, 0.85, 1))))
    mesh = bpy.data.meshes.new("HoodEdge")
    bm.to_mesh(mesh)
    bm.free()
    he_obj = new_object("HoodEdge", mesh, coll_hg_geo)
    he_obj.data.materials.append(mats["HG_Cream"])
    he_obj.data.materials.append(outline_mat)
    add_outline_modifier(he_obj, 0.008, 1)
    parts.append(he_obj)

    # Collar
    bm = bmesh.new()
    bmesh.ops.create_torus(bm, u_segments=10, v_segments=24,
                            major_radius=0.26, minor_radius=0.13,
                            matrix=Matrix.Translation((0, 1.15, 0)) @
                            Matrix.Rotation(math.pi/2, 4, 'X'))
    mesh = bpy.data.meshes.new("Collar")
    bm.to_mesh(mesh)
    bm.free()
    col_obj = new_object("Collar", mesh, coll_hg_geo)
    col_obj.data.materials.append(mats["HG_Cream"])
    col_obj.data.materials.append(outline_mat)
    add_outline_modifier(col_obj, 0.01, 1)
    parts.append(col_obj)

    # Crown
    crown_parts = []
    # Crown ring
    bm = bmesh.new()
    bmesh.ops.create_torus(bm, u_segments=12, v_segments=16,
                            major_radius=0.28, minor_radius=0.02,
                            matrix=Matrix.Translation((0, 1.87, 0)) @
                            Matrix.Rotation(math.pi/2, 4, 'X'))
    mesh = bpy.data.meshes.new("CrownRing")
    bm.to_mesh(mesh)
    bm.free()
    cr_obj = new_object("CrownRing", mesh, coll_hg_geo)
    cr_obj.data.materials.append(mats["HG_Gold"])
    cr_obj.data.materials.append(outline_mat)
    add_outline_modifier(cr_obj, 0.005, 1)
    crown_parts.append(cr_obj)

    # Crown ornament (cone)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=12,
                           radius1=0.04, radius2=0.0, depth=0.12,
                           matrix=Matrix.Translation((0, 1.95, 0)))
    mesh = bpy.data.meshes.new("CrownOrnament")
    bm.to_mesh(mesh)
    bm.free()
    co_obj = new_object("CrownOrnament", mesh, coll_hg_geo)
    co_obj.data.materials.append(mats["HG_Gold"])
    co_obj.data.materials.append(outline_mat)
    add_outline_modifier(co_obj, 0.005, 1)
    crown_parts.append(co_obj)

    for obj in crown_parts:
        assign_auto_weights(obj, hg_arm_obj)

    # Hammer
    bm = bmesh.new()
    # Shaft
    bmesh.ops.create_cone(bm, cap_ends=True, segments=10,
                           radius1=0.045, radius2=0.045, depth=2.4,
                           matrix=Matrix.Translation((0, 0.1+1.2, 0)) @
                           Matrix.Rotation(math.pi/2, 4, 'X'))
    # Bands
    for y in [-0.35, 0.35, 0.9]:
        bmesh.ops.create_cone(bm, cap_ends=True, segments=10,
                               radius1=0.06, radius2=0.06, depth=0.09,
                               matrix=Matrix.Translation((0, 0.1+y+1.2, 0)) @
                               Matrix.Rotation(math.pi/2, 4, 'X'))
    # Head group
    # Barrel
    bmesh.ops.create_cone(bm, cap_ends=True, segments=8,
                           radius1=0.5, radius2=0.5, depth=1.05,
                           matrix=Matrix.Translation((0, 0.1+1.72, 0)) @
                           Matrix.Rotation(math.pi/2, 4, 'X') @
                           Matrix.Rotation(math.pi/8, 4, 'Z'))
    # Side rings
    for s in [-1, 1]:
        bmesh.ops.create_torus(bm, u_segments=6, v_segments=8,
                                major_radius=0.5, minor_radius=0.055,
                                matrix=Matrix.Translation((s*0.4, 0.1+1.72, 0)) @
                                Matrix.Rotation(math.pi/2, 4, 'Y') @
                                Matrix.Rotation(math.pi/8, 4, 'Z'))
    # Top box
    bmesh.ops.create_cube(bm, size=1.0,
                           matrix=Matrix.Translation((0, 0.1+1.72+0.52, 0)) @
                           Matrix.Scale(0.7, 4, Vector((1, 0.34, 0.62))))
    # Ridges
    for s in [-1, 0, 1]:
        bmesh.ops.create_cube(bm, size=1.0,
                               matrix=Matrix.Translation((s*0.28, 0.1+1.72+0.52+0.17, 0)) @
                               Matrix.Scale(0.2, 4, Vector((1, 0.5, 0.8))))
    # Socket
    bmesh.ops.create_cone(bm, cap_ends=True, segments=8,
                           radius1=0.09, radius2=0.07, depth=0.3,
                           matrix=Matrix.Translation((0, 0.1+1.72-0.55, 0)) @
                           Matrix.Rotation(math.pi/2, 4, 'X'))

    mesh = bpy.data.meshes.new("Çekiç")
    bm.to_mesh(mesh)
    bm.free()
    hammer_obj = new_object("Çekiç", mesh, coll_hg_geo)
    hammer_obj.data.materials.append(mats["HG_HGold"])
    hammer_obj.data.materials.append(mats["HG_HDark"])
    hammer_obj.data.materials.append(outline_mat)
    add_outline_modifier(hammer_obj, 0.01, 2)
    parts.append(hammer_obj)

    # Parent all to armature
    for obj in parts:
        assign_auto_weights(obj, hg_arm_obj)

    # Hammer parent to Hand_R
    hammer_obj.parent = hg_arm_obj
    hammer_obj.parent_type = 'BONE'
    hammer_obj.parent_bone = "Hand_R"
    hammer_obj.matrix_parent_inverse = hg_arm_obj.pose.bones["Hand_R"].matrix.inverted()

    # Crown parent to Head
    for obj in crown_parts:
        obj.parent = hg_arm_obj
        obj.parent_type = 'BONE'
        obj.parent_bone = "Head"
        obj.matrix_parent_inverse = hg_arm_obj.pose.bones["Head"].matrix.inverted()

    # Face textures
    setup_face_textures(head_obj, "HammerGirl")

    return parts

hg_parts = build_hammer_girl()
print(f"Hammer Girl: {len(hg_parts)} parts created")

# =============================================================================
# POSITION CHARACTERS
# =============================================================================
# Spear Girl at (-1.2, 0, 0)
for obj in sg_parts:
    obj.location.x -= 1.2
sg_arm_obj.location.x -= 1.2

# Hammer Girl at (1.25, 0, 0.7)
for obj in hg_parts:
    obj.location.x += 1.25
    obj.location.z += 0.7
hg_arm_obj.location.x += 1.25
hg_arm_obj.location.z += 0.7

# =============================================================================
# FREESTYLE OUTLINE SETUP (for toon look in viewport/render)
# =============================================================================
print("Setting up Freestyle...")
scene = bpy.context.scene
scene.render.use_freestyle = True
scene.view_layers[0].use_freestyle = True

fl = scene.view_layers[0].freestyle_settings.linesets.new("Outline")
fl.select_by_visibility = True
fl.select_edge_mark = False
fl.select_silhouette = True
fl.select_creases = False
fl.select_border = False
fl.select_external_contours = True

# Line style
ls = bpy.data.linestyles.new("ToonOutline")
ls.color = (0.227, 0.149, 0.149)
ls.thickness = 1.5
fl.linestyle = ls

# =============================================================================
# RENDER SETTINGS
# =============================================================================
scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.eevee.taa_render_samples = 16
scene.eevee.use_ssr = True
scene.eevee.use_ssr_refraction = True

# =============================================================================
# SAVE .BLEND
# =============================================================================
print(f"Saving to {BLEND_OUTPUT}...")
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_OUTPUT))
print("Done!")

# =============================================================================
# EXPORT character-models.json (for game sync)
# =============================================================================
# This replicates export-blender-models.py logic
# Run this after saving if you want to update the game data