# Shinsei ND-01 integration

The owner supplied `/Users/ramonlinarespallares/Documents/jev3d/blender/lib_car.py` and its adjacent helpers and decal images. Their original project is unchanged. A reproducible snapshot lives in `assets/shinsei-source/`; the original K89-R remains in `assets/neon-car/` and `public/cars/neon/`.

The Neon session menu has a **YOUR CAR** choice between Shinsei ND-01 and KuroGane K89-R. Explicit `?circuit=neon&car=shinsei` or `&car=k89` links override the saved choice. New visitors default to Shinsei. Changing cars reloads into a new sprint. The five Neon rivals alternate between three KuroGane K89-R cars and two Shinsei ND-01 cars, independently of the player choice. Both models preload once and share their source geometry and textures between instances. K89-R rivals retain their coloured liveries; Shinsei retains its authored crimson design. Real circuits retain the Formula car.

## Asset preparation

`scripts/blender/export_shinsei_car.py` builds the supplied model, applies modifiers, bakes its procedural paint/grime/droplets into a 2048-pixel colour/normal atlas and 1024-pixel metallic/roughness atlas, preserves the original transparent marking images and merges static details. It exports `public/cars/shinsei/shinsei-nd01.glb`; measured mesh, triangle and byte counts live in the adjacent JSON. The bake preserves material patterns, not the source render's lighting.

Wheels use the supplied tyre meshes and original centres/radii, with separate steering and spin pivots and ground-contact samples from the rendered vertices. The rear flap retains an independent hinge. Rear brake lamps have a separate material from the red front strip. The solid presentation-model tub is cut open beneath the canopy and lined with a dark recessed well; the existing functional steering wheel is attached to a column at the dashboard. Lamp intensity is reduced from the Blender studio exposure to suit the game's bloom. No new lights, shadow passes or physics tuning are introduced.

The owner's wipers crossed the steering-wheel view at the initial driver eye point. They are now a separate mesh, excluded only from the cockpit camera and restored in exterior views. Smoked canopy back faces are culled from inside; this is a visibility accommodation, not simulated glass optics.

The source cyan dashboard placeholder is also excluded from cockpit view: the speed-dependent wider field of view exposed it below the wheel during acceleration and caused a large bloom wash. The functional steering-wheel display remains visible, and exterior lamps and underglow retain their original intensity.

## Checks

`node scripts/verify-shinsei-car.mjs` checks real acceleration, steering, wheel rotation, brake response, cockpit/hood road clearance, wiper visibility by camera, body footprint, imported textures, the actual menu path back to K89-R, and the unchanged Montmeló model. It captures neutral front/side/rear/overhead views, in-game cameras, mobile cockpit and the car selector under `artifacts/neon/shinsei/`. TypeScript/Vite build and `git diff --check` are also run.

This is a local integration, not a site deployment. It retains the supplied car's design; no photorealism claim is made.
