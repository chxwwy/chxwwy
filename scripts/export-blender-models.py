import bpy
import json
import sys
from pathlib import Path

parts = {
    "spearHood": "Sphere.009",
    "spearCape": "Cylinder.010",
    "spearChain": "Torus.004",
    "hammerHood": "Sphere.017",
    "hammerCrownRing": "Torus.008",
    "hammerCrownOrnament": "Cone.012",
}

def three_axes(vector):
    return tuple(round(v, 6) for v in (vector.x, vector.z, -vector.y))

def export_part(obj):
    mesh = obj.data
    mesh.calc_loop_triangles()
    transform = obj.matrix_local
    normal_transform = transform.to_3x3().inverted().transposed()
    positions, normals, indices = [], [], []
    vertices = {}
    for triangle in mesh.loop_triangles:
        for corner in triangle.loops:
            vertex = mesh.loops[corner].vertex_index
            normal = three_axes((normal_transform @ mesh.corner_normals[corner].vector).normalized())
            key = (vertex, normal)
            if key not in vertices:
                vertices[key] = len(vertices)
                positions.extend(three_axes(transform @ mesh.vertices[vertex].co))
                normals.extend(normal)
            indices.append(vertices[key])
    assert indices and max(indices) * 3 < len(positions)
    return dict(positions=positions, normals=normals, indices=indices)

def offsets(obj):
    return three_axes(obj.matrix_local.translation)

spear = bpy.data.objects["M\u0131zrak"]
data = {part: export_part(bpy.data.objects[name]) for part, name in parts.items()}
data["spearFeetY"] = [offsets(bpy.data.objects[name])[1] for name in ("Sphere", "Sphere.001")]
data["spearGripPosition"] = offsets(spear)
data["spearGripDirection"] = three_axes(spear.matrix_local.to_3x3().col[2].normalized())
Path(sys.argv[-1]).write_text(json.dumps(data, separators=(",", ":"), indent=None) + "\n", encoding="utf8")
