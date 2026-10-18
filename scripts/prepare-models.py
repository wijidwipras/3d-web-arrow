"""Prepare supplied GLBs for the viewer. Run with Python 3; no extra packages."""
import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

def prepare(source, output, bow):
    data = (ROOT / 'docs' / source).read_bytes()
    json_size = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20 + json_size])
    binary = bytearray(data[28 + json_size:])
    primitive = doc['meshes'][0]['primitives'][0]
    position = doc['accessors'][primitive['attributes']['POSITION']]
    if bow:
        scale = 1.76 / (position['max'][2] - position['min'][2])
        # Raw bow is along Z with the string on -X. Rotate into the viewer's XY plane.
        matrix = [-scale,0,0,0, 0,0,scale,0, 0,scale,0,0, 0,.95,0,1]
        view = doc['bufferViews'][position['bufferView']]
        offset = view.get('byteOffset', 0) + position.get('byteOffset', 0)
        stride = view.get('byteStride', 12)
        points = [struct.unpack_from('<fff', binary, offset + i * stride) for i in range(position['count'])]
        accessor = doc['accessors'][primitive['indices']]
        view = doc['bufferViews'][accessor['bufferView']]
        offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        code = {5123:'H', 5125:'I'}[accessor['componentType']]
        indices = struct.unpack_from('<' + code * accessor['count'], binary, offset)
        kept = []
        removed = 0
        for i in range(0, len(indices), 3):
            triangle = indices[i:i+3]
            # The source's central string is a thin, separate strip around raw X=0.
            if all(abs(points[v][0]) < .02 for v in triangle):
                removed += 1
            else:
                kept.extend(triangle)
        assert removed == 288, 'Source mesh changed; inspect the string before preparing.'
        while len(binary) % 4: binary.append(0)
        start = len(binary)
        binary.extend(struct.pack('<' + code * len(kept), *kept))
        doc['bufferViews'].append({'buffer':0,'byteOffset':start,'byteLength':len(binary)-start,'target':34963})
        accessor.update(bufferView=len(doc['bufferViews'])-1, byteOffset=0, count=len(kept), min=[min(kept)], max=[max(kept)])
        print('Bow rig:', 'centerX', -(position['min'][0]+position['max'][0])/2*scale,
              'stringY', .95-2.184235*scale, .95+2.184533*scale)
    else:
        scale = 1 / (position['max'][1] - position['min'][1])
        matrix = [scale,0,0,0, 0,scale,0,0, 0,0,scale,0, 0,0,0,1]
    # Discard exporter presentation transforms; preserve mesh, materials and embedded textures.
    doc['nodes'] = [{'mesh':0,'name':'RustBow' if bow else 'Arrow','matrix':matrix}]
    doc['scenes'] = [{'nodes':[0]}]
    doc['scene'] = 0
    while len(binary) % 4: binary.append(0)
    doc['buffers'][0]['byteLength'] = len(binary)
    encoded = json.dumps(doc, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    result = struct.pack('<III', 0x46546c67, 2, 28+len(encoded)+len(binary))
    result += struct.pack('<II',len(encoded),0x4e4f534a)+encoded
    result += struct.pack('<II',len(binary),0x004e4942)+binary
    (ROOT / 'public' / 'models' / output).write_bytes(result)

prepare('rust_bow_-_genshin_impact.glb','rust-bow.glb',True)
prepare('arrow.glb','arrow.glb',False)
