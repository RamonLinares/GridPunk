"""Original K89-R body, authored in Blender; game axes +Z forward, +Y up.
Blender converts (x,-z,y) to glTF (x,y,z). Keep wheel support meshes in runtime.
"""
import bpy, math, random, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/cars/neon';OUT.mkdir(parents=True,exist_ok=True)
ASSET=ROOT/'assets/neon-car';ASSET.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
random.seed(198911)
M={}
for name,color,metal,rough,em in [
 ('Paint',(.24,.024,.036),.32,.40,0),('Carbon',(.014,.022,.026),.40,.55,0),
 ('Alloy',(.32,.36,.35),.82,.37,0),('Recess',(.003,.006,.008),.15,.77,0),
 ('Glass',(.008,.028,.038),.55,.14,0),('Copper',(.25,.135,.065),.78,.38,0),
 ('Ivory',(.62,.61,.51),.16,.59,0),('Amber',(.7,.31,.06),.25,.3,1.5),
 ('Headlamp',(.60,.78,.86),.2,.18,3),('Brake',(.5,.018,.01),.2,.3,1),
 ('Cyan',(.10,.4,.48),.2,.3,1.1)]:
 m=bpy.data.materials.new('K89_'+name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=em
 if name in ['Paint','Glass']:p.inputs['Coat Weight'].default_value=.28 if name=='Paint' else .7;p.inputs['Coat Roughness'].default_value=.3 if name=='Paint' else .12
 M[name]=m
objects=[]
def P(p):x,y,z=p;return(x,-z,y)
def mesh(name,v,f,mat,bevel=0,smooth=False):
 g=bpy.data.meshes.new(name);g.from_pydata([P(p)for p in v],[],f);g.update();o=bpy.data.objects.new(name,g);bpy.context.collection.objects.link(o);o.data.materials.append(M[mat]);objects.append(o)
 bpy.context.view_layer.objects.active=o;o.select_set(True)
 # Recalculate all closed shells, preserving outward normal orientation.
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
 if bevel:
  mod=o.modifiers.new('Machined edge radii','BEVEL');mod.width=bevel;mod.segments=3;bpy.ops.object.modifier_apply(modifier=mod.name)
 if smooth:
  for p in o.data.polygons:p.use_smooth=True
  mod=o.modifiers.new('Surface normals','WEIGHTED_NORMAL');mod.keep_sharp=True;mod.weight=40;bpy.ops.object.modifier_apply(modifier=mod.name)
 o.select_set(False);return o

def box(name,pos,size,mat,bevel=.01):
 x,y,z=pos;w,h,d=size;v=[(x+sx*w/2,y+sy*h/2,z+sz*d/2)for sz in[-1,1]for sy in[-1,1]for sx in[-1,1]]
 return mesh(name,v,[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)],mat,bevel,True)
def rod(name,a,b,r,mat,sides=10):
 a,b=Vector(a),Vector(b);d=(b-a).normalized();u=d.cross(Vector((0,1,0)))
 if u.length<.01:u=d.cross(Vector((1,0,0)))
 u.normalize();v=d.cross(u);vs=[tuple(p+r*(u*math.cos(i*math.tau/sides)+v*math.sin(i*math.tau/sides)))for p in[a,b]for i in range(sides)]
 return mesh(name,vs,[(i,(i+1)%sides,(i+1)%sides+sides,i+sides)for i in range(sides)]+[tuple(reversed(range(sides))),tuple(range(sides,2*sides))],mat,0,True)
def pipe(name,points,r,mat):
 curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.resolution_u=8;curve.bevel_depth=r;curve.bevel_resolution=2;spline=curve.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
 for b,p in zip(spline.bezier_points,points):b.co=P(p);b.handle_left_type='AUTO';b.handle_right_type='AUTO'
 o=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(o);o.data.materials.append(M[mat]);objects.append(o);bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False);return o

def interpolate(rows,steps=5):
 output=[]
 for i in range(len(rows)-1):
  a,b,c,d=rows[max(0,i-1)],rows[i],rows[i+1],rows[min(len(rows)-1,i+2)]
  for j in range(steps):
   t=j/steps;output.append([.5*((2*bb)+(-aa+cc)*t+(2*aa-5*bb+4*cc-dd)*t*t+(-aa+3*bb-3*cc+dd)*t*t*t)for aa,bb,cc,dd in zip(a,b,c,d)])
 return output+[rows[-1]]
def loft(name,stations,mat,x=0):
 # z, half width, bottom, top. Chamfered sheet-metal shoulders, with curvature
 # in the longitudinal sections rather than a stack of disconnected boxes.
 rows=interpolate(stations);v=[]
 for z,w,b,t in rows:
  h=t-b
  for xx,yy in [(-.78,b),(-1,b+h*.2),(-1,t-h*.25),(-.82,t),(.82,t),(1,t-h*.25),(1,b+h*.2),(.78,b)]:v.append((x+xx*w,yy,z))
 f=[]
 for i in range(len(rows)-1):
  for j in range(8):f.append((i*8+j,i*8+(j+1)%8,(i+1)*8+(j+1)%8,(i+1)*8+j))
 f.extend([tuple(reversed(range(8))),tuple(range((len(rows)-1)*8,len(rows)*8))]);return mesh(name,v,f,mat,.014,True)
def cut(o,cutter):
 bpy.context.view_layer.objects.active=o;mod=o.modifiers.new('Machined opening','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
def text(name,body,pos,size,mat,rotation=None):
 c=bpy.data.curves.new(name,'FONT');c.body=body;c.align_x='CENTER';c.size=size;c.extrude=.0005;c.space_character=1.1;o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.location=P(pos)
 if rotation:o.rotation_euler=rotation
 o.data.materials.append(M[mat]);bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False);objects.append(o);return o

# SILHOUETTE: elongated narrow open-wheel bow, a broad continuous rear body,
# recessed waist and an open cockpit sunk into the monocoque.
loft('keel',[[-2.46,.76,.105,.22],[-1.9,1.12,.105,.22],[-.5,1.12,.105,.22],[.65,.8,.11,.22],[1.15,.38,.11,.22],[2.91,.29,.14,.22]],'Carbon')
monocoque=loft('monocoque',[[-1.5,.3,.23,.55],[-.88,.45,.24,.68],[0,.47,.23,.68],[.85,.4,.23,.60],[1.6,.32,.23,.49],[2.5,.24,.20,.33],[2.99,.18,.18,.255]],'Paint')
for side in[-1,1]:
 pod=loft('continuous_rear_body',[[ -2.39,.27,.23,.43],[-2.05,.43,.24,.73],[-1.62,.49,.24,.94],[-1.18,.47,.24,.91],[-.35,.40,.22,.72],[.47,.35,.22,.65],[.91,.15,.23,.43]],'Paint',side*.78)
 # Real wheel-well opening; rear upper tyre disappears into a continuous haunch.
 bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=.457,depth=.9,location=P((side*1.05,.4,-1.6)),rotation=(0,math.pi/2,0));cut(pod,bpy.context.object)
 # A cut-in recessed radiator inlet follows the angled front shoulder.
 intake=box('radiator_recess',(side*.79,.43,.57),(.47,.24,.54),'Recess',.05)
 # Pocket cut through skin reveals the recessed throat and radiator instead of
 # gluing a bright grille onto the body. Re-add the throat behind the opening.
 cutter=box('inlet_cutter',(side*.80,.51,.69),(.45,.19,.58),'Recess',.025);objects.remove(cutter);cut(pod,cutter)
 for k in range(9):rod('radiator_core',(side*.80+(k-4)*.045,.40,.70),(side*.80+(k-4)*.045,.54,.65),.008,'Alloy',6)
 # Front-edge chamfer flows into the floor extension, not a separate truck bumper.
 loft('underbody_vane',[[-1.09,.075,.16,.28],[.30,.09,.15,.26],[.94,.028,.17,.20]],'Carbon',side*1.10)
 # Upper haunch outlet: a recessed carbon cassette with angled individual slats.
 box('vent_cassette',(side*.86,.883,-1.00),(.42,.032,.42),'Recess',.015)
 for k in range(7):box('haunch_louver',(side*.86,.900,-1.17+k*.055),(.40,.014,.024),'Carbon',.006)
 # Wraparound rear light bars, inset below the large upper shoulder.
 box('rear_lamp_recess',(side*.75,.51,-2.364),(.56,.108,.065),'Recess',.02)
 for k in range(9):box('brake_cell',(side*.75+(k-4)*.052,.515,-2.405),(.038,.038,.012),'Brake',.004)
 # Flush rectangular headlamps inside the front wing shoulders.
 loft('front_wing_sponson',[[2.35,.2,.16,.29],[2.65,.22,.15,.32],[2.85,.19,.15,.29]],'Paint',side*.85)
 box('headlamp_recess',(side*.85,.252,2.863),(.30,.073,.019),'Recess',.012)
 for k in range(4):box('headlamp_cell',(side*.85+(k-1.5)*.066,.252,2.876),(.054,.037,.009),'Headlamp',.004)
 # Structural endplate: swept, rounded corners and a single off-white datum.
 v=[(side*1.18,y,z)for z,y in[(2.94,.13),(2.92,.34),(2.49,.38),(2.30,.21),(2.31,.13)]];o=mesh('splitter_endplate',v,[tuple(range(5))],'Carbon');mod=o.modifiers.new('Plate thickness','SOLIDIFY');mod.thickness=.025;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
 rod('front_status',(side*1.195,.24,2.57),(side*1.195,.24,2.75),.008,'Amber',6)
 # Suspension mounts embedded in chassis, brushed pushrods and joint sleeves.
 for rear,z in[(False,1.6),(True,-1.6)]:
  anchor=side*(.24 if not rear else .27);hub=side*(.8 if not rear else .81)
  for upper in[False,True]:
   for dz in[-.25,.25]:rod('wishbone',(anchor,.39 if upper else .25,z+dz),(hub,(.36 if not rear else .4)+(.085 if upper else -.08),z),.019,'Carbon',8)
  rod('pushrod',(anchor,.48,z-.23),(hub,.34 if not rear else .38,z),.023,'Alloy');rod('damper',(anchor,.48,z-.23),(side*.45,.44,z-.14),.042,'Copper')
  pipe('hydraulic_hose',[(anchor,.34,z+.2),(side*.55,.28,z+.16),(hub,.34,z+.06)],.009,'Recess')
loft('front_splitter',[[2.32,1.03,.145,.19],[2.61,1.20,.13,.19],[2.92,1.16,.13,.17]],'Carbon')
# Cockpit is an actual cut-out in the tub, not a black dome laid over the skin.
# The rim follows the deck; only the short front wind deflector rises above it.
segments=64
cx,cz,rx,rz=0,.04,.335,.82
def rim_point(a,scale=1):
 z=cz+rz*math.cos(a)*scale
 return (rx*math.sin(a)*scale,.687-.085*max(0,z),z)
v=[(rx*math.sin(i*math.tau/segments),y,cz+rz*math.cos(i*math.tau/segments))for y in[.305,1.4]for i in range(segments)]
f=[tuple(reversed(range(segments))),tuple(range(segments,segments*2))]+[(i,(i+1)%segments,(i+1)%segments+segments,i+segments)for i in range(segments)]
cutter=mesh('cockpit_cutter',v,f,'Recess');cut(monocoque,cutter)
# Dark inner lining runs down to a closed footwell, with a narrow rolled lip.
v=[]
for y in[None,.315]:
 for i in range(segments):
  x,top,z=rim_point(i*math.tau/segments,.985);v.append((x,top if y is None else y,z))
f=[(i,(i+1)%segments,(i+1)%segments+segments,i+segments)for i in range(segments)]+[tuple(range(segments,segments*2))]
well=mesh('cockpit_well',v,f,'Recess')
# Open well must face into the cockpit, including the floor.
for polygon in well.data.polygons:
 centre=polygon.center;normal=polygon.normal
 if (len(polygon.vertices)>4 and normal.z<0) or (len(polygon.vertices)==4 and normal.dot(Vector((-centre.x,-cz-centre.y,0)))<0):polygon.flip()
well.data.update()
pipe('cockpit_coaming',[rim_point(i*math.tau/32,1.035)for i in range(33)],.022,'Paint')
# Short, raked crescent screen at the forward edge, leaving the opening exposed.
v=[];screen_steps=24
for row in[0,1]:
 for i in range(screen_steps+1):
  a=-1.16+2.32*i/screen_steps;x,y,z=rim_point(a)
  h=.115*math.cos(a/1.16*math.pi/2)
  v.append((x*(1-.04*row),y+.012+h*row,z-.055*row))
f=[(i,i+1,i+screen_steps+2,i+screen_steps+1)for i in range(screen_steps)]
canopy=mesh('K89_Windscreen',v,f,'Glass',0,True)
# A compact padded headrest sits within the rear lip, below the rear haunches.
loft('headrest',[[-.75,.08,.43,.67],[-.59,.19,.37,.79],[-.43,.19,.34,.77],[-.30,.14,.33,.57]],'Carbon')
loft('engine_spine',[[-2.0,.16,.34,.49],[-1.44,.23,.35,.67],[-.96,.21,.38,.73],[-.79,.24,.45,.82]],'Carbon')
# Wing: a real airfoil section, swept vertical fences, twin skeletal pylons.
for side in[-1,1]:
 rod('wing_pylon',(side*.28,.40,-1.91),(side*.59,1.0,-2.11),.05,'Carbon')
 rod('wing_brace',(side*.61,.35,-2.25),(side*.59,1.,-2.11),.023,'Alloy')
 outline=[(-2.48,.78),(-2.49,1.16),(-2.05,1.20),(-1.77,.99),(-1.85,.71)]
 v=[(side*1.15,y,z)for z,y in outline];o=mesh('wing_fence',v,[tuple(range(5))],'Paint');mod=o.modifiers.new('Riveted sheet','SOLIDIFY');mod.thickness=.032;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
 rod('wing_datum',(side*1.172,1.1,-2.34),(side*1.172,1.1,-2.08),.009,'Ivory')
# Airfoil in the YZ plane, extruded across the span.
outline=[(-2.38,1.03),(-2.22,1.015),(-1.84,1.06),(-1.81,1.035),(-1.93,.99),(-2.24,.975),(-2.38,1.008)]
v=[(x,y,z)for x in[-1.13,1.13]for z,y in outline];n=len(outline);f=[tuple(range(n)),tuple(reversed(range(n,n*2)))]+[(i,(i+1)%n,(i+1)%n+n,i+n)for i in range(n)];mesh('wing_mainplane',v,f,'Carbon',.008,True)
flap=box('K89_Flap',(0,1.095,-2.39),(2.2,.046,.20),'Paint',.014)
# Set the trim hinge as its actual origin for runtime rotation.
bpy.context.scene.cursor.location=P((0,1.10,-2.48));bpy.context.view_layer.objects.active=flap;flap.select_set(True);bpy.ops.object.origin_set(type='ORIGIN_CURSOR');flap.select_set(False)
# Rear service bay and diffuser: depth, supported tubes and dirt-trapping channels.
loft('gearbox',[[-2.39,.19,.23,.46],[-1.74,.29,.24,.57],[-1.1,.26,.28,.63]],'Alloy')
for side in[-1,1]:
 pipe('exhaust',[(side*.16,.53,-1.35),(side*.40,.48,-1.88),(side*.34,.46,-2.52)],.064,'Alloy')
 rod('exhaust_black_core',(side*.34,.46,-2.52),(side*.34,.46,-2.529),.052,'Recess')
 pipe('coolant',[(side*.3,.61,-1.2),(side*.48,.69,-1.32),(side*.5,.44,-2.12)],.025,'Copper')
 for k in range(8):box('engine_fin',(side*.29,.616,-1.11-k*.07),(.19,.022,.032),'Recess',.002)
loft('diffuser',[[-2.48,.74,.16,.31],[-1.76,.78,.11,.17]],'Carbon')
for x in[-.65,-.43,-.21,0,.21,.43,.65]:
 v=[(x,.11,-1.8),(x,.11,-2.48),(x,.30,-2.48),(x,.15,-1.8)];o=mesh('diffuser_vane',v,[(0,1,2,3)],'Recess');mod=o.modifiers.new('Vane thickness','SOLIDIFY');mod.thickness=.016;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
# Deliberate panel splits, Dzus fasteners and asymmetric access covers.
for side in[-1,1]:
 pipe('pod_seam',[(side*1.085,.49,.3),(side*1.168,.49,-.34),(side*1.204,.52,-.78)],.007,'Recess')
 for k in range(7):rod('dzus',(side*1.171,.41,-.48+k*.10),(side*1.181,.41,-.48+k*.10),.011,'Alloy',6)
 box('recessed_service_plate',(side*.78,.729,-.40),(.26,.012,.32),'Carbon',.025)
 for x in[-.10,.10]:
  for z in[-.12,.12]:rod('plate_fastener',(side*.78+x,.736,-.4+z),(side*.78+x,.742,-.4+z),.01,'Alloy',6)
 rod('pod_status',(side*1.175,.34,-.45),(side*1.175,.34,-.20),.006,'Cyan',6)
# Modelled restrained lettering: a serial and a works marque. Native text is
# converted to mesh, so no unsupported typeface loading is needed in the game.
text('nose_number','89',(0,.483,1.67),.19,'Ivory',(.165,0,0))
# Font lies in Blender XY (game XZ), facing up. Keep text just above local skin.
# Side works marks are conformed to this mesh by the runtime.
text('tail_serial','K89-R  //  06',(0,.632,-1.22),.055,'Ivory')
# Small raw-metal repaired patch at rear shoulder, with two visible fasteners.
box('repair_patch',(-.95,.888,-1.01),(.13,.006,.20),'Alloy',.012)
for z in[-1.08,-.94]:rod('repair_rivet',(-.95,.89,z),(-.95,.901,z),.012,'Recess',6)

# Merge all static body objects by material, retaining glass, flap and brake bank.
bpy.ops.object.select_all(action='DESELECT')
for mat in M:
 pieces=[o for o in list(bpy.context.scene.objects)if o.type=='MESH' and o!=flap and o!=canopy and o.data.materials and o.data.materials[0]==M[mat]]
 if not pieces:continue
 for o in pieces:o.select_set(True)
 bpy.context.view_layer.objects.active=pieces[0];bpy.ops.object.join();o=bpy.context.object;o.name='K89_'+('BrakeBank' if mat=='Brake' else mat);bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
 o.select_set(False)
# UVs for metre-scale wear; procedural textures will be shared in the runtime.
for o in list(bpy.context.scene.objects):
 if o.type!='MESH':continue
 bpy.context.view_layer.objects.active=o;o.select_set(True)
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.0,island_margin=.015);bpy.ops.object.mode_set(mode='OBJECT');o.select_set(False)
# Save native editable source and export only the authored body, with GLTF normals.
bpy.ops.wm.save_as_mainfile(filepath=str(ASSET/'k89-r.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'k89-r.glb'),export_format='GLB',export_yup=True,export_apply=True)
triangles=0
for o in bpy.context.scene.objects:
 if o.type=='MESH':o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
(OUT/'k89-r.json').write_text(json.dumps({'triangles':triangles,'meshes':len([o for o in bpy.context.scene.objects if o.type=='MESH']),'bytes':(OUT/'k89-r.glb').stat().st_size,'source':'scripts/blender/build_neon_car.py','axis':'glTF Y-up, +Z forward'},indent=2))
print('K89_REPORT',triangles,(OUT/'k89-r.glb').stat().st_size)
