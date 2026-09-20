"""Author the Undercity tunnel complex. Blender Z-up; fronts face -Y.
Run: blender -b -t 2 -P scripts/blender/build_neon_tunnel.py
Original geometry inspired by the user's tunnel-complex reference, no image tracing.
"""
import bpy, math, random, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/circuits/neon-models'; OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
random.seed(208907)
materials={}; batches={}; reports=[]
for name,color,metal,rough,emission in [
 ('TunnelArmor',(.14,.19,.205),.55,.64,0),('TunnelEdge',(.29,.34,.34),.7,.45,0),
 ('TunnelConcrete',(.22,.24,.22),.05,.9,0),('TunnelCopper',(.31,.20,.135),.7,.56,0),
 ('TunnelGlass',(.017,.04,.052),.4,.3,0),('TunnelWarm',(.75,.43,.18),.1,.55,1.6),
 ('TunnelCyan',(.055,.65,.85),.2,.35,2.2),
 ('TunnelIdentity',(1,1,1),0,.75,0),('TunnelDistrict',(1,1,1),0,.75,0),('TunnelHeader',(1,1,1),0,.75,0)]:
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF')
 for key,value in [('Base Color',(*color,1)),('Metallic',metal),('Roughness',rough),('Emission Color',(*color,1)),('Emission Strength',emission)]:p.inputs[key].default_value=value
 materials[name]=m

def face(mat,vertices,faces,uv=None):
 v,f,u=batches.setdefault(mat,[[],[],[]]);start=len(v);v.extend(vertices)
 for indices in faces:
  f.append(tuple(start+i for i in indices))
  if uv:u.append(uv)
  else:
   # Metre-scaled UVs: stains/pitting do not stretch over an entire building.
   a=Vector(vertices[indices[0]]);b=Vector(vertices[indices[1]]);c=Vector(vertices[indices[-1]])
   w=(b-a).length/4;h=(c-a).length/4;u.append([(0,0),(w,0),(w,h),(0,h)][:len(indices)])
def box(mat,x,y,z,w,d,h):
 v=[(x+sx*w/2,y+sy*d/2,z+sz*h/2)for sz in[-1,1]for sy in[-1,1]for sx in[-1,1]]
 face(mat,v,[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)])
def beam(mat,a,b,r=.1,sides=8):
 a,b=Vector(a),Vector(b);axis=(b-a).normalized();u=axis.cross(Vector((0,0,1)))
 if u.length<.01:u=axis.cross(Vector((0,1,0)))
 u.normalize();v=axis.cross(u)
 vertices=[tuple(p+r*(u*math.cos(i*math.tau/sides)+v*math.sin(i*math.tau/sides)))for p in[a,b]for i in range(sides)]
 # Open ends terminate in solid fittings; omit hidden caps.
 face(mat,vertices,[(i,(i+1)%sides,(i+1)%sides+sides,i+sides)for i in range(sides)])
def pipe(points,r=.25,mat='TunnelCopper'):
 # Rounded elbows sampled as quadratic curves, not disconnected straight sticks.
 path=[Vector(points[0])]
 for i in range(1,len(points)-1):
  a,b,c=map(Vector,points[i-1:i+2]);cut=min(1.0,(a-b).length*.3,(c-b).length*.3)
  p=b+(a-b).normalized()*cut;q=b+(c-b).normalized()*cut
  path.append(p)
  for k in range(1,7):
   t=k/6;path.append((1-t)**2*p+2*(1-t)*t*b+t*t*q)
 path.append(Vector(points[-1]))
 for a,b in zip(path,path[1:]):beam(mat,a,b,r,10)
def rail(x,y,z,w):
 for dz in [.5,1.15]:beam('TunnelEdge',(x-w/2,y,z+dz),(x+w/2,y,z+dz),.055,6)
 for i in range(math.ceil(w/2)+1):
  xx=x-w/2+i*w/math.ceil(w/2);beam('TunnelEdge',(xx,y,z),(xx,y,z+1.2),.06,6)
def deck(x,y,z,w,d):
 box('TunnelArmor',x,y,z,w,d,.32);box('TunnelEdge',x,y-d/2,z-.2,w,.2,.45);rail(x,y-d/2,z+.16,w)
 for xx in [x-w/2+.4,x+w/2-.4]:beam('TunnelEdge',(xx,y+d/2,z-2),(xx,y-d/2+.2,z-.3),.13,6)
def screen(mat,x,y,z,w,h):
 box('TunnelArmor',x,y+.35,z,w+1.3,.8,h+1.4)
 face(mat,[(x-w/2,y-.1,z-h/2),(x+w/2,y-.1,z-h/2),(x+w/2,y-.1,z+h/2),(x-w/2,y-.1,z+h/2)],[(0,1,2,3)],[(0,0),(1,0),(1,1),(0,1)])
 for side in [-1,1]:
  box('TunnelEdge',x+side*(w/2+.45),y-.22,z,.28,.4,h+1.5)
  box('TunnelEdge',x,y-.22,z+side*(h/2+.55),w+1.3,.4,.22)
  for zz in range(int(z-h/2),int(z+h/2),4):box('TunnelCopper',x+side*(w/2+.65),y-.4,zz,.22,.25,.24)
def fan(x,y,z,r):
 box('TunnelArmor',x,y+.4,z,r*2.5,.8,r*2.5)
 for radius in [r,r*.87]:
  pts=[(x+radius*math.cos(i*math.tau/24),y,z+radius*math.sin(i*math.tau/24))for i in range(25)]
  for a,b in zip(pts,pts[1:]):beam('TunnelEdge',a,b,.08,6)
 for i in range(7):
  a=i*math.tau/7;beam('TunnelEdge',(x+.2*math.cos(a),y+.08,z+.2*math.sin(a)),(x+r*.78*math.cos(a+.35),y+.08,z+r*.78*math.sin(a+.35)),.13,4)
 for i in [-1,0,1]:beam('TunnelArmor',(x-r,y-.12,z+i*r*.45),(x+r,y-.12,z+i*r*.45),.045,4)
def window(x,y,z,w,h,lit=True):
 box('TunnelGlass',x,y+.16,z,w+.25,.35,h+.3)
 box('TunnelWarm' if lit else 'TunnelGlass',x,y-.06,z,w,.08,h)
 for xx in [-w/2,w/2,0]:box('TunnelEdge',x+xx,y-.2,z,.07,.25,h+.2)
 box('TunnelEdge',x,y-.26,z-h/2,w+.35,.65,.13)
 if lit:
  # Individual curtains, shelves and blinds occlude luminous room geometry.
  if random.random()<.5:
   for row in range(5):box('TunnelArmor',x,y-.18,z-h*.4+row*h*.18,w,.1,.09)
  else:box('TunnelArmor',x+w*.23,y-.18,z,w*.28,.11,h)
def finish(name):
 global batches
 collection=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(collection)
 bpy.ops.object.select_all(action='DESELECT');objects=[]
 for mat,(v,f,uvs)in batches.items():
  mesh=bpy.data.meshes.new(name+'-'+mat);mesh.from_pydata(v,[],f);mesh.update();uv=mesh.uv_layers.new(name='UVMap')
  for poly,coords in zip(mesh.polygons,uvs):
   for i,li in enumerate(poly.loop_indices):uv.data[li].uv=coords[i]
  obj=bpy.data.objects.new(name+'-'+mat,mesh);collection.objects.link(obj);obj.data.materials.append(materials[mat]);obj.select_set(True);objects.append(obj)
  bpy.context.view_layer.objects.active=obj
  mod=obj.modifiers.new('Export triangulation','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
 bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True,export_yup=True)
 reports.append(dict(name=name,triangles=sum(len(o.data.polygons)for o in objects),meshes=len(objects),bytes=(OUT/(name+'.glb')).stat().st_size));batches={}

# Hero portal: open 25.1m carriageway beneath a deep maintenance bridge.
# Nothing authored here enters |x|<12.55 below z=7.2m.
for side in [-1,1]:
 box('TunnelConcrete',side*18.1,1.5,5.8,9.8,5,11.6)
 box('TunnelArmor',side*20.9,-.8,24.5,2.1,2.2,38)
 for z in [3,8,17,27,37]:box('TunnelEdge',side*20.9,-2,z,2.4,.35,.5)
box('TunnelArmor',0,-.25,10.1,27.2,2,5.3)
# Split armour plates with deep recesses and raised seam fasteners.
for col,(x,w) in enumerate([(-17.5,6.8),(-8,10),(3,9.8),(15,9)]):
 for row in range(4):
  z=17+row*6.5;box('TunnelConcrete' if col==0 else 'TunnelArmor',x,.1+(col%2)*.5,z,w,1.4,6.1)
  for xx in [-1,1]:box('TunnelEdge',x+xx*(w/2-.18),-.75,z,.12,.12,5.5)
  for zz in [-2.6,2.6]:
   for xx in [-w/2+.5,w/2-.5]:box('TunnelCopper',x+xx,-.88,z+zz,.13,.1,.13)
screen('TunnelIdentity',-2,-1.6,27,14,19)
screen('TunnelDistrict',15.8,-1.25,28,5.6,15)
screen('TunnelHeader',0,-1.6,10.2,24,2.6)
for z in [17.5,22,26.5,31,35.5]:window(-17.1,-1.0,z,4.1,2.2,z!=26.5)
# Walkways are anchored into the structural facade, with railing and braces.
deck(0,-2,13.7,44,4.3);deck(0,-.75,42.3,44.5,3)
for x in range(-22,22,4):
 beam('TunnelEdge',(x,-4.05,12.5),(x+4,-4.05,13.5),.105,6)
 beam('TunnelEdge',(x,-4.05,13.5),(x+4,-4.05,12.5),.105,6)
for side in [-1,1]:
 for k in range(3):
  x=side*(10.6+k*.63)
  pipe([(side*18,-1.5,1),(side*18,-2.2,7.6),(x,-2.3,9),(x,-2.3,37),(x+side*1.4,1,41)],.18+k*.035)
  for z in [15,23,31,37]:beam('TunnelEdge',(x,-2.3,z),(x,-2.3,z+.22),.32,10)
 box('TunnelCyan',side*10.1,-2.6,28,.13,.15,13)
 for z in [17,25,33]:box('TunnelArmor',side*10.1,-2.7,z,.35,.24,.38)
for x in [-6,0,6]:fan(x,-1.7,39,1.6)
# Off-centre external stair and ladder with protective hoops.
for k in range(20):box('TunnelEdge',-19.4,-3.1,14.2+k*.38,2.1,.9,.14)
for x in [-20.35,-18.45]:beam('TunnelEdge',(x,-3.1,14),(x,-3.1,23),.075,6)
for z in range(25,42):beam('TunnelEdge',(20.2,-1.5,z),(21.3,-1.5,z),.055,6)
# Warm downlights, cyan portal fixtures and asymmetric rooftop plant.
for x in [-20,-10,9,20]:
 box('TunnelArmor',x,-2.7,14.2,1.9,1.5,.3);box('TunnelWarm',x,-3,14.02,1.25,.6,.08)
for x in [-8,0,8]:box('TunnelCyan',x,-1.4,7.38,1.8,.7,.09)
box('TunnelConcrete',-13,4,45.6,13,12,6.7);box('TunnelArmor',-13,4,49.2,14,13,.5)
box('TunnelArmor',9,6,49.4,15,10,14);box('TunnelEdge',9,6,56.5,15.7,10.7,.45)
for z in [44,47,50,53]:
 for x in [5,9,13]:window(x,.7,z,2.6,1.6,random.random()>.5)
for x in [-17,-10]:fan(x,-2.1,46,1.4)
for x,z in [(-19,51),(13,58),(5,59)]:
 beam('TunnelEdge',(x,3,z-3),(x,3,z+6),.12,8);box('TunnelWarm',x,3,z+6,.2,.2,.3)
pipe([(-20,1,42),(-20,1,47),(-4,1,47),(-9,6,44)],.42)
finish('tunnel-portal')

# 18m service bay for the curved sides. Genuine 2m-deep loggias and broken floors.
for x in [-8.8,8.8]:box('TunnelArmor',x,-.8,25,.6,2.2,34)
for row in range(7):
 z=10.5+row*4.4;box('TunnelArmor',0,-.7,z,18,2.6,.3)
 for col in range(4):
  x=-6.6+col*4.4;window(x,-.12,z+2,3.2,2.7,(row*3+col)%7 in [0,2,4])
  if (row+col)%4==0:box('TunnelConcrete',x,-.9,z+2,3.4,1.4,3.6)
 if row in [1,4,6]:deck(0,-1.6,z,18,2.8)
pipe([(-7.8,-1.8,1),(-7.8,-1.8,21),(-4,-1.8,23),(-4,-1.8,42)],.24)
fan(5,-2,17,1.15);box('TunnelCyan',8,-2,34,.13,.14,7)
box('TunnelArmor',2,2,45,7,6,5);fan(2,-1.1,45,1.5)
finish('tunnel-service-bay')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/neon/neon-tunnel.blend'),compress=True)
(OUT/'tunnel-models.json').write_text(json.dumps(reports,indent=2)+'\n')
print('TUNNEL_ASSETS',json.dumps(reports))
