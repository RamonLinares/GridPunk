"""Small bmesh-based modelling helpers. Car frame: +X forward, +Y left, +Z up, metres."""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def tag(obj, part, role, finish="", side="center", **extra):
    obj["part"] = part
    obj["role"] = role
    obj["finish"] = finish
    obj["side"] = side
    for k, v in extra.items():
        obj[k] = v
    return obj


CHIP_MATERIAL = None
CHIP_RNG = None


def chip_flakes(bm, name, density=0.5, spacing=0.06):
    """Tiny bare-metal flakes scattered along the sharp edges of a bmesh (chipped paint)."""
    import random
    global CHIP_RNG
    if CHIP_RNG is None:
        CHIP_RNG = random.Random(11)
    rnd = CHIP_RNG
    fb = bmesh.new()
    count = 0
    for e in bm.edges:
        if len(e.link_faces) != 2:
            continue
        try:
            ang = e.calc_face_angle()
        except ValueError:
            continue
        if ang < math.radians(35):
            continue
        p0, p1 = e.verts[0].co, e.verts[1].co
        d = p1 - p0
        length = d.length
        if length < 0.02:
            continue
        d.normalize()
        o = (e.link_faces[0].normal + e.link_faces[1].normal).normalized()
        n = max(1, int(length / spacing))
        for i in range(n):
            if rnd.random() > density:
                continue
            t = (i + rnd.random()) / n
            p = p0 + (p1 - p0) * t
            l = rnd.uniform(0.008, 0.03)
            w = rnd.uniform(0.005, 0.014)
            ret = bmesh.ops.create_cube(fb, size=1.0)
            vs = ret["verts"]
            bmesh.ops.scale(fb, vec=(l, w, 0.0025), verts=vs)
            side = o.cross(d).normalized()
            m = Matrix((d, side, o)).transposed()
            bmesh.ops.rotate(fb, cent=(0, 0, 0), matrix=m, verts=vs)
            bmesh.ops.translate(fb, vec=p + o * 0.001, verts=vs)
            count += 1
    if count == 0:
        fb.free()
        return None
    ob = bm_obj(fb, name + "_chips")
    ob["chip_count"] = count
    if CHIP_MATERIAL is not None:
        set_mat(ob, CHIP_MATERIAL)
    return ob


def bm_obj(bm, name, smooth=False, chips=False):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if chips:
        bm.normal_update()
        chip_flakes(bm, name)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    me.update()
    return link(bpy.data.objects.new(name, me))


def box(name, size, center, rot=None, smooth=False, chips=False):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    if rot is not None:
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=rot, verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    return bm_obj(bm, name, smooth, chips)


AXIS_ROT = {
    "Z": Matrix.Identity(3),
    "Y": Matrix.Rotation(math.radians(90), 3, "X"),
    "X": Matrix.Rotation(math.radians(90), 3, "Y"),
}


def cylinder(name, radius, depth, center, axis="Y", segments=32, radius2=None, smooth=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments,
                          radius1=radius, radius2=radius if radius2 is None else radius2, depth=depth)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=AXIS_ROT[axis], verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    return bm_obj(bm, name, smooth)


def tube(name, p0, p1, r, segments=12):
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments, radius1=r, radius2=r, depth=d.length)
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix()
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=rot, verts=bm.verts)
    bmesh.ops.translate(bm, vec=(p0 + p1) / 2, verts=bm.verts)
    return bm_obj(bm, name, True)


def sphere(name, r, center, u=16, v=8):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=r)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    return bm_obj(bm, name, True)


def spheres(name, centers, r, u=8, v=6):
    """Many small spheres in one mesh (rivets)."""
    bm = bmesh.new()
    for c in centers:
        ret = bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=r)
        bmesh.ops.translate(bm, vec=Vector(c), verts=ret["verts"])
    return bm_obj(bm, name, True)


def loft(name, sections, cap=True, smooth=False, chips=False):
    bm = bmesh.new()
    rows = [[bm.verts.new(Vector(p)) for p in sec] for sec in sections]
    n = len(rows[0])
    for a, b in zip(rows, rows[1:]):
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    if cap:
        bm.faces.new(list(reversed(rows[0])))
        bm.faces.new(rows[-1])
    return bm_obj(bm, name, smooth, chips)


def extrude_xz(name, pts_xz, y0, y1, smooth=False, chips=False):
    """Closed polygon in the XZ plane extruded from y0 to y1."""
    bm = bmesh.new()
    a = [bm.verts.new((x, y0, z)) for x, z in pts_xz]
    b = [bm.verts.new((x, y1, z)) for x, z in pts_xz]
    n = len(a)
    for i in range(n):
        bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bm.faces.new(list(reversed(a)))
    bm.faces.new(b)
    return bm_obj(bm, name, smooth, chips)


def lathe_y(name, profile, center, segments=48, smooth=True):
    """Revolve a closed (radius, y) profile around a Y axis through `center`."""
    bm = bmesh.new()
    rings = []
    for i in range(segments):
        t = 2 * math.pi * i / segments
        ring = [bm.verts.new((center[0] + r * math.cos(t), center[1] + y, center[2] + r * math.sin(t))) for r, y in profile]
        rings.append(ring)
    n = len(profile)
    for i in range(segments):
        a, b = rings[i], rings[(i + 1) % segments]
        for j in range(n):
            bm.faces.new((a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]))
    return bm_obj(bm, name, smooth)


def curve_tube(name, points, r):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = r
    cu.bevel_resolution = 4
    cu.fill_mode = "FULL"
    cu.use_fill_caps = True
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(points) - 1)
    for bp, p in zip(sp.bezier_points, points):
        bp.co = Vector(p)
        bp.handle_left_type = "AUTO"
        bp.handle_right_type = "AUTO"
    return link(bpy.data.objects.new(name, cu))


def bevel(obj, width=0.01, segments=2, angle=40):
    m = obj.modifiers.new("Bevel", "BEVEL")
    m.width = width
    m.segments = segments
    m.limit_method = "ANGLE"
    m.angle_limit = math.radians(angle)
    return m


def cut(obj, cutter, solver="EXACT"):
    m = obj.modifiers.new("Cut", "BOOLEAN")
    m.operation = "DIFFERENCE"
    m.object = cutter
    m.solver = solver
    cutter.hide_render = True
    cutter.hide_viewport = True
    cutter.display_type = "WIRE"
    return m


def smooth_by_angle(obj, deg=30):
    try:
        with bpy.context.temp_override(object=obj, active_object=obj, selected_editable_objects=[obj], selected_objects=[obj]):
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(deg))
    except Exception as e:  # pragma: no cover
        print("smooth_by_angle failed:", obj.name, e)


def set_mat(obj, mat):
    if hasattr(obj.data, "materials"):
        obj.data.materials.clear()
        obj.data.materials.append(mat)


def decal(name, image, center, normal, up, width, mat, offset=0.004):
    """Textured quad lying on a surface. Reading direction = up x normal (viewer-correct)."""
    n = Vector(normal).normalized()
    u = Vector(up)
    u = (u - u.dot(n) * n).normalized()
    r = u.cross(n).normalized()
    h = width * image.size[1] / image.size[0]
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    vs = [bm.verts.new((x * width, y * h, 0)) for x, y in ((-.5, -.5), (.5, -.5), (.5, .5), (-.5, .5))]
    f = bm.faces.new(vs)
    for lp in f.loops:
        lp[uvl].uv = (lp.vert.co.x / width + 0.5, lp.vert.co.y / h + 0.5)
    obj = bm_obj(bm, name)
    M = Matrix((r, u, n)).transposed().to_4x4()
    M.translation = Vector(center) + n * offset
    obj.matrix_world = M
    set_mat(obj, mat)
    return obj


def look_at(obj, target):
    d = Vector(target) - obj.location
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
