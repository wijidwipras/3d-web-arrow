"""Create a small, self-contained glTF 2.0 arrow for the MVP demo."""
import json
import math
import struct
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "public/models/anak-panah.glb"


def triangle(a, b, c):
    ux, uy, uz = (b[i] - a[i] for i in range(3))
    vx, vy, vz = (c[i] - a[i] for i in range(3))
    nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
    length = math.sqrt(nx * nx + ny * ny + nz * nz) or 1
    n = (nx / length, ny / length, nz / length)
    return [(a, n), (b, n), (c, n)]


def cylinder(radius, bottom, top, segments=16):
    result = []
    for i in range(segments):
        a = 2 * math.pi * i / segments
        b = 2 * math.pi * (i + 1) / segments
        p = (radius * math.cos(a), bottom, radius * math.sin(a))
        q = (radius * math.cos(b), bottom, radius * math.sin(b))
        r = (radius * math.cos(a), top, radius * math.sin(a))
        s = (radius * math.cos(b), top, radius * math.sin(b))
        result += triangle(p, q, r) + triangle(q, s, r)
        result += triangle((0, bottom, 0), q, p)
        result += triangle((0, top, 0), r, s)
    return result


def cone(radius, bottom, top, segments=16):
    result = []
    tip = (0, top, 0)
    for i in range(segments):
        a = 2 * math.pi * i / segments
        b = 2 * math.pi * (i + 1) / segments
        p = (radius * math.cos(a), bottom, radius * math.sin(a))
        q = (radius * math.cos(b), bottom, radius * math.sin(b))
        result += triangle(p, q, tip)
        result += triangle((0, bottom, 0), q, p)
    return result


def feather(angle):
    dx, dz = math.cos(angle), math.sin(angle)
    def point(distance, y):
        return (dx * distance, y, dz * distance)
    a, b, c, d = point(.035, -.72), point(.22, -.87), point(.22, -1.19), point(.035, -1.30)
    return triangle(a, b, c) + triangle(a, c, d) + triangle(c, b, a) + triangle(d, c, a)


meshes = [
    ("Shaft", cylinder(.038, -1.35, 1.18), 0),
    ("Grip", cylinder(.051, -.13, .24), 1),
    ("Arrowhead", cone(.17, 1.06, 1.68), 2),
    ("Tip collar", cylinder(.09, 1.04, 1.16), 1),
    ("Nock", cylinder(.065, -1.43, -1.35), 2),
]
meshes += [(f"Fletching {i+1}", feather(i * 2 * math.pi / 3), 3) for i in range(3)]

blob = bytearray()
views, accessors, gltf_meshes, nodes = [], [], [], []
for name, vertices, material in meshes:
    positions = [coord for p, _ in vertices for coord in p]
    normals = [coord for _, n in vertices for coord in n]
    attributes = {}
    for semantic, data in (("POSITION", positions), ("NORMAL", normals)):
        while len(blob) % 4: blob.append(0)
        offset = len(blob)
        blob.extend(struct.pack("<" + "f" * len(data), *data))
        view_index = len(views)
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data) * 4, "target": 34962})
        accessor = {"bufferView": view_index, "componentType": 5126, "count": len(vertices), "type": "VEC3"}
        if semantic == "POSITION":
            accessor["min"] = [min(positions[i::3]) for i in range(3)]
            accessor["max"] = [max(positions[i::3]) for i in range(3)]
        attributes[semantic] = len(accessors)
        accessors.append(accessor)
    gltf_meshes.append({"name": name, "primitives": [{"attributes": attributes, "material": material, "mode": 4}]})
    nodes.append({"name": name, "mesh": len(gltf_meshes) - 1})

gltf = {
    "asset": {"version": "2.0", "generator": "Gesture 3D Viewer demo asset"},
    "scene": 0, "scenes": [{"nodes": list(range(len(nodes)))}], "nodes": nodes,
    "meshes": gltf_meshes, "buffers": [{"byteLength": len(blob)}],
    "bufferViews": views, "accessors": accessors,
    "materials": [
        {"name": "Dark steel", "pbrMetallicRoughness": {"baseColorFactor": [.17, .30, .38, 1], "metallicFactor": .8, "roughnessFactor": .28}, "doubleSided": True},
        {"name": "Cyan grip", "pbrMetallicRoughness": {"baseColorFactor": [.18, .76, .79, 1], "metallicFactor": .45, "roughnessFactor": .26}, "doubleSided": True},
        {"name": "Ice crystal", "pbrMetallicRoughness": {"baseColorFactor": [.55, .91, .98, 1], "metallicFactor": .42, "roughnessFactor": .16}, "doubleSided": True},
        {"name": "Cyan fletching", "pbrMetallicRoughness": {"baseColorFactor": [.12, .67, .76, 1], "metallicFactor": .18, "roughnessFactor": .32}, "doubleSided": True},
    ],
}

json_chunk = json.dumps(gltf, separators=(",", ":")).encode()
json_chunk += b" " * ((-len(json_chunk)) % 4)
blob.extend(b"\x00" * ((-len(blob)) % 4))
total = 12 + 8 + len(json_chunk) + 8 + len(blob)
OUT.parent.mkdir(parents=True, exist_ok=True)
with OUT.open("wb") as file:
    file.write(struct.pack("<4sII", b"glTF", 2, total))
    file.write(struct.pack("<I4s", len(json_chunk), b"JSON"))
    file.write(json_chunk)
    file.write(struct.pack("<I4s", len(blob), b"BIN\x00"))
    file.write(blob)
print(OUT)
