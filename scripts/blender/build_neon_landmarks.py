"""Original Blender-authored cyberpunk kit. Run: blender -b -t 2 -P this_file."""
import bpy, math, random, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/circuits/neon-models'; OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
M={}
def mat(name,color,metal=0,rough=.65,emission=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if emission:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
 M[name]=m
for args in [('Armor',(.085,.12,.135),.55,.62),('Edge',(.22,.27,.28),.65,.46),('Concrete',(.15,.18,.175),.05,.9),('Copper',(.25,.16,.12),.65,.6),('Glass',(.028,.062,.08),.35,.28),('Warm',(.72,.43,.19),0,.5,1.1),('Pearl',(.62,.7,.69),0,.5,.65),('Cyan',(.05,.62,.83),.1,.4,2.2),('Magenta',(.72,.018,.24),.1,.4,2.3),('AdPortrait',(1,1,1),0,.6),('AdVertical',(1,1,1),0,.6),('AdStrip',(1,1,1),0,.6)]:mat(*args)
B={};collection=None;variants=[]
def face(m,verts,faces,uv=None):
 b=B.setdefault(m,[[],[],[]]);n=len(b[0]);b[0].extend(verts);b[1].extend([tuple(n+i for i in f) for f in faces]);b[2].extend(uv or [[(0,0),(1,0),(1,1),(0,1)][:len(f)] for f in faces])
def box(m,x,y,z,w,d,h):
 v=[(x+sx*w/2,y+sy*d/2,z+sz*h/2)for sz in[-1,1]for sy in[-1,1]for sx in[-1,1]]
 uv=None
 if m in ['Warm','Pearl']:
  tile=random.randrange(8);u=tile%4;vv=tile//4
  uv=[[(u/4,vv/2),((u+1)/4,vv/2),((u+1)/4,(vv+1)/2),(u/4,(vv+1)/2)]]*6
 face(m,v,[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)],uv)
def prism(m,plan,z,h):
 n=len(plan);v=[(x,y,t)for t in[z,z+h]for x,y in plan]
 face(m,v,[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n)for i in range(n)],[[ (0,0)]*n,[ (0,0)]*n]+[[(0,0),(1,0),(1,1),(0,1)]]*n)
def beam(m,a,b,r=.15,sides=8):
 a,b=Vector(a),Vector(b);axis=(b-a).normalized();u=axis.cross(Vector((0,0,1)))
 if u.length<.01:u=axis.cross(Vector((0,1,0)))
 u.normalize();v=axis.cross(u);verts=[tuple(p+r*(u*math.cos(i*math.tau/sides)+v*math.sin(i*math.tau/sides)))for p in[a,b]for i in range(sides)]
 face(m,verts,[tuple(reversed(range(sides))),tuple(range(sides,2*sides))]+[(i,(i+1)%sides,(i+1)%sides+sides,i+sides)for i in range(sides)],[[ (0,0)]*sides,[ (0,0)]*sides]+[[(0,0),(1,0),(1,1),(0,1)]]*sides)
def cable(points,r=.08,m='Copper'):
 for a,b in zip(points,points[1:]):beam(m,a,b,r,6)
def ad(m,x,y,z,w,h):
 box('Armor',x,y+.35,z,w+1.6,.7,h+1.4)
 face(m,[(x-w/2,y-.04,z-h/2),(x+w/2,y-.04,z-h/2),(x+w/2,y-.04,z+h/2),(x-w/2,y-.04,z+h/2)],[(0,1,2,3)])
 for side in[-1,1]:
  box('Edge',x+side*(w/2+.6),y-.05,z,.4,1.0,h+2)
  box('Edge',x,y-.05,z+side*(h/2+.65),w+1.8,1.0,.35)
  for zz in range(int(z-h/2),int(z+h/2),5):box('Armor',x+side*(w/2+1),y+.1,zz,.9,1.2,.3)
def floors(x,y,w,d,z0,count,fh=4,style=0):
 # Slabs project 1.4m beyond setback walls. Each floor has real open bays,
 # structural columns, interior partitions, and alternating lit occupancy.
 plan=[(-w/2+1,-d/2), (w/2-1,-d/2),(w/2,-d/2+1),(w/2,d/2-1),(w/2-1,d/2),(-w/2+1,d/2),(-w/2,d/2-1),(-w/2,-d/2+1)]
 for row in range(count):
  z=z0+row*fh
  prism('Armor',[(x+a,y+b)for a,b in plan],z,.38)
  # Core leaves continuous 2.4m deep perimeter loggias.
  box('Concrete',x,y+.9,z+fh/2,w-4.8,d-5.6,fh-.4)
  for side in[-1,1]:
   for col,u in enumerate(range(-int(w/2)+2,int(w/2),4)):
    yy=y+side*(d/2-2.5);lit=random.random()>.37
    box(random.choice(['Warm','Pearl']) if lit else 'Glass',x+u,yy,z+2,3.25,.08,2.6 if style!=1 else 1.65)
    box('Edge',x+u-1.75,y+side*(d/2-.5),z+fh/2,.18,.25,fh)
    if lit:
     box('Armor',x+u,yy-side*.12,z+1.45,3.25,.2,.13)
     if (col+row)%3==0:
      for k in range(5):box('Armor',x+u,yy-side*.14,z+1.2+k*.3,3.2,.12,.075)
     elif (col+row)%3==1:box('Glass',x+u+.7,yy-side*.16,z+1.9,.9,.13,2.5)
    if style==2 or row%3==1:
     beam('Edge',(x+u-1.9,y+side*(d/2-.1),z+1.1),(x+u+1.9,y+side*(d/2-.1),z+1.1),.05,4)
     beam('Edge',(x+u,y+side*(d/2-.1),z+.4),(x+u,y+side*(d/2-.1),z+1.1),.05,4)
   for v in range(-int(d/2)+3,int(d/2)-2,4):
    xx=x+side*(w/2-2.3);lit=random.random()>.45
    box('Warm' if lit else 'Glass',xx,y+v,z+2,.08,3.2,2.6)
    box('Edge',x+side*(w/2-.6),y+v-1.7,z+fh/2,.25,.2,fh)
  if row%3==0:box('Pearl',x-w*.26,y-d/2+.1,z+.5,w*.35,.15,.08)
def services(w,d,h,accent):
 for x,y in[(-w/2+.6,-d/2+.4),(w/2-.6,-d/2+.4),(-w/2+.6,d/2-.4)]:
  beam('Copper',(x,y,3),(x,y,h),.32)
  for z in range(5,int(h),7):beam('Edge',(x,y,z),(x,y,z+.2),.46)
 cable([(-w/2+1,-d/2-.3,8),(-w/2+1,-d/2-1,10),(w/2-1,-d/2-1,10),(w/2-1,-d/2+.5,14)],.4)
 for x in[-w*.36,w*.34]:
  box('Armor',x,-d/2-1,15,4.4,2.5,4.2)
  # Actual fan rings/blades, recessed inside a housing.
  cy=-d/2-2.3
  pts=[(x+1.6*math.cos(i*math.tau/20),cy,15+1.6*math.sin(i*math.tau/20))for i in range(21)];cable(pts,.14,'Edge')
  for i in range(6):
   a=i*math.tau/6;beam('Edge',(x,cy+.1,15),(x+1.3*math.cos(a),cy+.1,15+1.3*math.sin(a)),.17,4)
  box(accent,x,cy-.1,17.3,3.3,.12,.12)
def finish(name):
 global B
 bpy.ops.object.select_all(action='DESELECT');objs=[]
 for material,(verts,faces,uvs)in B.items():
  mesh=bpy.data.meshes.new(name+'-'+material);mesh.from_pydata(verts,[],faces);mesh.update()
  uv=mesh.uv_layers.new(name='UVMap')
  for poly,coords in zip(mesh.polygons,uvs):
   for i,li in enumerate(poly.loop_indices):uv.data[li].uv=coords[i]
  obj=bpy.data.objects.new(name+'-'+material,mesh);collection.objects.link(obj);obj.data.materials.append(M[material]);obj.select_set(True);objs.append(obj)
  bpy.context.view_layer.objects.active=obj
  modifier=obj.modifiers.new('Triangulated export','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=modifier.name)
 bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True,export_yup=True,export_extras=True)
 variants.append({'name':name,'triangles':sum(len(o.data.polygons) for o in objs),'materials':len(objs),'bytes':(OUT/(name+'.glb')).stat().st_size});B={}
for variant,name in enumerate(['exchange','terraces','split-spire']):
 random.seed(810+variant);collection=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(collection)
 # Base is a pair of supports and a deeply recessed atrium, not a filled cube.
 box('Concrete',0,3,2,34,22,4);floors(0,0,36,30,4,3,4.5,variant)
 if variant==0:
  floors(-9,3,18,26,17.5,14,4,0);floors(10,5,14,24,17.5,17,4,1)
  floors(-7,4,13,21,73.5,6,4,1);floors(10,5,10,18,85.5,5,4,0)
  # Set-back central shaft and three large advertising apertures.
  box('Armor',0,6,49,9,14,65);ad('AdVertical',-1,-12,43,8,43);ad('AdPortrait',11,-9,51,9,39)
  ad('AdStrip',0,-16,8,20,3.5);services(36,30,78,'Magenta')
  for z in[26,49,71]:beam('Edge',(-17,-13,z),(16,-10,z+8),.25)
  for x,z in[(-12,99),(10,108)]:beam('Edge',(x,4,z),(x,4,z+12),.12);box('Magenta',x,4,z+12,.3,.3,.5)
 elif variant==1:
  # Terraced volumes step backward by metres with open decks and outside stairs.
  floors(0,2,34,26,17.5,5,4.2,2);floors(-5,5,24,20,38.5,5,4.2,2);floors(-9,7,15,14,59.5,4,4.2,0)
  floors(12,7,9,13,38.5,7,4,1);services(36,30,36,'Cyan')
  ad('AdPortrait',-11,-12,29,10,21);ad('AdVertical',12,-9,42,5,35);ad('AdStrip',1,-16,8,23,3.5)
  for z,yy in[(18,-14),(39,-10),(60,-3)]:
   for k in range(14):box('Edge',11-k*.65,yy-k*.22,z+k*.24,1.5,1.1,.17)
   beam('Copper',(14,yy, z),(3,yy-3,z+4),.09)
   box('Concrete',-7,yy+1,z+.8,6,1.3,1.2)
 elif variant==2:
  # Twin shafts leave a 9 m wide open slot; crossheads connect them aloft.
  floors(-11,3,13,24,17.5,17,4.4,1);floors(11,6,13,20,17.5,20,4.4,0)
  for z in[30,57,86]:
   box('Armor',0,3,z,13,9,1);box('Glass',0,5,z+2.4,11,.15,3.5);box('Edge',0,3,z+4.5,13,9,.5)
   beam('Copper',(-9,-2,z),(9,-2,z+4),.19)
  services(36,30,74,'Cyan');ad('AdPortrait',-11,-10,49,9,36);ad('AdVertical',11,-6,74,6,43);ad('AdStrip',0,-16,8,22,3.5)
  for x,z in[(-11,96),(11,110)]:beam('Edge',(x,5,z),(x,5,z+15),.16)
 # Entrance arcade and canopy project toward street, with a genuine open foyer.
 for x in[-15,-7,7,15]:box('Edge',x,-15,5,.5,1,10)
 box('Armor',0,-15,3.5,34,5,.55);box('Pearl',0,-16.8,3.18,28,.1,.12)
 finish(name)
# A building-to-building enclosed bridge with truss, windows and underside pipes.
collection=bpy.data.collections.new('skybridge');bpy.context.scene.collection.children.link(collection)
box('Armor',0,0,.3,72,5,.6);box('Armor',0,0,4.6,72,5.5,.5)
for side in[-1,1]:
 box('Glass',0,side*2.3,2.45,72,.1,3.6)
 for x in range(-36,37,4):
  box('Edge',x,side*2.55,2.5,.18,.25,4.6)
  if x<36:beam('Edge',(x,side*2.65,.6),(x+4,side*2.65,4.3),.12,4)
 box('Pearl',0,side*2.15,3.7,69,.08,.09)
 beam('Copper',(-36,side*1.4,-.35),(36,side*1.4,-.35),.28)
ad('AdStrip',0,-2.8,2.5,13,2.8)
finish('skybridge')
# Native authoring source is retained with all four models in named collections.
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/neon/neon-landmarks.blend'),compress=True)
(OUT/'models.json').write_text(json.dumps(variants,indent=2)+'\n')
print('NEON_ASSETS',json.dumps(variants))
