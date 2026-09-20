import * as THREE from 'three';
import type { TrackSample } from './TrackSpline';

/** Clip the existing road triangles, preserving their slopes and diagonal seams. */
export function createRoadStripe(road: THREE.BufferGeometry, sample: TrackSample, width: number): THREE.BufferGeometry {
  const source = road.getAttribute('position');
  const index = road.getIndex()!;
  const segmentCount = index.count / 6;
  const forward = sample.tangent.clone().setY(0).normalize();
  type Vertex = { point: THREE.Vector3; along: number; u: number };
  const clip = (polygon: Vertex[], boundary: number, keepAfter: boolean): Vertex[] => {
    const output: Vertex[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const insideA = keepAfter ? a.along >= boundary : a.along <= boundary;
      const insideB = keepAfter ? b.along >= boundary : b.along <= boundary;
      if (insideA) output.push(a);
      if (insideA !== insideB) {
        const t = (boundary - a.along) / (b.along - a.along);
        output.push({ point: a.point.clone().lerp(b.point, t), along: boundary, u: THREE.MathUtils.lerp(a.u, b.u, t) });
      }
    }
    return output;
  };
  const positions: number[] = [], uvs: number[] = [];
  // These transverse paint strips are shorter than one sample. Include the
  // adjacent segments because a corner's averaged tangent can cross their seam.
  for (let offset = -1; offset <= 1; offset++) {
    const segment = (sample.index + offset + segmentCount) % segmentCount;
    for (let triangle = 0; triangle < 2; triangle++) {
      const vertices = Array.from({ length: 3 }, (_, corner): Vertex => {
        const vertex = index.getX(segment * 6 + triangle * 3 + corner);
        const point = new THREE.Vector3().fromBufferAttribute(source, vertex);
        return { point, along: point.clone().sub(sample.position).dot(forward), u: vertex % 2 };
      });
      const polygon = clip(clip(vertices, 0, true), width, false);
      for (let i = 1; i < polygon.length - 1; i++) {
        const triangleVertices = [polygon[0], polygon[i], polygon[i + 1]];
        const area = triangleVertices[1].point.clone().sub(triangleVertices[0].point)
          .cross(triangleVertices[2].point.clone().sub(triangleVertices[0].point)).lengthSq();
        if (area < 1e-14) continue;
        for (const vertex of triangleVertices) {
          // Eight millimetres above the actual surface; no ramp or floating edge.
          positions.push(vertex.point.x, vertex.point.y + 0.008, vertex.point.z);
          uvs.push(vertex.u, vertex.along / width);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

/** Asphalt uses -4; paint sits ahead of it without changing scenery paint. */
export function createRoadPaint(source: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const material = source.clone();
  material.polygonOffset = true;
  material.polygonOffsetFactor = -5;
  material.polygonOffsetUnits = -5;
  return material;
}
