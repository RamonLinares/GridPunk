"""Procedural, EEVEE-friendly materials: worn wet paint, metals, rubber, glass, emitters, wet asphalt."""
import bpy

FEATURES = {}  # material name -> list of wear/weather features it renders (exported to the inventory)


def _new(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    return m, nt


def N(nt, t, **kw):
    n = nt.nodes.new(t)
    for k, v in kw.items():
        setattr(n, k, v)
    return n


def L(nt, a, ao, b, bi):
    nt.links.new(a.outputs[ao], b.inputs[bi])


def mix_rgb(nt, a=None, b=None, fac=None):
    n = nt.nodes.new("ShaderNodeMix")
    n.data_type = "RGBA"
    if a is not None:
        n.inputs[6].default_value = (*a, 1)
    if b is not None:
        n.inputs[7].default_value = (*b, 1)
    if fac is not None:
        n.inputs[0].default_value = fac
    return n  # factor=0, A=6, B=7, out=2


def mix_f(nt, a, b):
    n = nt.nodes.new("ShaderNodeMix")
    n.data_type = "FLOAT"
    n.inputs[2].default_value = a
    n.inputs[3].default_value = b
    return n  # factor=0, A=2, B=3, out=0


def math_(nt, op, v1=None, v2=None, clamp=False):
    n = nt.nodes.new("ShaderNodeMath")
    n.operation = op
    if v1 is not None:
        n.inputs[0].default_value = v1
    if v2 is not None:
        n.inputs[1].default_value = v2
    n.use_clamp = clamp
    return n


def _droplets(nt, coords, scale=110.0, patchy=True, gate=0.47, strength=0.55):
    """Rain droplet height field -> bump normal."""
    vor = N(nt, "ShaderNodeTexVoronoi")
    vor.feature = "F1"
    vor.inputs["Scale"].default_value = scale
    vor.inputs["Randomness"].default_value = 1.0
    L(nt, coords, "Object", vor, "Vector")
    inv = math_(nt, "SUBTRACT", 1.0, clamp=True)
    d = math_(nt, "DIVIDE", None, 0.33, clamp=True)
    L(nt, vor, "Distance", d, 0)
    L(nt, d, "Value", inv, 1)
    dome = math_(nt, "POWER", None, 0.5)
    L(nt, inv, "Value", dome, 0)
    height = dome
    if patchy:
        pn = N(nt, "ShaderNodeTexNoise")
        pn.inputs["Scale"].default_value = 5.0
        pn.inputs["Detail"].default_value = 3.0
        L(nt, coords, "Object", pn, "Vector")
        gate = math_(nt, "GREATER_THAN", None, gate)
        L(nt, pn, "Fac", gate, 0)
        m = math_(nt, "MULTIPLY")
        L(nt, dome, "Value", m, 0)
        L(nt, gate, "Value", m, 1)
        height = m
    bump = N(nt, "ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength
    bump.inputs["Distance"].default_value = 0.012
    L(nt, height, "Value", bump, "Height")
    return bump


def worn_paint(name, base, grime=(0.05, 0.045, 0.04), metallic=0.12, rough=0.38, chips=0.07,
               scratches=True, droplets=True, coat=1.0, streaks=0.38, finish="paint"):
    m, nt = _new(name)
    out = N(nt, "ShaderNodeOutputMaterial")
    bsdf = N(nt, "ShaderNodeBsdfPrincipled")
    L(nt, bsdf, "BSDF", out, "Surface")
    tc = N(nt, "ShaderNodeTexCoord")
    feats = []
    # --- grime and rain streaks (noise elongated along Z)
    mp = N(nt, "ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1.0, 1.0, 0.22)
    L(nt, tc, "Object", mp, "Vector")
    nz = N(nt, "ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 4.0
    nz.inputs["Detail"].default_value = 5.0
    nz.inputs["Roughness"].default_value = 0.55
    L(nt, mp, "Vector", nz, "Vector")
    ramp = N(nt, "ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.40
    ramp.color_ramp.elements[1].position = 0.70
    L(nt, nz, "Fac", ramp, "Fac")
    gf = math_(nt, "MULTIPLY", None, streaks)
    L(nt, ramp, "Color", gf, 0)
    col = mix_rgb(nt, base, grime)
    L(nt, gf, "Value", col, 0)
    feats += ["grime", "rain streaks"]
    color_out = (col, 2)
    metal_out = None
    rough_out = None
    # --- scratches: thin bands
    if scratches:
        wv = N(nt, "ShaderNodeTexWave")
        wv.wave_type = "BANDS"
        wv.bands_direction = "Z"
        wv.inputs["Scale"].default_value = 55.0
        wv.inputs["Distortion"].default_value = 1.6
        wv.inputs["Detail"].default_value = 2.0
        L(nt, tc, "Object", wv, "Vector")
        thr = math_(nt, "GREATER_THAN", None, 0.965)
        L(nt, wv, "Fac", thr, 0)
        sn = N(nt, "ShaderNodeTexNoise")
        sn.inputs["Scale"].default_value = 2.5
        L(nt, tc, "Object", sn, "Vector")
        sg = math_(nt, "GREATER_THAN", None, 0.56)
        L(nt, sn, "Fac", sg, 0)
        sm = math_(nt, "MULTIPLY")
        L(nt, thr, "Value", sm, 0)
        L(nt, sg, "Value", sm, 1)
        sc = mix_rgb(nt, None, (0.55, 0.55, 0.53))
        L(nt, color_out[0], color_out[1], sc, 6)
        sm2 = math_(nt, "MULTIPLY", None, 0.8)
        L(nt, sm, "Value", sm2, 0)
        L(nt, sm2, "Value", sc, 0)
        color_out = (sc, 2)
        feats.append("scratches")
    # --- chips: small voronoi spots clustered by noise -> bare aluminium
    if chips and chips > 0:
        vor = N(nt, "ShaderNodeTexVoronoi")
        vor.feature = "F1"
        vor.inputs["Scale"].default_value = 48.0
        L(nt, tc, "Object", vor, "Vector")
        cn = N(nt, "ShaderNodeTexNoise")
        cn.inputs["Scale"].default_value = 3.0
        cn.inputs["Detail"].default_value = 4.0
        L(nt, tc, "Object", cn, "Vector")
        cthr = math_(nt, "MULTIPLY", None, chips * 1.1)  # radius scales with cluster noise
        L(nt, cn, "Fac", cthr, 0)
        lt = math_(nt, "LESS_THAN")
        L(nt, vor, "Distance", lt, 0)
        L(nt, cthr, "Value", lt, 1)
        cc = mix_rgb(nt, None, (0.72, 0.72, 0.70))
        L(nt, color_out[0], color_out[1], cc, 6)
        L(nt, lt, "Value", cc, 0)
        color_out = (cc, 2)
        mm = mix_f(nt, metallic, 1.0)
        L(nt, lt, "Value", mm, 0)
        metal_out = (mm, 0)
        rm = mix_f(nt, rough, 0.42)
        L(nt, lt, "Value", rm, 0)
        rough_out = (rm, 0)
        feats.append("chipped paint exposing metal")
    L(nt, color_out[0], color_out[1], bsdf, "Base Color")
    if metal_out:
        L(nt, metal_out[0], metal_out[1], bsdf, "Metallic")
    else:
        bsdf.inputs["Metallic"].default_value = metallic
    if rough_out:
        L(nt, rough_out[0], rough_out[1], bsdf, "Roughness")
    else:
        bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Coat Weight"].default_value = coat
    bsdf.inputs["Coat Roughness"].default_value = 0.03
    bsdf.inputs["Specular IOR Level"].default_value = 0.5
    if droplets:
        bump = _droplets(nt, tc, scale=100.0, gate=0.54, strength=0.42)
        L(nt, bump, "Normal", bsdf, "Normal")
        L(nt, bump, "Normal", bsdf, "Coat Normal")
        feats.append("rain droplets")
    if coat > 0.5:
        feats.append("wet clearcoat")
    m["finish"] = finish
    FEATURES[name] = feats
    return m


def metal(name, rgb, rough=0.35, aniso=0.5, droplets=True, finish="metal"):
    m, nt = _new(name)
    out = N(nt, "ShaderNodeOutputMaterial")
    b = N(nt, "ShaderNodeBsdfPrincipled")
    L(nt, b, "BSDF", out, "Surface")
    tc = N(nt, "ShaderNodeTexCoord")
    nz = N(nt, "ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 18.0
    nz.inputs["Detail"].default_value = 6.0
    L(nt, tc, "Object", nz, "Vector")
    col = mix_rgb(nt, rgb, tuple(c * 0.7 for c in rgb))
    L(nt, nz, "Fac", col, 0)
    L(nt, col, 2, b, "Base Color")
    b.inputs["Metallic"].default_value = 1.0
    r = mix_f(nt, rough * 0.7, rough * 1.4)
    L(nt, nz, "Fac", r, 0)
    L(nt, r, 0, b, "Roughness")
    b.inputs["Anisotropic"].default_value = aniso
    b.inputs["Coat Weight"].default_value = 0.6
    b.inputs["Coat Roughness"].default_value = 0.05
    feats = ["scuffs"]
    if droplets:
        bump = _droplets(nt, tc, scale=90.0)
        L(nt, bump, "Normal", b, "Normal")
        L(nt, bump, "Normal", b, "Coat Normal")
        feats.append("rain droplets")
    m["finish"] = finish
    FEATURES[name] = feats
    return m


def rubber(name):
    m, nt = _new(name)
    out = N(nt, "ShaderNodeOutputMaterial")
    b = N(nt, "ShaderNodeBsdfPrincipled")
    L(nt, b, "BSDF", out, "Surface")
    tc = N(nt, "ShaderNodeTexCoord")
    nz = N(nt, "ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 40.0
    L(nt, tc, "Object", nz, "Vector")
    col = mix_rgb(nt, (0.015, 0.015, 0.016), (0.05, 0.05, 0.05))
    L(nt, nz, "Fac", col, 0)
    L(nt, col, 2, b, "Base Color")
    b.inputs["Roughness"].default_value = 0.42
    b.inputs["Specular IOR Level"].default_value = 0.6
    b.inputs["Coat Weight"].default_value = 0.55
    b.inputs["Coat Roughness"].default_value = 0.08
    bump = _droplets(nt, tc, scale=70.0)
    L(nt, bump, "Normal", b, "Normal")
    L(nt, bump, "Normal", b, "Coat Normal")
    m["finish"] = "black rubber (wet)"
    FEATURES[name] = ["wet rubber", "rain droplets"]
    return m


def smoked_glass(name):
    m, nt = _new(name)
    out = N(nt, "ShaderNodeOutputMaterial")
    b = N(nt, "ShaderNodeBsdfPrincipled")
    L(nt, b, "BSDF", out, "Surface")
    b.inputs["Base Color"].default_value = (0.012, 0.012, 0.016, 1)
    b.inputs["Metallic"].default_value = 0.0
    b.inputs["Roughness"].default_value = 0.02
    b.inputs["IOR"].default_value = 1.45
    b.inputs["Specular IOR Level"].default_value = 1.0
    b.inputs["Alpha"].default_value = 0.72
    b.inputs["Coat Weight"].default_value = 1.0
    b.inputs["Coat Roughness"].default_value = 0.03
    tc = N(nt, "ShaderNodeTexCoord")
    bump = _droplets(nt, tc, scale=80.0, gate=0.66, strength=0.22)
    L(nt, bump, "Normal", b, "Normal")
    L(nt, bump, "Normal", b, "Coat Normal")
    m.surface_render_method = "BLENDED"
    m.show_transparent_back = False
    m.use_backface_culling = False
    m["finish"] = "smoked glass"
    FEATURES[name] = ["dark tint (72% opaque)", "rain droplets", "interior faintly visible through the tint"]
    return m


def emission(name, rgb, strength, finish="LED emitter"):
    m, nt = _new(name)
    out = N(nt, "ShaderNodeOutputMaterial")
    e = N(nt, "ShaderNodeEmission")
    e.inputs["Color"].default_value = (*rgb, 1)
    e.inputs["Strength"].default_value = strength
    L(nt, e, "Emission", out, "Surface")
    m["finish"] = finish
    return m


def plain(name, rgb, rough=0.6, metallic=0.0, finish="matte", spec=0.5):
    m, nt = _new(name)
    out = N(nt, "ShaderNodeOutputMaterial")
    b = N(nt, "ShaderNodeBsdfPrincipled")
    L(nt, b, "BSDF", out, "Surface")
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Specular IOR Level"].default_value = spec
    m["finish"] = finish
    return m


def asphalt_wet(name):
    m, nt = _new(name)
    out = N(nt, "ShaderNodeOutputMaterial")
    b = N(nt, "ShaderNodeBsdfPrincipled")
    L(nt, b, "BSDF", out, "Surface")
    tc = N(nt, "ShaderNodeTexCoord")
    fine = N(nt, "ShaderNodeTexNoise")
    fine.inputs["Scale"].default_value = 14.0
    fine.inputs["Detail"].default_value = 9.0
    L(nt, tc, "Object", fine, "Vector")
    col = mix_rgb(nt, (0.012, 0.012, 0.014), (0.045, 0.045, 0.05))
    L(nt, fine, "Fac", col, 0)
    L(nt, col, 2, b, "Base Color")
    pud = N(nt, "ShaderNodeTexNoise")
    pud.inputs["Scale"].default_value = 0.35
    pud.inputs["Detail"].default_value = 4.0
    L(nt, tc, "Object", pud, "Vector")
    pr = N(nt, "ShaderNodeValToRGB")
    pr.color_ramp.elements[0].position = 0.45
    pr.color_ramp.elements[1].position = 0.58
    L(nt, pud, "Fac", pr, "Fac")
    r = mix_f(nt, 0.32, 0.04)
    L(nt, pr, "Color", r, 0)
    L(nt, r, 0, b, "Roughness")
    b.inputs["Specular IOR Level"].default_value = 0.7
    b.inputs["Coat Weight"].default_value = 1.0
    b.inputs["Coat Roughness"].default_value = 0.02
    bump = N(nt, "ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.12
    bump.inputs["Distance"].default_value = 0.02
    L(nt, fine, "Fac", bump, "Height")
    L(nt, bump, "Normal", b, "Normal")
    m["finish"] = "wet asphalt"
    return m


def decal_mat(name, image, wet=True):
    m, nt = _new(name)
    out = N(nt, "ShaderNodeOutputMaterial")
    b = N(nt, "ShaderNodeBsdfPrincipled")
    L(nt, b, "BSDF", out, "Surface")
    t = N(nt, "ShaderNodeTexImage")
    t.image = image
    t.extension = "CLIP"
    L(nt, t, "Color", b, "Base Color")
    L(nt, t, "Alpha", b, "Alpha")
    b.inputs["Roughness"].default_value = 0.55
    b.inputs["Coat Weight"].default_value = 0.35 if wet else 0.0
    b.inputs["Coat Roughness"].default_value = 0.03
    m.surface_render_method = "BLENDED"
    m.use_backface_culling = True
    m["finish"] = "printed marking"
    return m


def sign_mat(name, image, strength=14.0):
    m, nt = _new(name)
    out = N(nt, "ShaderNodeOutputMaterial")
    b = N(nt, "ShaderNodeBsdfPrincipled")
    L(nt, b, "BSDF", out, "Surface")
    t = N(nt, "ShaderNodeTexImage")
    t.image = image
    t.extension = "CLIP"
    b.inputs["Base Color"].default_value = (0, 0, 0, 1)
    L(nt, t, "Color", b, "Emission Color")
    b.inputs["Emission Strength"].default_value = strength
    L(nt, t, "Alpha", b, "Alpha")
    m.surface_render_method = "BLENDED"
    m.use_backface_culling = True
    m["finish"] = "neon sign"
    return m


def building(name, seed=0.0, rowh=1.9, colw=1.5):
    m, nt = _new(name)
    out = N(nt, "ShaderNodeOutputMaterial")
    b = N(nt, "ShaderNodeBsdfPrincipled")
    L(nt, b, "BSDF", out, "Surface")
    b.inputs["Base Color"].default_value = (0.03, 0.033, 0.04, 1)
    b.inputs["Roughness"].default_value = 0.75
    tc = N(nt, "ShaderNodeTexCoord")
    sep = N(nt, "ShaderNodeSeparateXYZ")
    L(nt, tc, "Object", sep, "Vector")
    rz = math_(nt, "MULTIPLY", None, 1 / rowh)
    L(nt, sep, "Z", rz, 0)
    fz = math_(nt, "FRACT")
    L(nt, rz, "Value", fz, 0)
    lz = math_(nt, "LESS_THAN", None, 0.5)
    L(nt, fz, "Value", lz, 0)
    ad = math_(nt, "ADD")
    L(nt, sep, "X", ad, 0)
    L(nt, sep, "Y", ad, 1)
    rc = math_(nt, "MULTIPLY", None, 1 / colw)
    L(nt, ad, "Value", rc, 0)
    fc = math_(nt, "FRACT")
    L(nt, rc, "Value", fc, 0)
    lc = math_(nt, "LESS_THAN", None, 0.55)
    L(nt, fc, "Value", lc, 0)
    win = math_(nt, "MULTIPLY")
    L(nt, lz, "Value", win, 0)
    L(nt, lc, "Value", win, 1)
    # one random value per window cell
    flz = math_(nt, "FLOOR")
    L(nt, rz, "Value", flz, 0)
    flc = math_(nt, "FLOOR")
    L(nt, rc, "Value", flc, 0)
    comb = N(nt, "ShaderNodeCombineXYZ")
    L(nt, flz, "Value", comb, "X")
    L(nt, flc, "Value", comb, "Y")
    comb.inputs["Z"].default_value = seed
    wn = N(nt, "ShaderNodeTexWhiteNoise")
    wn.noise_dimensions = "3D"
    L(nt, comb, "Vector", wn, "Vector")
    lg = math_(nt, "GREATER_THAN", None, 0.62)
    L(nt, wn, "Value", lg, 0)
    e = math_(nt, "MULTIPLY")
    L(nt, win, "Value", e, 0)
    L(nt, lg, "Value", e, 1)
    e2 = math_(nt, "MULTIPLY")
    L(nt, e, "Value", e2, 0)
    L(nt, wn, "Value", e2, 1)
    es = math_(nt, "MULTIPLY", None, 4.0)
    L(nt, e2, "Value", es, 0)
    L(nt, es, "Value", b, "Emission Strength")
    wc = mix_rgb(nt, (0.55, 0.85, 1.0), (1.0, 0.72, 0.45))
    wg = math_(nt, "GREATER_THAN", None, 0.8)
    L(nt, wn, "Value", wg, 0)
    L(nt, wg, "Value", wc, 0)
    L(nt, wc, 2, b, "Emission Color")
    m["finish"] = "concrete tower with lit windows"
    return m


def build_all():
    M = {}
    M["crimson"] = worn_paint("crimson_paint", (0.42, 0.018, 0.028), finish="dirty crimson paint")
    M["crimson_dark"] = worn_paint("crimson_paint_dark", (0.30, 0.012, 0.02), streaks=0.8, finish="dirty crimson paint")
    M["graphite"] = worn_paint("graphite_matte", (0.055, 0.057, 0.062), grime=(0.03, 0.028, 0.026), metallic=0.05,
                               rough=0.6, chips=0.04, coat=0.7, finish="matte graphite")
    M["offwhite"] = worn_paint("offwhite_panel", (0.78, 0.74, 0.65), grime=(0.28, 0.26, 0.22), metallic=0.0,
                               rough=0.5, chips=0.06, coat=0.8, streaks=0.75, finish="off-white worn panel")
    M["alu"] = metal("raw_aluminium", (0.86, 0.86, 0.84), rough=0.26, finish="raw aluminium")
    M["steel_dark"] = metal("dark_steel", (0.35, 0.35, 0.36), rough=0.5, droplets=False, finish="dark steel")
    M["rim"] = metal("rim_metal", (0.25, 0.25, 0.27), rough=0.45, droplets=False, finish="dark metal rim")
    M["black"] = plain("matte_black", (0.012, 0.012, 0.013), rough=0.7, finish="matte black")
    M["grime"] = plain("diffuser_grime", (0.03, 0.026, 0.02), rough=1.0, finish="dirt-caked graphite", spec=0.05)
    M["mud"] = plain("brown_mud", (0.13, 0.10, 0.07), rough=1.0, finish="brown dirt caking", spec=0.05)
    M["hose_orange"] = plain("hose_orange", (0.75, 0.28, 0.04), rough=0.55, finish="orange hydraulic hose")
    M["hose_yellow"] = plain("hose_yellow", (0.8, 0.62, 0.08), rough=0.55, finish="yellow brake line")
    M["rubber_hose"] = plain("rubber_hose", (0.05, 0.05, 0.052), rough=0.7, finish="black rubber hose")
    M["rubber"] = rubber("tire_rubber")
    M["glass"] = smoked_glass("smoked_glass")
    M["emit_white"] = emission("led_white", (1.0, 1.0, 1.0), 40.0, "white LED emitter")
    M["emit_red"] = emission("led_red", (1.0, 0.04, 0.03), 9.0, "red LED emitter")
    M["emit_cyan"] = emission("led_cyan", (0.08, 0.85, 1.0), 14.0, "cyan LED emitter")
    M["emit_amber"] = emission("led_amber", (1.0, 0.55, 0.08), 25.0, "amber LED emitter")
    M["emit_blue"] = emission("underglow_blue", (0.15, 0.45, 1.0), 6.0, "cold-blue underglow emitter")
    M["asphalt"] = asphalt_wet("wet_asphalt")
    M["concrete"] = plain("concrete", (0.05, 0.052, 0.058), rough=0.85, finish="dark concrete")
    M["building"] = building("tower_windows", seed=0.0)
    M["building2"] = building("tower_windows_2", seed=7.3)
    M["interior"] = plain("cockpit_interior", (0.07, 0.07, 0.075), rough=0.8, finish="dark interior")
    M["helmet"] = plain("helmet_grey", (0.30, 0.30, 0.32), rough=0.35, finish="pale grey helmet")
    return M
