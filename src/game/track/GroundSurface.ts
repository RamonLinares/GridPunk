import * as THREE from 'three';

type Triangle = {
  ax: number; ay: number; az: number;
  bx: number; bz: number; cx: number; cz: number;
  by: number; cy: number; inverse: number;
  minX: number; maxX: number; minZ: number; maxZ: number;
  normal: THREE.Vector3;
  /** Name of the mesh the triangle belongs to, for surface-kind queries. */
  name: string;
};

/** Static XZ lookup of the actual driving triangles, including overlapping kerbs. */
export class GroundSurface {
  private readonly cells = new Map<string, Triangle[]>();
  private readonly cellSize = 16;
  private lastCellX = NaN;
  private lastCellZ = NaN;
  private lastCell?: Triangle[];

  add(mesh: THREE.Mesh): void {
    // Scenery can add surfaces after queries have cached an empty cell.
    this.lastCellX = NaN;
    mesh.updateWorldMatrix(true, false);
    const positions = mesh.geometry.getAttribute('position');
    const indices = mesh.geometry.getIndex();
    const count = indices?.count ?? positions.count;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < count; i += 3) {
      a.fromBufferAttribute(positions, indices ? indices.getX(i) : i).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(positions, indices ? indices.getX(i + 1) : i + 1).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(positions, indices ? indices.getX(i + 2) : i + 2).applyMatrix4(mesh.matrixWorld);
      const bx = b.x - a.x, bz = b.z - a.z, cx = c.x - a.x, cz = c.z - a.z;
      const determinant = bx * cz - cx * bz;
      if (Math.abs(determinant) < 1e-8) continue;
      const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      if (normal.y < 0) normal.negate();
      // Include the full barycentric tolerance outside each triangle's bounds.
      const padX = 1e-7 * (1 + 2 * (Math.abs(bx) + Math.abs(cx)));
      const padZ = 1e-7 * (1 + 2 * (Math.abs(bz) + Math.abs(cz)));
      const triangle: Triangle = {
        ax: a.x, ay: a.y, az: a.z, bx, bz, cx, cz,
        by: b.y - a.y, cy: c.y - a.y, inverse: 1 / determinant, normal,
        minX: a.x + Math.min(0, bx, cx) - padX,
        maxX: a.x + Math.max(0, bx, cx) + padX,
        minZ: a.z + Math.min(0, bz, cz) - padZ,
        maxZ: a.z + Math.max(0, bz, cz) + padZ,
        name: mesh.name,
      };
      for (let x = Math.floor(Math.min(a.x, b.x, c.x) / this.cellSize); x <= Math.floor(Math.max(a.x, b.x, c.x) / this.cellSize); x++) {
        for (let z = Math.floor(Math.min(a.z, b.z, c.z) / this.cellSize); z <= Math.floor(Math.max(a.z, b.z, c.z) / this.cellSize); z++) {
          const key = `${x},${z}`;
          const cell = this.cells.get(key);
          if (cell) cell.push(triangle);
          else this.cells.set(key, [triangle]);
        }
      }
    }
  }

  heightAt(x: number, z: number, normal?: THREE.Vector3, referenceY?: number): number | undefined {
    const cellX = Math.floor(x / this.cellSize), cellZ = Math.floor(z / this.cellSize);
    if (cellX !== this.lastCellX || cellZ !== this.lastCellZ) {
      this.lastCellX = cellX;
      this.lastCellZ = cellZ;
      this.lastCell = this.cells.get(`${cellX},${cellZ}`);
    }
    let height = -Infinity;
    for (const t of this.lastCell ?? []) {
      if (x < t.minX || x > t.maxX || z < t.minZ || z > t.maxZ) continue;
      const dx = x - t.ax, dz = z - t.az;
      const u = (dx * t.cz - t.cx * dz) * t.inverse;
      const v = (t.bx * dz - dx * t.bz) * t.inverse;
      if (u < -1e-7 || v < -1e-7 || u + v > 1 + 1e-7) continue;
      const y = t.ay + u * t.by + v * t.cy;
      // A route-height ceiling selects the lower road at a grade-separated crossing.
      if (referenceY !== undefined && y > referenceY + 2.5) continue;
      if (y > height) {
        height = y;
        normal?.copy(t.normal);
      }
    }
    return height === -Infinity ? undefined : height;
  }

  /** Name of the topmost registered surface mesh under a point, if any. */
  surfaceNameAt(x: number, z: number, referenceY?: number): string | undefined {
    const cellX = Math.floor(x / this.cellSize), cellZ = Math.floor(z / this.cellSize);
    let height = -Infinity;
    let name: string | undefined;
    for (const t of this.cells.get(`${cellX},${cellZ}`) ?? []) {
      if (x < t.minX || x > t.maxX || z < t.minZ || z > t.maxZ) continue;
      const dx = x - t.ax, dz = z - t.az;
      const u = (dx * t.cz - t.cx * dz) * t.inverse;
      const v = (t.bx * dz - dx * t.bz) * t.inverse;
      if (u < -1e-7 || v < -1e-7 || u + v > 1 + 1e-7) continue;
      const y = t.ay + u * t.by + v * t.cy;
      if (referenceY !== undefined && y > referenceY + 2.5) continue;
      if (y > height) {
        height = y;
        name = t.name;
      }
    }
    return name;
  }

  /**
   * Returns a plane only when every surface candidate under a circular
   * footprint is coplanar at the selected deck level. This is deliberately
   * conservative: an adjacent kerb, runoff seam, terrain triangle, coverage
   * gap or grade-separated deck returns undefined so callers can use their
   * exact per-vertex path instead.
   *
   * `normal` is an output to avoid allocating a vector for every wheel/frame;
   * the returned value is the plane constant n dot p.
   */
  planarPatch(x: number, z: number, radius: number, normal: THREE.Vector3, referenceY?: number): number | undefined {
    const minX = x - radius, maxX = x + radius, minZ = z - radius, maxZ = z + radius;
    const firstCellX = Math.floor(minX / this.cellSize), lastCellX = Math.floor(maxX / this.cellSize);
    const firstCellZ = Math.floor(minZ / this.cellSize), lastCellZ = Math.floor(maxZ / this.cellSize);
    const baselineHeight = this.heightAt(x, z, normal, referenceY);
    if (baselineHeight === undefined) return undefined;
    const constant = normal.x * x + normal.y * baselineHeight + normal.z * z;
    const baselineSlopeX = -normal.x / normal.y;
    const baselineSlopeZ = -normal.z / normal.y;
    for (let cellX = firstCellX; cellX <= lastCellX; cellX += 1) for (let cellZ = firstCellZ; cellZ <= lastCellZ; cellZ += 1) {
      for (const triangle of this.cells.get(`${cellX},${cellZ}`) ?? []) {
        if (triangle.maxX < minX || triangle.minX > maxX || triangle.maxZ < minZ || triangle.minZ > maxZ) continue;
        // A triangle wholly above the route-height ceiling cannot participate
        // in the selected Suzuka deck. Partially eligible triangles remain in
        // the comparison, preferring a safe false fallback at a layer change.
        if (referenceY !== undefined && Math.min(triangle.ay, triangle.ay + triangle.by, triangle.ay + triangle.cy) > referenceY + 2.5) continue;
        const triangleConstant = triangle.normal.x * triangle.ax + triangle.normal.y * triangle.ay + triangle.normal.z * triangle.az;
        // Lower terrain and shoulders never win GroundSurface's topmost-surface
        // query, so ignore only triangles provably below the baseline across
        // the whole footprint. Anything that could become visible stays and
        // forces a safe fallback if it is not coplanar.
        const delta = (triangleConstant - triangle.normal.x * x - triangle.normal.z * z) / triangle.normal.y - baselineHeight;
        // A linear plane difference reaches its extrema at the square's
        // corners. This computes all four bounds without per-frame arrays.
        const spread = radius * (Math.abs(-triangle.normal.x / triangle.normal.y - baselineSlopeX)
          + Math.abs(-triangle.normal.z / triangle.normal.y - baselineSlopeZ));
        if (delta + spread < -.01) continue;
        if (normal.dot(triangle.normal) < .99999999) return undefined;
        if (Math.abs(delta) + spread > .00025) return undefined;
      }
    }
    return constant;
  }
}
