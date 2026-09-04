/** Uniform spatial hash. Used to keep sensor queries cheap. */
import type { Vec2, Rect } from './math';

export class SpatialHash<T> {
  private cells = new Map<number, T[]>();
  constructor(private cell = 8) {}

  private key(cx: number, cy: number): number {
    return (cx & 0xffff) * 65536 + (cy & 0xffff);
  }

  clear(): void { this.cells.clear(); }

  insert(p: Vec2, item: T): void {
    const k = this.key(Math.floor(p.x / this.cell), Math.floor(p.y / this.cell));
    let arr = this.cells.get(k);
    if (!arr) { arr = []; this.cells.set(k, arr); }
    arr.push(item);
  }

  insertRect(r: Rect, item: T): void {
    const x0 = Math.floor(r.x / this.cell), x1 = Math.floor((r.x + r.w) / this.cell);
    const y0 = Math.floor(r.y / this.cell), y1 = Math.floor((r.y + r.h) / this.cell);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const k = this.key(cx, cy);
        let arr = this.cells.get(k);
        if (!arr) { arr = []; this.cells.set(k, arr); }
        arr.push(item);
      }
    }
  }

  /** All items in cells overlapping the disc; may include false positives. */
  queryRadius(p: Vec2, r: number, out: T[] = []): T[] {
    out.length = 0;
    const x0 = Math.floor((p.x - r) / this.cell), x1 = Math.floor((p.x + r) / this.cell);
    const y0 = Math.floor((p.y - r) / this.cell), y1 = Math.floor((p.y + r) / this.cell);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const arr = this.cells.get(this.key(cx, cy));
        if (arr) for (const it of arr) out.push(it);
      }
    }
    return out;
  }

  queryRect(r: Rect, out: T[] = []): T[] {
    out.length = 0;
    const x0 = Math.floor(r.x / this.cell), x1 = Math.floor((r.x + r.w) / this.cell);
    const y0 = Math.floor(r.y / this.cell), y1 = Math.floor((r.y + r.h) / this.cell);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const arr = this.cells.get(this.key(cx, cy));
        if (arr) for (const it of arr) out.push(it);
      }
    }
    return out;
  }
}

/** Deduplicating variant for items inserted into many cells. */
export function unique<T>(items: T[]): T[] {
  return items.length < 2 ? items : Array.from(new Set(items));
}
