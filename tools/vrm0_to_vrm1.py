#!/usr/bin/env python3
"""Convert a VRM 0.x avatar's metadata/humanoid/expressions to VRM 1.0.

This keeps the original glTF geometry, skeleton, textures and materials. It is
used for the two VRoid sample avatars shipped with this project.
"""
import json
import struct
import sys


def read_glb(path):
    data = open(path, 'rb').read()
    magic, version, length = struct.unpack_from('<III', data, 0)
    if magic != 0x46546C67:
        raise ValueError('not a GLB')
    offset = 12
    chunks = []
    while offset < length:
        chunk_len, chunk_type = struct.unpack_from('<II', data, offset)
        chunk_data = data[offset + 8:offset + 8 + chunk_len]
        chunks.append((chunk_type, chunk_data))
        offset += 8 + chunk_len
    js = json.loads(chunks[0][1].decode('utf-8').rstrip('\x00 '))
    binary = b''
    for t, c in chunks[1:]:
        if t == 0x004E4942:
            binary = c
    return js, binary


def write_glb(path, js, binary):
    js_data = json.dumps(js, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    js_data += b' ' * ((4 - len(js_data) % 4) % 4)
    bin_data = binary + b'\x00' * ((4 - len(binary) % 4) % 4)
    total = 12 + 8 + len(js_data) + (8 + len(bin_data) if bin_data else 0)
    out = bytearray()
    out += struct.pack('<III', 0x46546C67, 2, total)
    out += struct.pack('<II', len(js_data), 0x4E4F534A) + js_data
    if bin_data:
        out += struct.pack('<II', len(bin_data), 0x004E4942) + bin_data
    open(path, 'wb').write(out)


def convert(src, dst, display_name, authors):
    js, binary = read_glb(src)
    vrm0 = js['extensions'].get('VRM')
    if not vrm0:
        raise ValueError('VRM 0.x extension not found')
    if 'VRMC_vrm' in js['extensions']:
        raise ValueError('already VRM 1.0')

    mesh_to_node = {}
    for ni, node in enumerate(js.get('nodes', [])):
        if 'mesh' in node:
            mesh_to_node[node['mesh']] = ni

    human_bones = {}
    for bone in vrm0['humanoid']['humanBones']:
        human_bones[bone['bone']] = {'node': bone['node']}

    expressions = {}
    preset_map = {
        'Blink': 'blink',
        'Blink_L': 'blinkLeft',
        'Blink_R': 'blinkRight',
        'Angry': 'angry',
        'Fun': 'relaxed',
        'Joy': 'happy',
        'Sorrow': 'sad',
        'Surprised': 'surprised',
        'A': 'aa',
        'I': 'ih',
        'U': 'ou',
        'E': 'ee',
        'O': 'oh',
    }
    for group in vrm0.get('blendShapeMaster', {}).get('blendShapeGroups', []):
        preset = preset_map.get(group.get('name'))
        if not preset:
            continue
        binds = []
        for bind in group.get('binds', []):
            node = mesh_to_node.get(bind.get('mesh'))
            if node is None:
                continue
            binds.append({
                'node': node,
                'index': bind.get('index', 0),
                'weight': bind.get('weight', 100) / 100.0,
            })
        if binds:
            expressions[preset] = {
                'preset': preset,
                'binds': binds,
            }

    meta0 = vrm0.get('meta', {})
    thumbnail = meta0.get('texture')
    vrmc = {
        'specVersion': '1.0',
        'meta': {
            'name': display_name,
            'version': '1.0',
            'authors': authors,
            'copyrightInformation': 'VRoid sample avatar, modified for this game.',
            'contactInformation': meta0.get('contactInformation', ''),
            'references': ['https://vroid.pixiv.help/hc/en-us/articles/4402394424089'],
            'thirdPartyLicenses': meta0.get('otherLicenseUrl', ''),
            'thumbnailImage': thumbnail if isinstance(thumbnail, int) else None,
            'licenseUrl': 'https://vrm.dev/licenses/1.0/',
            'avatarPermission': 'everyone',
            'allowExcessivelyViolentUsage': False,
            'allowExcessivelySexualUsage': False,
            'allowPoliticalOrReligiousUsage': False,
            'allowAntisocialOrHateUsage': False,
            'commercialUsage': 'personalNonProfit',
            'creditNotation': 'required',
            'allowRedistribution': True,
            'modification': 'allowModificationRedistribution',
        },
        'humanoid': {
            'humanBones': human_bones,
        },
        'expressions': expressions,
    }
    # Remove null thumbnail if it was not present.
    if vrmc['meta']['thumbnailImage'] is None:
        del vrmc['meta']['thumbnailImage']

    js['extensions']['VRMC_vrm'] = vrmc
    del js['extensions']['VRM']
    used = [e for e in js.get('extensionsUsed', []) if e != 'VRM']
    if 'VRMC_vrm' not in used:
        used.append('VRMC_vrm')
    js['extensionsUsed'] = used
    # Give materials readable names for runtime cel-shading rules.
    for i, material in enumerate(js.get('materials', [])):
        if not material.get('name'):
            material['name'] = f'Material_{i}'
        original = material.get('extensions', {}).get('VRM', {})
        if original.get('name'):
            material['name'] = original['name']
    # Ensure opaque / cutout flags survive.
    for i, material in enumerate(js.get('materials', [])):
        if material.get('alphaMode') == 'MASK':
            material['alphaMode'] = 'MASK'
            material.setdefault('alphaCutoff', 0.45)
        # Remove unlit so the PBR fallback is visible before we retint it.
        ext = material.get('extensions', {})
        ext.pop('KHR_materials_unlit', None)
        if not ext:
            material.pop('extensions', None)
        if material.get('extensions', {}).get('VRM'):
            del material['extensions']['VRM']

    write_glb(dst, js, binary)
    print(f'{dst}: {display_name}, {len(human_bones)} bones, {len(expressions)} expressions')


if __name__ == '__main__':
    convert(
        sys.argv[1], sys.argv[2],
        sys.argv[3] if len(sys.argv) > 3 else 'Companion',
        sys.argv[4].split(',') if len(sys.argv) > 4 else ['VRoid'],
    )
