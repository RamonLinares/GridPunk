# Owner-supplied Shinsei car source

Copied on 20 September 2026 from the owner's `Documents/jev3d` project for integration into Gridbound. `blender/lib_car.py`, `lib_util.py`, `lib_materials.py` and `assets/decals/` are an unchanged source snapshot. The owner's original directory is never edited by the exporter.

Run from the game root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b -t 4 -P scripts/blender/export_shinsei_car.py
```

Generated files here include the packed editable `shinsei-nd01.blend` and the baked PBR texture atlases. The runtime GLB is exported separately to `public/cars/shinsei/`. Integration-specific grouping, pivots and baking are in the exporter, not the copied authoring libraries.
