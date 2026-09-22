# Bridge verge visibility

The runoff material's positive polygon offset pushed its rendered depth behind
the flyover's concrete deck at grazing angles. This exposed a pale strip in the
distance that turned back into the verge as the camera approached. Solar and
Kairo share this material and bridge geometry.

Removed the runoff depth bias in `src/game/Materials.ts`. The shoulder, apron
and deck already have separate physical heights, so they use normal depth testing.

Verification: reproduced at lap fractions 0.817, 0.835 and 0.86 in both circuits;
compared identical cameras with the offset enabled and disabled. After the source
fix, inspected 0.817, 0.835, 0.86 and 0.879 in both circuits and checked the shared
material in Neon at 0.13. All canvases rendered at 1440 × 1000 without console or
page errors. Production build and `git diff --check` passed.

Local screenshots and diagnostic scripts: `artifacts/bridge-verges/`.
