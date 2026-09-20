"""Bake and rig the owner's jev3d car for Gridbound; never modifies the source project."""
import sys, math, json
from pathlib import Path
import bpy, bmesh
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets/shinsei-source'
OUT = ROOT / 'public/cars/shinsei'
OUT.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(SOURCE / 'blender'))
import lib_car, lib_materials, lib_util

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
materials = lib_materials.build_all()
lib_car.build_car(materials)

# The close chase camera exposes the presentation model's floating edge rivets
# (their X offset points outside the endplates) and tiny bright chip cubes.
# Keep a clean aero silhouette, with dedicated PBR finishes rather than packing
# these large, near-camera surfaces into the whole-car weathering atlas.
for name in ('wing_main_chips', 'wing_endplate_left_chips', 'wing_endplate_right_chips',
             'wing_endplate_left_rivets', 'wing_endplate_right_rivets'):
    obj = bpy.data.objects.get(name)
    if obj:
        bpy.data.objects.remove(obj, do_unlink=True)

def wing_material(name, color, roughness, metallic):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    surface = material.node_tree.nodes.get('Principled BSDF')
    surface.inputs['Base Color'].default_value = (*color, 1)
    surface.inputs['Roughness'].default_value = roughness
    surface.inputs['Metallic'].default_value = metallic
    surface.inputs['Coat Weight'].default_value = .15
    surface.inputs['Coat Roughness'].default_value = .35
    return material

wing_paint = wing_material('Shinsei_WingPaint', (.30, .012, .020), .48, .12)
wing_graphite = wing_material('Shinsei_WingGraphite', (.035, .040, .045), .65, .05)
wing_worn = materials['crimson'].copy()
wing_worn.name = 'Shinsei_WingWornCrimsonSource'
for name in ('wing_main', 'wing_flap', 'wing_beam', 'wing_endplate_left', 'wing_endplate_right'):
    obj = bpy.data.objects[name]
    obj.data.materials.clear()
    obj.data.materials.append(wing_worn if name == 'wing_flap' else wing_graphite if name == 'wing_beam' else wing_paint)
    obj['game_surface'] = True

# The presentation model has a solid tub underneath its smoked canopy. Cut a
# cockpit well for the playable driver's view without changing the silhouette.
bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=1, depth=1.4, location=(.05, 0, .96))
cutter = bpy.context.object; cutter.name = 'game_cockpit_cut'
cutter.scale = (.72, .325, 1)
lib_util.cut(bpy.data.objects['tub'], cutter)
verts = [( .05 + .711 * math.cos(i * math.tau / 64), .316 * math.sin(i * math.tau / 64), z)
    for z in (.268, .642) for i in range(64)]
faces = [tuple(range(64))] + [(i, i+64, (i+1)%64+64, (i+1)%64) for i in range(64)]
mesh = bpy.data.meshes.new('game_cockpit_well'); mesh.from_pydata(verts, [], faces); mesh.update()
well = bpy.data.objects.new('game_cockpit_well', mesh); bpy.context.collection.objects.link(well)
well.data.materials.append(materials['black'])
lib_util.tag(well, 'cockpit', 'interior', 'matte black')
column = lib_util.tube('game_steering_column', (.77, 0, .55), (.53, 0, .69), .025)
lib_util.set_mat(column, materials['graphite'])
# The authoring source remains intact. Strip render-only lights from the game.
for o in list(bpy.context.scene.objects):
    if o.type == 'LIGHT':
        bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'shinsei-nd01.blend'))

wheel_names = {'wheel_front_left': 'fl', 'wheel_front_right': 'fr',
               'wheel_rear_left': 'rl', 'wheel_rear_right': 'rr'}
def semantic(o):
    if o.name in ('wiper', 'wiper2'): return 'wipers'
    if o.get('part') in wheel_names:
        return wheel_names[o['part']]
    if o.name == 'wing_flap': return 'flap'
    if o.name in ('helmet', 'seat', 'dashboard_glow'): return 'interior'
    return 'body'

# Convert modifiers once, retaining one vertex group per animated component.
opaque, other = [], []
for o in list(bpy.context.scene.objects):
    if o.type not in ('MESH', 'CURVE') or o.hide_render: continue
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    role = semantic(o)
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    group = o.vertex_groups.new(name=role)
    group.add(list(range(len(o.data.vertices))), 1, 'REPLACE')
    for slot in o.material_slots:
        if slot.material is None: slot.material = materials['black']
    mat = o.data.materials[0]
    if o.get('game_surface') or mat.name.startswith('decal_') or o.get('role') in ('canopy', 'brake_light', 'status_light', 'headlamp', 'underglow') or 'emitter' in mat.get('finish', ''):
        other.append(o)
    else:
        opaque.append(o)

bpy.ops.object.select_all(action='DESELECT')
for o in opaque: o.select_set(True)
bpy.context.view_layer.objects.active = opaque[0]
bpy.ops.object.join()
atlas = bpy.context.object
atlas.name = 'BakeAtlas'
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.05, island_margin=.0025)
bpy.ops.object.mode_set(mode='OBJECT')
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 4
scene.cycles.device = 'CPU'
scene.render.bake.margin = 4
scene.render.bake.use_clear = True

# Bake the Blender graph, rather than losing its grime/chips/droplets on export.
def bake_graphs(materials):
    graphs = []
    for mat in materials:
        nt = mat.node_tree
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        output = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
        target = nt.nodes.new('ShaderNodeTexImage')
        nt.nodes.active = target
        emission = nt.nodes.new('ShaderNodeEmission')
        graphs.append((nt, bsdf, output, target, emission))
    return graphs

graphs = bake_graphs(atlas.data.materials)

def bake(channel, size, color_space, prefix='shinsei'):
    image = bpy.data.images.new(prefix + '_' + channel, width=size, height=size)
    image.colorspace_settings.name = color_space
    for nt, bsdf, output, target, emission in graphs:
        target.image = image
        nt.nodes.active = target
        for link in list(output.inputs['Surface'].links): nt.links.remove(link)
        if channel == 'normal':
            nt.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
            continue
        for link in list(emission.inputs['Color'].links): nt.links.remove(link)
        if channel == 'color':
            source = bsdf.inputs['Base Color']
            if source.is_linked: nt.links.new(source.links[0].from_socket, emission.inputs['Color'])
            else: emission.inputs['Color'].default_value = source.default_value
        else:
            combine = nt.nodes.new('ShaderNodeCombineColor')
            combine.inputs['Red'].default_value = 1
            for label, prop in [('Green', 'Roughness'), ('Blue', 'Metallic')]:
                source = bsdf.inputs[prop]
                if source.is_linked: nt.links.new(source.links[0].from_socket, combine.inputs[label])
                else: combine.inputs[label].default_value = source.default_value
            nt.links.new(combine.outputs[0], emission.inputs['Color'])
        nt.links.new(emission.outputs[0], output.inputs['Surface'])
    bpy.ops.object.bake(type='NORMAL' if channel == 'normal' else 'EMIT')
    image.filepath_raw = str(SOURCE / (prefix + '_' + channel + '.png'))
    image.file_format = 'PNG'
    image.save()
    print('BAKED', channel, flush=True)
    return image

color = bake('color', 2048, 'sRGB')
orm = bake('orm', 1024, 'Non-Color')
normal = bake('normal', 2048, 'Non-Color')
mat = bpy.data.materials.new('Shinsei_BakedBody')
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes.get('Principled BSDF')
for image, socket in [(color, 'Base Color')]:
    texture = nt.nodes.new('ShaderNodeTexImage'); texture.image = image
    nt.links.new(texture.outputs['Color'], bsdf.inputs[socket])
texture = nt.nodes.new('ShaderNodeTexImage'); texture.image = orm
separate = nt.nodes.new('ShaderNodeSeparateColor')
nt.links.new(texture.outputs['Color'], separate.inputs[0])
nt.links.new(separate.outputs['Green'], bsdf.inputs['Roughness'])
nt.links.new(separate.outputs['Blue'], bsdf.inputs['Metallic'])
texture = nt.nodes.new('ShaderNodeTexImage'); texture.image = normal
bump = nt.nodes.new('ShaderNodeNormalMap')
nt.links.new(texture.outputs['Color'], bump.inputs['Color'])
nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
bsdf.inputs['Coat Weight'].default_value = .28
bsdf.inputs['Coat Roughness'].default_value = .25

# Give the top flap the body's aged crimson paint, with its own texture budget
# so grime and scratches remain sharp in the close camera. Keep surface relief
# subtle by using geometric normals rather than the noisy whole-car normal map.
flap = bpy.data.objects['wing_flap']
bpy.ops.object.select_all(action='DESELECT')
flap.select_set(True)
bpy.context.view_layer.objects.active = flap
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.05, island_margin=.015)
bpy.ops.object.mode_set(mode='OBJECT')
graphs = bake_graphs(flap.data.materials)
flap_color = bake('color', 1024, 'sRGB', 'shinsei_wing')
flap_finish = wing_material('Shinsei_WingWornCrimson', (1, 1, 1), .55, .12)
texture = flap_finish.node_tree.nodes.new('ShaderNodeTexImage')
texture.image = flap_color
flap_finish.node_tree.links.new(texture.outputs['Color'], flap_finish.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
flap.data.materials.clear()
flap.data.materials.append(flap_finish)

# Split the atlas back into rigid game parts without changing any baked UVs.
parts = []
for group in list(atlas.vertex_groups):
    o = atlas.copy(); o.data = atlas.data.copy()
    bpy.context.collection.objects.link(o)
    bm = bmesh.new(); bm.from_mesh(o.data)
    deform = bm.verts.layers.deform.active
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v[deform].get(group.index, 0) < .5], context='VERTS')
    bm.to_mesh(o.data); bm.free()
    o.data.materials.clear(); o.data.materials.append(mat)
    for p in o.data.polygons: p.material_index = 0
    o.name = 'Shinsei_' + group.name
    o.vertex_groups.clear()
    parts.append(o)
bpy.data.objects.remove(atlas, do_unlink=True)

# Keep brake emitters independent of other red lamps; merge static details by material.
buckets = {}
for o in other:
    role = 'brakes' if o.get('role') == 'brake_light' else 'glass' if o.get('role') == 'canopy' else semantic(o)
    buckets.setdefault((role, o.data.materials[0].name), []).append(o)
for (role, material), objects in buckets.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects: o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1: bpy.ops.object.join()
    o = bpy.context.object
    o.name = 'Shinsei_flap' if role == 'flap' else 'Shinsei_' + role + '_' + material
    o.vertex_groups.clear()
    parts.append(o)

# Original +X-forward/+Y-left becomes Blender -Y-forward/+X-left for Y-up glTF.
rotation = Matrix.Rotation(-math.pi / 2, 4, 'Z')
for o in parts:
    o.data.transform(rotation)
    o.matrix_world = Matrix.Identity(4)
    # Pivot wheel shells around the same actual tyre centres as the source.
    key = o.name.removeprefix('Shinsei_')
    pivot = None
    if key in ('fl', 'fr', 'rl', 'rr'):
        front = key[0] == 'f'; side = 1 if key[1] == 'l' else -1
        pivot = Vector((side * (1.8 if front else 1.72) / 2, -(1.45 if front else -1.45), .33 if front else .35))
    elif key == 'flap': pivot = Vector((0, 2.26, 1.24))
    if pivot:
        o.data.transform(Matrix.Translation(-pivot)); o.location = pivot
    if 'smoked_glass' in o.name:
        glass = o.data.materials[0]
        # Avoid transmission frame-buffer passes; keep the low original shell.
        glass.use_nodes = True
        p = next(n for n in glass.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        p.inputs['Transmission Weight'].default_value = 0
        p.inputs['Alpha'].default_value = .72
        glass.surface_render_method = 'BLENDED'
        glass.use_backface_culling = True

bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT / 'shinsei-nd01.glb'), export_format='GLB',
    use_selection=True, export_yup=True, export_apply=True, export_extras=False)
triangles = 0
for o in parts:
    o.data.calc_loop_triangles(); triangles += len(o.data.loop_triangles)
report = {'triangles': triangles, 'meshes': len(parts), 'bytes': (OUT/'shinsei-nd01.glb').stat().st_size,
    'source': 'assets/shinsei-source/blender/lib_car.py', 'bake': '2048 color/normal, 1024 metallic-roughness',
    'rear_wing': 'Aged crimson top flap with dedicated 1024 color bake; clean endplate edges; animated flap pivot retained',
    'wheels': {key: {'radius': .33 if key[0]=='f' else .35, 'width': .31 if key[0]=='f' else .40} for key in ('fl','fr','rl','rr')}}
(OUT / 'shinsei-nd01.json').write_text(json.dumps(report, indent=2))
print('SHINSEI_REPORT', json.dumps(report), flush=True)
