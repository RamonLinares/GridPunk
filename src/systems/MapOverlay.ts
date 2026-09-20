/**
 * Screen-space grid drawn over the zenith map view, in world metres, with the
 * local origin (0,0) marked for inspecting track and terrain coordinates.
 */
export class MapOverlay {
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private pixelRatio = 0;

  constructor(parent: HTMLElement) {
    const c = this.canvas;
    c.style.position = 'absolute';
    c.style.inset = '0';
    c.style.width = '100%';
    c.style.height = '100%';
    c.style.pointerEvents = 'none';
    c.style.zIndex = '4';
    parent.appendChild(c);
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('MapOverlay: 2D context unavailable');
    this.ctx = ctx;
  }

  resize(width: number, height: number, dpr: number): void {
    if (width === this.cssW && height === this.cssH && dpr === this.pixelRatio) return;
    this.cssW = width;
    this.cssH = height;
    this.pixelRatio = dpr;
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    // Assigning even an unchanged canvas dimension discards its bitmap/state.
    if (this.canvas.width !== pixelWidth) this.canvas.width = pixelWidth;
    if (this.canvas.height !== pixelHeight) this.canvas.height = pixelHeight;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.cssW, this.cssH);
  }

  /**
   * @param cx Centre of the view in world X (metres).
   * @param cz Centre of the view in world Z (metres).
   * @param halfX Half-width of the ortho view in world X (metres).
   * @param halfZ Half-height of the ortho view in world Z (metres).
   */
  draw(cx: number, cz: number, halfX: number, halfZ: number): void {
    const ctx = this.ctx;
    const w = this.cssW;
    const h = this.cssH;
    ctx.clearRect(0, 0, w, h);
    if (w === 0 || h === 0 || halfX <= 0 || halfZ <= 0) return;

    // North (-Z) is up in the image; +X is right.
    const sx = (wx: number) => ((wx - cx) / halfX + 1) * 0.5 * w;
    const sy = (wz: number) => (1 - (cz - wz) / halfZ) * 0.5 * h;

    const viewH = halfZ * 2;
    const spacing = viewH > 4000 ? 500 : viewH > 2000 ? 250 : viewH > 1000 ? 100 : viewH > 450 ? 50 : 25;

    const minX = cx - halfX;
    const maxX = cx + halfX;
    const minZ = cz - halfZ;
    const maxZ = cz + halfZ;

    ctx.lineWidth = 1;
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textBaseline = 'top';

    ctx.strokeStyle = 'rgba(90,200,255,0.30)';
    ctx.fillStyle = 'rgba(165,225,255,0.92)';
    for (let x = Math.ceil(minX / spacing) * spacing; x <= maxX; x += spacing) {
      const px = Math.round(sx(x)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
      ctx.fillText(`x ${x >= 0 ? '+' : ''}${Math.round(x)}`, px + 3, 4);
    }

    ctx.strokeStyle = 'rgba(255,185,90,0.30)';
    ctx.fillStyle = 'rgba(255,215,160,0.92)';
    for (let z = Math.ceil(minZ / spacing) * spacing; z <= maxZ; z += spacing) {
      const py = Math.round(sy(z)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
      ctx.stroke();
      ctx.fillText(`z ${z >= 0 ? '+' : ''}${Math.round(z)}`, 4, py + 3);
    }

    if (cx - halfX <= 0 && cx + halfX >= 0 && cz - halfZ <= 0 && cz + halfZ >= 0) {
      const ox = sx(0);
      const oy = sy(0);
      ctx.strokeStyle = 'rgba(255,70,70,0.95)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ox - 10, oy);
      ctx.lineTo(ox + 10, oy);
      ctx.moveTo(ox, oy - 10);
      ctx.lineTo(ox, oy + 10);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,120,120,1)';
      ctx.fillText('0,0', ox + 7, oy + 5);
    }

    // Scale bar, bottom-right.
    const barPx = (spacing / (halfX * 2)) * w;
    const bx = w - 24 - barPx;
    const by = h - 26;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + barPx, by);
    ctx.moveTo(bx, by - 5);
    ctx.lineTo(bx, by + 5);
    ctx.moveTo(bx + barPx, by - 5);
    ctx.lineTo(bx + barPx, by + 5);
    ctx.stroke();
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${spacing} m`, bx, by - 7);
    ctx.textBaseline = 'top';
  }

  dispose(): void {
    this.canvas.remove();
  }
}
