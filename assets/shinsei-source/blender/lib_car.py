"""Parametric build of the Neon District car. Car frame: +X forward, +Y left, +Z up, metres."""
import math
import os
import bpy
from mathutils import Vector, Matrix
from lib_util import (box, cylinder, tube, sphere, spheres, loft, extrude_xz, lathe_y, curve_tube,
                      bevel, cut, smooth_by_angle, set_mat, decal, tag)
import lib_util
import lib_materials as LM

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets", "decals")

P = {
    "front_axle_x": 1.45, "rear_axle_x": -1.45,
    "front_track": 1.80, "rear_track": 1.72,
    "front_tire": {"r": 0.33, "w": 0.31}, "rear_tire": {"r": 0.35, "w": 0.40},
    "rim_r": 0.20,
    # (x, half_width, z_bottom, z_top, top_half_width) -- six-point slab sections, front to back
    "tub": [(2.32, 0.11, 0.22, 0.36, 0.07), (2.0, 0.20, 0.20, 0.42, 0.14), (1.6, 0.30, 0.17, 0.50, 0.22),
            (1.2, 0.38, 0.14, 0.56, 0.30), (0.8, 0.44, 0.12, 0.62, 0.36), (0.4, 0.48, 0.10, 0.66, 0.40),
            (-0.2, 0.50, 0.10, 0.68, 0.42), (-0.8, 0.50, 0.10, 0.72, 0.40), (-1.6, 0.46, 0.12, 0.66, 0.34),
            (-2.2, 0.40, 0.16, 0.52, 0.28), (-2.42, 0.36, 0.20, 0.44, 0.26)],
    "canopy": [(0.80, 0.10, 0.055), (0.60, 0.28, 0.18), (0.30, 0.40, 0.31), (0.0, 0.42, 0.325),
               (-0.35, 0.38, 0.27), (-0.65, 0.26, 0.15), (-0.82, 0.10, 0.045)],
    "canopy_z": 0.58,
    "sidepod": {"x0": 0.95, "x1": -1.04, "y0": 0.50, "y1": 1.02, "z0": 0.10, "z1_front": 0.60, "z1_mid": 0.62, "z1_rear": 0.50},
    "fender": {"x0": -0.85, "x1": -2.15, "y0": 0.60, "y1": 1.12, "z0": 0.10, "z1": 0.76, "side_open_z": 0.42},
    "wing": {"y": 1.02,
             "main": {"le_x": -1.92, "z": 1.12, "chord": 0.50, "aoa": 10},
             "flap": {"le_x": -2.26, "z": 1.24, "chord": 0.26, "aoa": 28},
             "beam": {"le_x": -2.22, "z": 0.84, "chord": 0.20, "aoa": 8},
             "endplate": [(-1.70, 0.80), (-2.50, 0.80), (-2.50, 1.40), (-1.98, 1.40), (-1.70, 1.06)],
             "pylon_y": 0.26, "banner": {"x": -1.90, "z0": 0.86, "z1": 1.10}},
    "splitter": {"x0": 1.15, "x1": 2.45, "y": 1.06, "z0": 0.05, "z1": 0.09},
    "front_plate": [(2.34, 0.09), (1.85, 0.09), (1.85, 0.58), (2.12, 0.52), (2.32, 0.30)], "front_plate_y": 0.98,
    "airbox": {"x0": -0.55, "x1": -1.15, "y": 0.16, "z0": 0.66, "z1": 0.92},
}

M = {}
IMG = {}
DMATS = {}
AIRFOIL = [(0.0, 0.0), (0.03, 0.03), (0.12, 0.05), (0.35, 0.056), (0.65, 0.04), (1.0, 0.006),
           (1.0, -0.006), (0.65, -0.022), (0.35, -0.036), (0.12, -0.032), (0.03, -0.02)]


# ----------------------------------------------------------------------------- helpers
def img(name):
    if name not in IMG:
        IMG[name] = bpy.data.images.load(os.path.join(ASSETS, f"{name}.png"))
    return IMG[name]


def dmat(name):
    if name not in DMATS:
        DMATS[name] = LM.decal_mat(f"decal_{name}", img(name))
    return DMATS[name]


def add_decal(name, image, center, normal, up, width, text, part, side="center", kind="branding"):
    o = decal(name, img(image), center, normal, up, width, dmat(image))
    tag(o, part, "decal", "printed marking", side, text=text, kind=kind)
    return o


def slab_section(x, w, z0, z1, wt):
    zm = z0 + 0.62 * (z1 - z0)
    return [(x, -w, z0), (x, w, z0), (x, w, zm), (x, wt, z1), (x, -wt, z1), (x, -w, zm)]


def tub_at(x):
    secs = P["tub"]
    for (xa, wa, z0a, z1a, wta), (xb, wb, z0b, z1b, wtb) in zip(secs, secs[1:]):
        if xb <= x <= xa:
            t = (xa - x) / (xa - xb)
            f = lambda a, b: a + (b - a) * t
            w, z0, z1, wt = f(wa, wb), f(z0a, z0b), f(z1a, z1b), f(wta, wtb)
            return w, z0, z1, wt, z0 + 0.62 * (z1 - z0)
    raise ValueError(x)


def sidepod_z1(x):
    sp = P["sidepod"]
    xm = (sp["x0"] + sp["x1"]) / 2
    if x >= xm:
        t = (sp["x0"] - x) / (sp["x0"] - xm)
        return sp["z1_front"] + (sp["z1_mid"] - sp["z1_front"]) * t
    t = (xm - x) / (xm - sp["x1"])
    return sp["z1_mid"] + (sp["z1_rear"] - sp["z1_mid"]) * t


def wing_profile(le_x, z, chord, aoa, thick=1.3):
    a = math.radians(aoa)
    pts = []
    for u, v in AIRFOIL:
        x, zz = -u * chord, v * chord * thick
        xr = x * math.cos(a) - zz * math.sin(a)
        zr = x * math.sin(a) + zz * math.cos(a)
        pts.append((le_x + xr, z + zr))
    return pts


def rivet_row(name, part, p0, p1, spacing=0.10, r=0.0065, side="center"):
    p0, p1 = Vector(p0), Vector(p1)
    n = max(2, int((p1 - p0).length / spacing) + 1)
    pts = [p0 + (p1 - p0) * (i / (n - 1)) for i in range(n)]
    o = spheres(name, pts, r)
    tag(o, part, "rivet", "raw aluminium", side, rivet_count=n)
    set_mat(o, M["alu"])
    return o


def rivet_loop(name, part, pts, spacing=0.10, side="center"):
    allp = []
    for a, b in zip(pts, pts[1:] + pts[:1]):
        a, b = Vector(a), Vector(b)
        n = max(2, int((b - a).length / spacing) + 1)
        allp += [a + (b - a) * (i / (n - 1)) for i in range(n - 1)]
    o = spheres(name, allp, 0.0065)
    tag(o, part, "rivet", "raw aluminium", side, rivet_count=len(allp))
    set_mat(o, M["alu"])
    return o


def paint(obj, key):
    set_mat(obj, M[key])
    return obj


# ----------------------------------------------------------------------------- parts
def build_tub():
    tub = loft("tub", [slab_section(*s) for s in P["tub"]], chips=True)
    bevel(tub, 0.012, 2, 35)
    smooth_by_angle(tub, 32)
    tag(tub, "tub", "body_panel", "dirty crimson paint", note="central tub, nose and engine cover as one slab-profiled loft")
    paint(tub, "crimson")
    # floor and splitter plank
    fl = box("floor", (3.2, 1.16, 0.03), (-0.40, 0, 0.075))
    tag(fl, "floor", "floor", "matte graphite", note="flat floor under the tub, between the wheels")
    paint(fl, "graphite")
    for s, side in ((1, "left"), (-1, "right")):
        fs = box(f"floor_side_{side}", (1.72, 0.52, 0.03), (0.06, s * 0.76, 0.075))
        tag(fs, "floor", "floor", "matte graphite", side, note="floor strip under the sidepod, ending ahead of the rear tire and behind the front tire")
        paint(fs, "graphite")
    sp = P["splitter"]
    spl = box("splitter", (sp["x1"] - sp["x0"], 1.16, sp["z1"] - sp["z0"]), ((sp["x0"] + sp["x1"]) / 2, 0, (sp["z0"] + sp["z1"]) / 2))
    bevel(spl, 0.02, 2, 40)
    tag(spl, "splitter", "splitter", "matte graphite", note="flat plank under the nose, between the front tires")
    paint(spl, "graphite")
    bar = box("splitter_bar", (sp["x1"] - 1.86, 2 * sp["y"], sp["z1"] - sp["z0"]), ((sp["x1"] + 1.86) / 2, 0, (sp["z0"] + sp["z1"]) / 2))
    bevel(bar, 0.02, 2, 40)
    tag(bar, "splitter", "splitter", "matte graphite", note="full-width splitter bar ahead of the front tires, carrying the front plates and headlamps")
    paint(bar, "graphite")
    # two off-white stripes on the right nose flank
    for i, z in enumerate((0.245, 0.305)):
        w = tub_at(1.92)[0]
        st = box(f"nose_stripe_{i}", (0.30, 0.006, 0.032), (1.92, -(w + 0.004), z), rot=Matrix.Rotation(math.radians(10.6), 3, "Z"))
        tag(st, "tub", "marking_stripe", "off-white worn panel", "right")
        paint(st, "offwhite")
    # repaired graphite patch on the left nose flank (riveted)
    w = tub_at(0.9)[0]
    patch = box("nose_patch", (0.44, 0.008, 0.16), (0.90, w + 0.004, 0.24), rot=Matrix.Rotation(math.radians(-5.1), 3, "Z"))
    tag(patch, "tub", "body_panel", "raw aluminium", "left", note="repaired panel: unpainted aluminium replacement plate")
    paint(patch, "alu")
    rivet_loop("nose_patch_rivets", "tub", [(1.06, w + 0.012, 0.17), (0.74, w + 0.04, 0.17), (0.74, w + 0.04, 0.29), (1.06, w + 0.012, 0.29)], 0.06, "left")
    # nose flank rivet lines along the chamfer crease
    for s, side in ((1, "left"), (-1, "right")):
        pts = []
        x = 2.15
        while x > 0.5:
            w, z0, z1, wt, zm = tub_at(x)
            pts.append((x, s * (w + 0.003), zm - 0.015))
            x -= 0.11
        o = spheres(f"nose_rivets_{side}", pts, 0.0065)
        tag(o, "tub", "rivet", "raw aluminium", side, rivet_count=len(pts))
        paint(o, "alu")
    # engine-cover ducts (recessed dark rectangles) and panel seams
    for s, side in ((1, "left"), (-1, "right")):
        z1 = tub_at(-1.2)[2]
        d = box(f"duct_engine_{side}", (0.26, 0.13, 0.08), (-1.2, s * 0.22, z1 + 0.03), rot=Matrix.Rotation(math.radians(-4.3), 3, "Y"))
        bevel(d, 0.006, 1, 40)
        tag(d, "tub", "duct", "dirty crimson paint", side, note="raised forward-facing cooling scoop on the engine cover")
        paint(d, "crimson")
        dm = box(f"duct_engine_{side}_mouth", (0.03, 0.11, 0.06), (-1.075, s * 0.22, z1 + 0.035), rot=Matrix.Rotation(math.radians(-4.3), 3, "Y"))
        tag(dm, "tub", "duct", "matte black", side, note="black open mouth of the engine-cover scoop")
        paint(dm, "black")
        z1n = tub_at(1.0)[2]
        d2 = box(f"duct_nose_{side}", (0.16, 0.07, 0.05), (1.0, s * 0.17, z1n + 0.018), rot=Matrix.Rotation(math.radians(-8.5), 3, "Y"))
        tag(d2, "tub", "duct", "dirty crimson paint", side, note="small raised brake-cooling scoop on the nose top")
        paint(d2, "crimson")
        d2m = box(f"duct_nose_{side}_mouth", (0.02, 0.06, 0.036), (1.08, s * 0.17, z1n + 0.022), rot=Matrix.Rotation(math.radians(-8.5), 3, "Y"))
        tag(d2m, "tub", "duct", "matte black", side, note="open mouth of the nose scoop")
        paint(d2m, "black")
    # tail: exhausts, diffuser strakes, brake lights
    for s, side in ((1, "left"), (-1, "right")):
        ex = cylinder(f"exhaust_{side}", 0.045, 0.28, (-2.46, s * 0.22, 0.33), axis="X", segments=20)
        tag(ex, "tail", "exhaust", "dark steel", side)
        paint(ex, "steel_dark")
        ex_in = cylinder(f"exhaust_{side}_bore", 0.036, 0.29, (-2.47, s * 0.22, 0.33), axis="X", segments=20)
        tag(ex_in, "tail", "exhaust", "matte black", side)
        paint(ex_in, "black")
    for i, y in enumerate((-0.6, -0.3, 0.0, 0.3, 0.6)):
        st = box(f"diffuser_strake_{i}", (0.55, 0.014, 0.30), (-2.22, y, 0.18), rot=Matrix.Rotation(math.radians(12), 3, "Y"))
        tag(st, "tail", "diffuser_strake", "brown dirt caking", note="diffuser strake under the tail, caked with brown dirt")
        paint(st, "mud")
    df = box("diffuser_floor", (0.55, 1.20, 0.02), (-2.22, 0, 0.09), rot=Matrix.Rotation(math.radians(12), 3, "Y"))
    tag(df, "tail", "diffuser_floor", "brown dirt caking")
    paint(df, "mud")
    for s, side in ((1, "left"), (-1, "right")):
        bl = box(f"brake_light_{side}", (0.012, 0.22, 0.03), (-2.438, s * 0.2, 0.37))
        tag(bl, "tail", "brake_light", "red LED emitter", side, light_color="red")
        paint(bl, "emit_red")
    rl = box("rain_light", (0.012, 0.07, 0.07), (-2.438, 0, 0.30))
    tag(rl, "tail", "brake_light", "red LED emitter", light_color="red")
    paint(rl, "emit_red")
    tri = box("tail_fin", (0.02, 0.02, 0.02), (-2.0, 0, 0.6))  # placeholder removed below
    bpy.data.objects.remove(tri)
    fin = extrude_xz("deck_fin", [(-1.0, 0.71), (-2.1, 0.545), (-2.1, 0.80), (-1.3, 0.95)], -0.012, 0.012)
    tag(fin, "tail", "fin", "dirty crimson paint", note="vertical shark fin on the engine cover")
    paint(fin, "crimson")
    return tub


def build_canopy():
    zc = P["canopy_z"]
    secs = []
    for x, a, b in P["canopy"]:
        secs.append([(x, a * math.cos(t), zc + b * math.sin(t)) for t in [2 * math.pi * i / 24 for i in range(24)]])
    can = loft("canopy", secs, smooth=True)
    sub = can.modifiers.new("Sub", "SUBSURF")
    sub.levels = 2
    sub.render_levels = 2
    tag(can, "canopy", "canopy", "smoked glass", note="closed teardrop canopy over the cockpit")
    paint(can, "glass")
    helmet = sphere("helmet", 0.13, (0.02, 0, 0.66))
    tag(helmet, "cockpit", "interior", "pale grey helmet", note="driver helmet faintly visible through the canopy")
    paint(helmet, "helmet")
    dash = box("dashboard_glow", (0.06, 0.34, 0.015), (0.44, 0, 0.60))
    tag(dash, "cockpit", "status_light", "cyan LED emitter", light_color="cyan", note="cockpit instrument glow behind the canopy glass")
    paint(dash, "emit_cyan")
    seat = box("seat", (0.55, 0.5, 0.26), (-0.18, 0, 0.50))
    tag(seat, "cockpit", "interior", "dark interior")
    paint(seat, "interior")
    wiper = tube("wiper", (0.58, -0.05, 0.67), (0.32, 0.26, 0.83), 0.016)
    tag(wiper, "canopy", "wiper", "raw aluminium")
    paint(wiper, "alu")
    wiper2 = tube("wiper2", (0.60, -0.12, 0.665), (0.40, -0.34, 0.80), 0.016)
    tag(wiper2, "canopy", "wiper", "raw aluminium")
    paint(wiper2, "alu")
    # airbox / roof intake
    ab = P["airbox"]
    abox = box("airbox", (ab["x0"] - ab["x1"], 2 * ab["y"], ab["z1"] - ab["z0"]), ((ab["x0"] + ab["x1"]) / 2, 0, (ab["z0"] + ab["z1"]) / 2), chips=True)
    bevel(abox, 0.01, 2, 40)
    tag(abox, "airbox", "airbox", "dirty crimson paint", note="raised rectangular engine air intake behind the canopy")
    paint(abox, "crimson")
    lip = box("airbox_lip", (0.03, 2 * ab["y"] + 0.04, ab["z1"] - ab["z0"] + 0.02), (ab["x0"] + 0.005, 0, (ab["z0"] + ab["z1"]) / 2))
    tag(lip, "airbox", "intake", "matte graphite", note="graphite lip framing the intake mouth")
    paint(lip, "graphite")
    mouth = box("airbox_mouth", (0.05, 2 * ab["y"] - 0.04, ab["z1"] - ab["z0"] - 0.06), (ab["x0"] + 0.02, 0, (ab["z0"] + ab["z1"]) / 2))
    tag(mouth, "airbox", "intake", "matte black", note="large black forward-facing intake mouth")
    paint(mouth, "black")
    rivet_loop("airbox_rivets_left", "airbox", [(ab["x0"] - 0.03, ab["y"] + 0.003, ab["z0"] + 0.03), (ab["x1"] + 0.03, ab["y"] + 0.003, ab["z0"] + 0.03),
                                                (ab["x1"] + 0.03, ab["y"] + 0.003, ab["z1"] - 0.03), (ab["x0"] - 0.03, ab["y"] + 0.003, ab["z1"] - 0.03)], 0.08, "left")
    add_decal("decal_airbox_nd01", "nd01", (-0.85, ab["y"] + 0.001, 0.81), (0, 1, 0), (0, 0, 1), 0.22, "ND-01", "airbox", "left", "serial")
    add_decal("decal_airbox_hv", "label_hv", (-0.85, -ab["y"] - 0.001, 0.79), (0, -1, 0), (0, 0, 1), 0.20, "高電圧 HIGH VOLTAGE", "airbox", "right", "warning")
    add_decal("decal_airbox_warn", "warn_tri", (ab["x0"] + 0.001, 0.09, 0.71), (1, 0, 0), (0, 0, 1), 0.10, "warning triangle", "airbox", "center", "warning")
    add_decal("decal_airbox_hv_l", "label_hv", (-1.0, ab["y"] + 0.001, 0.72), (0, 1, 0), (0, 0, 1), 0.22, "高電圧 HIGH VOLTAGE", "airbox", "left", "warning")
    return can


def build_sidepod(side):
    s = 1 if side == "left" else -1
    sp = P["sidepod"]
    yc = s * (sp["y0"] + sp["y1"]) / 2
    hw = (sp["y1"] - sp["y0"]) / 2
    z0 = sp["z0"]

    def sec(x):
        z1 = sidepod_z1(x)
        zm = z0 + 0.8 * (z1 - z0)
        return [(x, yc - hw, z0), (x, yc + hw, z0), (x, yc + hw, zm), (x, yc + hw - 0.05, z1), (x, yc - hw + 0.05, z1), (x, yc - hw, zm)]

    pod = loft(f"sidepod_{side}", [sec(sp["x0"]), sec((sp["x0"] + sp["x1"]) / 2), sec(sp["x1"])], chips=True)
    bevel(pod, 0.012, 2, 35)
    tag(pod, f"sidepod_{side}", "sidepod", "dirty crimson paint", side, note="boxy slab-sided sidepod")
    paint(pod, "crimson")
    yo = s * sp["y1"]
    # front intake tunnel
    cutter = box(f"sidepod_{side}_intake_cut", (0.38, 0.44, 0.42), (sp["x0"] - 0.17, s * 0.76, 0.34))
    cut(pod, cutter)
    inner = box(f"sidepod_{side}_intake_end", (0.05, 0.44, 0.42), (sp["x0"] - 0.37, s * 0.76, 0.34))
    tag(inner, f"sidepod_{side}", "intake", "matte black", side, note="large rectangular cooling intake in the sidepod front face")
    paint(inner, "black")
    for i in range(2):
        sl = box(f"sidepod_{side}_intake_louver_{i}", (0.03, 0.42, 0.012), (sp["x0"] - 0.02, s * 0.76, 0.27 + i * 0.16))
        tag(sl, f"sidepod_{side}", "vent_louver", "matte graphite", side)
        paint(sl, "graphite")
    # two flank grilles (recessed, vertical slats)
    for gi, xc in enumerate((0.62, -0.42)):
        gc = box(f"sidepod_{side}_grille{gi}_cut", (0.30, 0.10, 0.30), (xc, yo - 0.02, 0.37))
        cut(pod, gc)
        back = box(f"sidepod_{side}_grille{gi}_back", (0.30, 0.02, 0.30), (xc, yo - s * 0.06, 0.37))
        tag(back, f"sidepod_{side}", "vent", "matte black", side, note="recessed louvered vent on the sidepod flank")
        paint(back, "black")
        for k in range(7):
            sl = box(f"sidepod_{side}_grille{gi}_slat{k}", (0.012, 0.04, 0.30), (xc - 0.135 + k * 0.045, yo - s * 0.035, 0.37))
            tag(sl, f"sidepod_{side}", "vent_louver", "matte graphite", side)
            paint(sl, "graphite")
    # lower panel between the grilles: off-white with branding (left), bare aluminium repair (right)
    pn = box(f"sidepod_{side}_panel", (0.40, 0.012, 0.25), (0.10, yo + s * 0.004, 0.255))
    if side == "left":
        tag(pn, f"sidepod_{side}", "body_panel", "off-white worn panel", side, note="off-white sponsor panel")
        paint(pn, "offwhite")
        add_decal("decal_sidepod_nexus", "nexus_panel", (0.10, yo + s * 0.011, 0.255), (0, s, 0), (0, 0, 1), 0.22,
                  "東区 NEXUS FUELING CLEANER CITIES", f"sidepod_{side}", side, "branding")
    else:
        tag(pn, f"sidepod_{side}", "body_panel", "raw aluminium", side, note="repaired panel: unpainted replacement plate")
        paint(pn, "alu")
        add_decal("decal_sidepod_serial", "serial_small", (0.10, yo + s * 0.011, 0.30), (0, s, 0), (0, 0, 1), 0.20,
                  "KZ-88 / 0419", f"sidepod_{side}", side, "serial")
    rivet_loop(f"sidepod_{side}_panel_rivets", f"sidepod_{side}",
               [(0.28, yo + s * 0.012, 0.15), (-0.08, yo + s * 0.012, 0.15), (-0.08, yo + s * 0.012, 0.36), (0.28, yo + s * 0.012, 0.36)], 0.07, side)
    # rivets along the top outer edge
    pts = []
    x = sp["x0"] - 0.05
    while x > sp["x1"] + 0.05:
        pts.append((x, yo - s * 0.02, sidepod_z1(x) + 0.002))
        x -= 0.11
    o = spheres(f"sidepod_{side}_top_rivets", pts, 0.0065)
    tag(o, f"sidepod_{side}", "rivet", "raw aluminium", side, rivet_count=len(pts))
    paint(o, "alu")
    # thin cyan status strip along the top front edge
    st = box(f"status_cyan_{side}", (0.34, 0.02, 0.02), (sp["x0"] - 0.25, yo + s * 0.004, sidepod_z1(sp["x0"] - 0.25) - 0.035))
    tag(st, f"sidepod_{side}", "status_light", "cyan LED emitter", side, light_color="cyan", note="thin cyan status light strip")
    paint(st, "emit_cyan")
    # mirror
    stalk = tube(f"mirror_stalk_{side}", (0.55, s * 0.49, 0.62), (0.60, s * 0.72, 0.72), 0.012)
    tag(stalk, "cockpit", "mirror", "matte black", side)
    paint(stalk, "black")
    mh = box(f"mirror_{side}", (0.18, 0.11, 0.08), (0.61, s * 0.78, 0.73))
    tag(mh, "cockpit", "mirror", "raw aluminium", side)
    paint(mh, "alu")
    ap = box(f"sidepod_{side}_alu_panel", (0.36, 0.008, 0.15), (0.55, yo + s * 0.004, 0.50))
    tag(ap, f"sidepod_{side}", "body_panel", "raw aluminium", side, note="unpainted aluminium replacement panel on the sidepod front flank")
    paint(ap, "alu")
    rivet_loop(f"sidepod_{side}_alu_rivets", f"sidepod_{side}", [(0.71, yo + s * 0.012, 0.44), (0.39, yo + s * 0.012, 0.44), (0.39, yo + s * 0.012, 0.56), (0.71, yo + s * 0.012, 0.56)], 0.06, side)
    return pod


def build_fender(side):
    s = 1 if side == "left" else -1
    f = P["fender"]
    rt = P["rear_tire"]
    yc = s * (f["y0"] + f["y1"]) / 2
    fen = box(f"fender_{side}", (f["x0"] - f["x1"], f["y1"] - f["y0"], f["z1"] - f["z0"]), ((f["x0"] + f["x1"]) / 2, yc, (f["z0"] + f["z1"]) / 2), chips=True)
    bevel(fen, 0.012, 2, 35)
    # wheel-well arch: stops short of the outer wall
    y_in, y_out = f["y0"] - 0.10, f["y1"] - 0.03
    arch = cylinder(f"fender_{side}_arch_cut", rt["r"] + 0.05, y_out - y_in, (P["rear_axle_x"], s * (y_in + y_out) / 2, rt["r"]), axis="Y", segments=40)
    cut(fen, arch)
    # open the lower part of the outer wall so the tire shows from the side
    side_cut = box(f"fender_{side}_side_cut", (0.98, 0.12, f["side_open_z"] + 0.1), (P["rear_axle_x"], s * f["y1"], (f["side_open_z"] - 0.1) / 2 + 0.0))
    cut(fen, side_cut)
    tag(fen, f"fender_{side}", "fender_rear", "dirty crimson paint", side,
        note="boxy rear fender enclosing the tire from above; outer wall open below %.2f m so the lower tire shows" % f["side_open_z"])
    paint(fen, "crimson")
    # grey lower skirt panel on the outer wall above the opening
    sk = box(f"fender_{side}_skirt", (0.98, 0.01, 0.12), (P["rear_axle_x"], s * (f["y1"] + 0.004), f["side_open_z"] + 0.07))
    tag(sk, f"fender_{side}", "body_panel", "off-white worn panel", side, note="off-white edge panel on the fender")
    paint(sk, "offwhite")
    rivet_row(f"fender_{side}_skirt_rivets", f"fender_{side}", (P["rear_axle_x"] + 0.45, s * (f["y1"] + 0.011), f["side_open_z"] + 0.07),
              (P["rear_axle_x"] - 0.45, s * (f["y1"] + 0.011), f["side_open_z"] + 0.07), 0.09, side=side)
    rivet_row(f"fender_{side}_top_rivets", f"fender_{side}", (f["x0"] - 0.05, s * (f["y1"] - 0.02), f["z1"] + 0.002),
              (f["x1"] + 0.05, s * (f["y1"] - 0.02), f["z1"] + 0.002), 0.11, side=side)
    add_decal(f"decal_fender_serial_{side}", "serial_small", (P["rear_axle_x"] + 0.1, s * (f["y1"] + 0.001), 0.66), (0, s, 0), (0, 0, 1), 0.22,
              "KZ-88 / 0419", f"fender_{side}", side, "serial")
    am = box(f"status_amber_{side}", (0.012, 0.12, 0.02), (f["x1"] - 0.004, s * 0.92, 0.62))
    tag(am, f"fender_{side}", "status_light", "amber LED emitter", side, light_color="amber", note="thin amber status light on the fender rear face")
    paint(am, "emit_amber")
    am2 = box(f"marker_amber_{side}", (0.05, 0.012, 0.02), (f["x0"] - 0.06, s * (f["y1"] + 0.004), f["z1"] - 0.05))
    tag(am2, f"fender_{side}", "status_light", "amber LED emitter", side, light_color="amber", note="small amber marker light on the fender front corner")
    paint(am2, "emit_amber")
    rp = box(f"fender_{side}_patch", (0.30, 0.008, 0.16), (-1.05, s * (f["y1"] + 0.004), 0.66))
    tag(rp, f"fender_{side}", "body_panel", "raw aluminium", side, note="repaired panel: unpainted aluminium plate riveted over the fender")
    paint(rp, "alu")
    rivet_loop(f"fender_{side}_patch_rivets", f"fender_{side}", [(-0.92, s * (f["y1"] + 0.012), 0.59), (-1.18, s * (f["y1"] + 0.012), 0.59), (-1.18, s * (f["y1"] + 0.012), 0.73), (-0.92, s * (f["y1"] + 0.012), 0.73)], 0.06, side)
    return fen


def build_wing():
    w = P["wing"]
    y = w["y"]
    main = extrude_xz("wing_main", wing_profile(**w["main"]), -y + 0.012, y - 0.012, chips=True)
    tag(main, "rear_wing", "wing_element", "dirty crimson paint", note="main plane, chord %.2f m, span %.2f m" % (w["main"]["chord"], 2 * y))
    paint(main, "crimson_dark")
    flap = extrude_xz("wing_flap", wing_profile(**w["flap"]), -y + 0.012, y - 0.012)
    tag(flap, "rear_wing", "wing_element", "matte graphite", note="upper flap element")
    paint(flap, "graphite")
    beam = extrude_xz("wing_beam", wing_profile(**w["beam"]), -y + 0.012, y - 0.012)
    tag(beam, "rear_wing", "wing_element", "matte graphite", note="lower beam wing between the endplates")
    paint(beam, "graphite")
    for s, side in ((1, "left"), (-1, "right")):
        ep = extrude_xz(f"wing_endplate_{side}", w["endplate"], s * y - 0.012, s * y + 0.012, chips=True)
        bevel(ep, 0.008, 2, 40)
        tag(ep, "rear_wing", "wing_endplate", "dirty crimson paint", side, note="large vertical endplate")
        paint(ep, "crimson")
        pts = [(x, s * (y + 0.013), z) for x, z in w["endplate"]]
        rivet_loop(f"wing_endplate_{side}_rivets", "rear_wing", [(px + (0.03 if px > -2.1 else -0.03) * (1 if px > -2.1 else 1), py, pz + (0.03 if pz < 1.0 else -0.03)) for px, py, pz in pts], 0.09, side)
        # box-section pylons from the deck to the banner
        py = s * w["pylon_y"]
        pyl = box(f"wing_pylon_{side}", (0.22, 0.08, w["banner"]["z0"] - 0.55), (-2.06, py, (w["banner"]["z0"] + 0.55) / 2))
        tag(pyl, "rear_wing", "wing_support", "matte graphite", side, support_style="box-section pylon", thickness=0.08, note="thick box-section pylon rising from the engine deck")
        paint(pyl, "graphite")
        op = box(f"wing_pylon_out_{side}", (0.16, 0.10, 0.36), (-2.10, s * 0.82, 0.94))
        bevel(op, 0.008, 1, 40)
        tag(op, "rear_wing", "wing_support", "matte graphite", side, support_style="box-section pylon", thickness=0.16, note="heavy box-section pylon rising from the rear fender roof into the wing")
        paint(op, "graphite")
        br = tube(f"wing_brace_{side}", (-1.62, s * 0.92, 0.76), (-2.05, s * (y - 0.03), 0.96), 0.035)
        tag(br, "rear_wing", "wing_support", "dark steel", side, support_style="diagonal tube brace", thickness=0.07, note="thick diagonal bar from the fender roof to the endplate")
        paint(br, "steel_dark")
        br2 = tube(f"wing_brace2_{side}", (-1.50, s * 0.30, 0.66), (-1.95, s * w["pylon_y"], w["banner"]["z0"]), 0.03)
        tag(br2, "rear_wing", "wing_support", "dark steel", side, support_style="diagonal tube brace", thickness=0.06)
        paint(br2, "steel_dark")
        strut = tube(f"wing_strut_{side}", (-2.30, s * 0.92, 0.76), (-2.30, s * (y - 0.03), w["endplate"][0][1] + 0.02), 0.035)
        tag(strut, "rear_wing", "wing_support", "dark steel", side, support_style="vertical strut", thickness=0.07)
        paint(strut, "steel_dark")
    cb = box("wing_crossbeam", (0.08, 2 * w["pylon_y"] + 0.08, 0.06), (-2.06, 0, 0.70))
    tag(cb, "rear_wing", "wing_support", "matte graphite", support_style="cross beam", thickness=0.06, note="horizontal cross beam between the pylons")
    paint(cb, "graphite")
    b = w["banner"]
    ban = box("wing_banner", (0.03, 2 * y - 0.05, b["z1"] - b["z0"]), (b["x"], 0, (b["z0"] + b["z1"]) / 2))
    tag(ban, "rear_wing", "wing_banner", "matte graphite", note="vertical structural plate under the main plane carrying the sponsor name")
    paint(ban, "graphite")
    rivet_row("wing_banner_rivets_top", "rear_wing", (b["x"] + 0.016, -y + 0.06, b["z1"] - 0.02), (b["x"] + 0.016, y - 0.06, b["z1"] - 0.02), 0.10)
    rivet_row("wing_banner_rivets_bot", "rear_wing", (b["x"] + 0.016, -y + 0.06, b["z0"] + 0.02), (b["x"] + 0.016, y - 0.06, b["z0"] + 0.02), 0.10)
    add_decal("decal_wing_shinsei", "shinsei_wing", (b["x"] + 0.016, 0, (b["z0"] + b["z1"]) / 2), (1, 0, 0), (0, 0, 1), 0.95,
              "新星工業 SHINSEI", "rear_wing", "center", "branding")
    add_decal("decal_wing_num6", "num6", (-2.12, y + 0.013, 1.0), (0, 1, 0), (0, 0, 1), 0.34, "6", "rear_wing", "left", "race number")
    add_decal("decal_wing_num6_r", "num6", (-2.12, -y - 0.013, 1.0), (0, -1, 0), (0, 0, 1), 0.34, "6", "rear_wing", "right", "race number")
    return main


def build_front_aero():
    sp = P["splitter"]
    for s, side in ((1, "left"), (-1, "right")):
        yp = s * P["front_plate_y"]
        pl = extrude_xz(f"front_plate_{side}", P["front_plate"], yp - 0.015, yp + 0.015, chips=True)
        bevel(pl, 0.006, 1, 40)
        if side == "left":
            tag(pl, "front_aero", "endplate_front", "off-white worn panel", side, note="large vertical plate ahead of the front wheel")
            paint(pl, "offwhite")
            add_decal("decal_kaze", "kaze_plate", (2.07, yp + 0.016, 0.31), (0, 1, 0), (0, 0, 1), 0.34, "風 KAZE HEAVY INDUSTRIES", "front_aero", side, "branding")
        else:
            tag(pl, "front_aero", "endplate_front", "matte graphite", side, note="large vertical plate ahead of the front wheel")
            paint(pl, "graphite")
            add_decal("decal_hk7", "hk7_plate", (2.02, yp - 0.016, 0.40), (0, -1, 0), (0, 0, 1), 0.22, "HK-7 ND 01", "front_aero", side, "serial")
            add_decal("decal_caution", "caution", (2.08, yp - 0.016, 0.20), (0, -1, 0), (0, 0, 1), 0.26, "CAUTION HOT SURFACE", "front_aero", side, "warning")
        rivet_loop(f"front_plate_{side}_rivets", "front_aero", [(2.30, yp + s * 0.016, 0.12), (1.89, yp + s * 0.016, 0.12), (1.89, yp + s * 0.016, 0.54), (2.10, yp + s * 0.016, 0.49), (2.28, yp + s * 0.016, 0.30)], 0.08, side)
        for i, yl in enumerate((0.82, 0.70)):
            hs = box(f"headlamp_{side}_{i}_housing", (0.12, 0.09, 0.07), (2.38, s * yl, sp["z1"] + 0.035))
            tag(hs, "front_aero", "lamp_housing", "matte black", side)
            paint(hs, "black")
            ln = box(f"headlamp_{side}_{i}", (0.012, 0.075, 0.05), (2.441, s * yl, sp["z1"] + 0.037))
            tag(ln, "front_aero", "headlamp", "white LED emitter", side, light_color="white", note="small rectangular LED headlamp on the splitter leading edge")
            paint(ln, "emit_white")
    strip = box("splitter_led_strip", (0.012, 1.9, 0.006), (sp["x1"] + 0.004, 0, sp["z0"] + 0.02))
    tag(strip, "front_aero", "status_light", "red LED emitter", light_color="red", note="thin red light strip along the splitter lip")
    paint(strip, "emit_red")
    ug = box("underglow_emitter", (2.9, 1.1, 0.006), (-0.3, 0, 0.052))
    tag(ug, "floor", "underglow", "cold-blue underglow emitter", light_color="cold blue", note="faint cold-blue ground-effect glow panel under the floor")
    paint(ug, "emit_blue")
    for s, side in ((1, "left"), (-1, "right")):
        us = box(f"underglow_strip_{side}", (1.7, 0.014, 0.012), (0.06, s * 1.005, 0.056))
        tag(us, "floor", "underglow", "cold-blue underglow emitter", side, light_color="cold blue", note="thin cold-blue strip along the floor edge under the sidepod")
        paint(us, "emit_blue")


def build_wheel(name, x, y, r, w, side, part):
    s = 1 if side == "left" else -1
    rim_r = P["rim_r"]
    r_in = rim_r - 0.01
    prof = [(r_in, -w / 2), (r - 0.05, -w / 2), (r - 0.012, -w / 2 + 0.03), (r, -w / 2 + 0.06), (r, w / 2 - 0.06),
            (r - 0.012, w / 2 - 0.03), (r - 0.05, w / 2), (r_in, w / 2)]
    tire = lathe_y(f"{name}_tire", prof, (x, y, r), 56)
    tag(tire, part, "tire", "black rubber (wet)", side, tire_radius=r, tire_width=w, note="wide slick")
    paint(tire, "rubber")
    h = w * 0.46
    rim_prof = [(rim_r, -h * s), (rim_r, h * s), (rim_r - 0.012, h * s), (rim_r - 0.012, (h - 0.09) * s), (0.05, (h - 0.09) * s), (0.05, -h * s)]
    rim = lathe_y(f"{name}_rim", rim_prof, (x, y, r), 40)
    tag(rim, part, "rim", "dark metal rim", side)
    paint(rim, "rim")
    for i in range(5):
        ang = math.radians(i * 72)
        rot = Matrix.Rotation(ang, 3, "Y")
        sp = box(f"{name}_spoke_{i}", (rim_r - 0.04, 0.02, 0.03), (0, 0, 0), rot=rot)
        sp.location = (x + (rim_r - 0.04) / 2 * math.cos(ang), y + (h - 0.08) * s, r + (rim_r - 0.04) / 2 * math.sin(ang))
        # rebuild centred: simpler to move verts via matrix
        tag(sp, part, "rim", "dark metal rim", side)
        paint(sp, "rim")
    nut = cylinder(f"{name}_hub", 0.045, 0.06, (x, y + (h - 0.06) * s, r), axis="Y", segments=16)
    tag(nut, part, "hub", "dark steel", side)
    paint(nut, "steel_dark")
    return tire


def build_wheels():
    ft, rt = P["front_tire"], P["rear_tire"]
    for s, side in ((1, "left"), (-1, "right")):
        build_wheel(f"wheel_front_{side}", P["front_axle_x"], s * P["front_track"] / 2, ft["r"], ft["w"], side, f"wheel_front_{side}")
        build_wheel(f"wheel_rear_{side}", P["rear_axle_x"], s * P["rear_track"] / 2, rt["r"], rt["w"], side, f"wheel_rear_{side}")


def build_suspension():
    ft = P["front_tire"]
    xf = P["front_axle_x"]
    for s, side in ((1, "left"), (-1, "right")):
        yo = P["front_track"] / 2 - ft["w"] / 2 - 0.02
        hub = (xf, s * yo, ft["r"])
        arms = [
            ((xf + 0.32, s * 0.34, 0.46), (xf, s * yo, 0.50), "upper wishbone"),
            ((xf - 0.30, s * 0.36, 0.47), (xf, s * yo, 0.50), "upper wishbone"),
            ((xf + 0.34, s * 0.36, 0.16), (xf, s * yo, 0.20), "lower wishbone"),
            ((xf - 0.32, s * 0.38, 0.16), (xf, s * yo, 0.20), "lower wishbone"),
            ((xf - 0.02, s * (yo - 0.02), 0.22), (xf - 0.15, s * 0.30, 0.60), "pushrod"),
            ((xf + 0.12, s * 0.36, 0.30), (xf + 0.10, s * yo, 0.32), "steering arm"),
        ]
        for i, (a, b, kind) in enumerate(arms):
            t = tube(f"susp_front_{side}_{i}", a, b, 0.013)
            tag(t, f"suspension_front_{side}", "suspension_arm", "matte black", side, note=f"exposed front {kind}")
            paint(t, "black")
        up = box(f"upright_front_{side}", (0.10, 0.06, 0.36), (xf, s * (yo - 0.01), 0.35))
        tag(up, f"suspension_front_{side}", "upright", "dark steel", side)
        paint(up, "steel_dark")
        # rear (partly hidden under the fenders)
        xr = P["rear_axle_x"]
        yr = P["rear_track"] / 2 - P["rear_tire"]["w"] / 2 - 0.02
        for i, (a, b) in enumerate((((xr + 0.30, s * 0.42, 0.17), (xr, s * yr, 0.21)), ((xr - 0.30, s * 0.42, 0.17), (xr, s * yr, 0.21)),
                                    ((xr + 0.28, s * 0.44, 0.44), (xr, s * yr, 0.48)), ((xr + 0.02, s * 0.30, 0.34), (xr, s * yr, 0.35)))):
            t = tube(f"susp_rear_{side}_{i}", a, b, 0.013 if i < 3 else 0.03)
            tag(t, f"suspension_rear_{side}", "suspension_arm" if i < 3 else "driveshaft", "matte black", side, note="rear suspension arm under the fender")
            paint(t, "black")


def build_cables():
    for s, side in ((1, "left"), (-1, "right")):
        c1 = curve_tube(f"cable_engine_{side}", [(-1.2, s * 0.75, 0.775), (-1.6, s * 0.62, 0.72), (-1.85, s * 0.40, 0.64), (-2.0, s * 0.30, 0.56)], 0.02)
        tag(c1, "mechanical", "cable", "black rubber hose", side, note="thick black hose from the sidepod rear into the engine bay")
        paint(c1, "rubber_hose")
        c2 = curve_tube(f"cable_brake_{side}", [(1.05, s * (tub_at(1.05)[0] + 0.012), 0.30), (1.30, s * 0.50, 0.30), (1.45, s * 0.70, 0.36)], 0.011)
        tag(c2, "mechanical", "cable", "yellow brake line", side, note="yellow brake line running along the nose flank to the front upright")
        paint(c2, "hose_yellow")
        c3 = curve_tube(f"cable_airbox_{side}", [(-0.72, s * 0.17, 0.80), (-0.78, s * 0.45, 0.74), (-0.9, s * 0.72, 0.78), (-1.05, s * 0.92, 0.775)], 0.02)
        tag(c3, "mechanical", "cable", "black rubber hose", side, note="thick hose from the airbox down over the sidepod")
        paint(c3, "rubber_hose")
        c4 = curve_tube(f"cable_orange_{side}", [(0.62, s * 0.86, 0.635), (0.2, s * 0.99, 0.665), (-0.4, s * 1.005, 0.645), (-0.85, s * 1.0, 0.63), (-1.0, s * 0.96, 0.775)], 0.017)
        tag(c4, "mechanical", "cable", "orange hydraulic hose", side, note="orange hydraulic line running along the top outer edge of the sidepod")
        paint(c4, "hose_orange")
        c5 = curve_tube(f"cable_front_{side}", [(x, s * (tub_at(x)[0] + 0.014), tub_at(x)[4] + 0.012) for x in (1.95, 1.6, 1.25, 0.95, 0.7)] + [(0.55, s * 0.62, 0.60)], 0.012)
        tag(c5, "mechanical", "cable", "orange hydraulic hose", side, note="orange line from the nose ducts back to the sidepod")
        paint(c5, "hose_orange")
    ant = tube("antenna", (-0.6, 0.30, 0.74), (-0.62, 0.30, 1.12), 0.006)
    tag(ant, "mechanical", "antenna", "matte black")
    paint(ant, "black")


def build_body_decals():
    # nose: race number on the top slab, district name near the tip, sponsor on the left flank
    w, z0, z1, wt, zm = tub_at(1.40)
    slope = math.atan2(tub_at(1.2)[2] - tub_at(1.6)[2], 0.4)
    n = (math.sin(slope), 0, math.cos(slope))
    add_decal("decal_nose_num6", "num6", (1.40, 0, z1 + 0.001), n, (-1, 0, 0), 0.40, "6", "tub", "center", "race number")
    w2, z02, z12, wt2, zm2 = tub_at(1.85)
    add_decal("decal_nose_district", "neon_district", (1.85, 0, z12 + 0.001), n, (-1, 0, 0), 0.24, "東区 NEON DISTRICT", "tub", "center", "branding")
    w3, z03, z13, wt3, zm3 = tub_at(1.30)
    add_decal("decal_nose_shinsei", "shinsei_power", (1.30, w3 + 0.001, (z03 + zm3) / 2), (0.19, 1, 0), (0, 0, 1), 0.40, "SHINSEI POWER SYSTEMS", "tub", "left", "branding")
    w4, z04, z14, wt4, zm4 = tub_at(0.25)
    add_decal("decal_tub_nd01", "nd01", (0.25, w4 + 0.001, (z04 + zm4) / 2 + 0.06), (0, 1, 0), (0, 0, 1), 0.26, "ND-01", "tub", "left", "serial")
    add_decal("decal_tub_nd01_r", "nd01", (0.25, -w4 - 0.001, (z04 + zm4) / 2 + 0.06), (0, -1, 0), (0, 0, 1), 0.26, "ND-01", "tub", "right", "serial")
    w5, z05, z15, wt5, zm5 = tub_at(-1.2)
    add_decal("decal_engine_division", "racing_division", (-1.2, w5 + 0.001, (z05 + zm5) / 2 + 0.05), (0, 1, 0), (0, 0, 1), 0.42, "NEON DISTRICT RACING DIVISION", "tub", "left", "branding")
    add_decal("decal_engine_division_r", "racing_division", (-1.2, -w5 - 0.001, (z05 + zm5) / 2 + 0.05), (0, -1, 0), (0, 0, 1), 0.42, "NEON DISTRICT RACING DIVISION", "tub", "right", "branding")
    w6, z06, z16, wt6, zm6 = tub_at(-0.55)
    add_decal("decal_fuel", "label_fuel", (-0.55, w6 + 0.001, (z06 + zm6) / 2 + 0.03), (0, 1, 0), (0, 0, 1), 0.16, "燃料 FUEL", "tub", "left", "warning")
    for s, side in ((1, "left"), (-1, "right")):
        yo = P["sidepod"]["y1"]
        add_decal(f"decal_hazard_sidepod_{side}", "hazard_stripes", (-0.72, s * (yo + 0.001), 0.17), (0, s, 0), (0, 0, 1), 0.40, "yellow and black hazard stripes", f"sidepod_{side}", side, "warning")
        add_decal(f"decal_hazard_plate_{side}", "hazard_stripes", (2.05, s * (P["front_plate_y"] + 0.016), 0.135), (0, s, 0), (0, 0, 1), 0.40, "yellow and black hazard stripes", "front_aero", side, "warning")
        add_decal(f"decal_caution_fender_{side}", "caution", (-1.05, s * (P["fender"]["y1"] + 0.001), 0.64), (0, s, 0), (0, 0, 1), 0.26, "CAUTION HOT SURFACE", f"fender_{side}", side, "warning")
        w7, z07, z17, wt7, zm7 = tub_at(0.55)
        add_decal(f"decal_tub_warn_{side}", "warn_tri", (0.55, s * (w7 + 0.001), (z07 + zm7) / 2), (0, s, 0), (0, 0, 1), 0.09, "warning triangle", "tub", side, "warning")
    add_decal("decal_tail_warn", "warn_tri", (-2.435, 0.30, 0.38), (-1, 0, 0), (0, 0, 1), 0.10, "warning triangle", "tail", "left", "warning")
    add_decal("decal_tail_warn_r", "warn_tri", (-2.435, -0.30, 0.38), (-1, 0, 0), (0, 0, 1), 0.10, "warning triangle", "tail", "right", "warning")
    # long scratches (decals) and dirt splatter
    add_decal("decal_scratch_nose", "scratches_a", (1.0, 0, tub_at(1.0)[2] + 0.001), (math.sin(slope), 0, math.cos(slope)), (-1, 0, 0), 0.50, "long thin scratches", "tub", "center", "scratch")
    for s, side in ((1, "left"), (-1, "right")):
        wq, z0q, z1q, wtq, zmq = tub_at(-0.2)
        add_decal(f"decal_scratch_tub_{side}", "scratches_b", (-0.2, s * (wq + 0.001), (z0q + zmq) / 2), (0, s, 0), (0, 0, 1), 0.50, "long thin scratches", "tub", side, "scratch")
        yo = P["sidepod"]["y1"]
        add_decal(f"decal_scratch_podtop_{side}", "scratches_a", (-0.5, s * 0.76, sidepod_z1(-0.5) + 0.001), (0, 0, 1), (-1, 0, 0), 0.40, "long thin scratches", f"sidepod_{side}", side, "scratch")
        add_decal(f"decal_scratch_endplate_{side}", "scratches_b", (-2.25, s * (P["wing"]["y"] + 0.013), 1.28), (0, s, 0), (0, 0, 1), 0.46, "long thin scratches", "rear_wing", side, "scratch")
        f = P["fender"]
        add_decal(f"decal_dirt_fender_{side}", "dirt_splash", (f["x1"] - 0.001, s * 0.86, 0.33), (-1, 0, 0), (0, 0, 1), 0.46, "brown dirt splatter", f"fender_{side}", side, "dirt")
        add_decal(f"decal_dirt_pod_{side}", "dirt_splash", (f["x0"] + 0.001, s * 0.86, 0.30), (1, 0, 0), (0, 0, 1), 0.44, "brown dirt splatter", f"fender_{side}", side, "dirt")
    add_decal("decal_dirt_tail", "dirt_splash", (-2.436, 0, 0.30), (-1, 0, 0), (0, 0, 1), 0.66, "brown dirt splatter", "tail", "center", "dirt")
    fill = cylinder("fuel_filler", 0.045, 0.02, (-0.55, w6 - 0.002, (z06 + zm6) / 2 + 0.03), axis="Y", segments=16)
    tag(fill, "tub", "filler", "dark steel", "left", note="fuel filler cap")
    paint(fill, "steel_dark")


def build_car(materials):
    global M
    M = materials
    lib_util.CHIP_MATERIAL = M["alu"]
    build_tub()
    build_canopy()
    for side in ("left", "right"):
        build_sidepod(side)
        build_fender(side)
    build_wing()
    build_front_aero()
    build_wheels()
    build_suspension()
    build_cables()
    build_body_decals()
    # tag chip-flake meshes with their parent part so the inventory sees them
    for o in list(bpy.data.objects):
        if o.name.endswith("_chips") and "part" not in o.keys():
            parent = bpy.data.objects.get(o.name[:-6])
            if parent is not None and "part" in parent.keys():
                tag(o, parent["part"], "paint_chip", "raw aluminium", parent["side"], chip_count=o["chip_count"],
                    note="bare-metal chip flakes along the sharp edges")
    return P
