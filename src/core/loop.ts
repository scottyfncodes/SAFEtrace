/**
 * Fixed-timestep loop with interpolated presentation.
 * Simulation runs at exactly 60 Hz regardless of display rate.
 */

export const TICK_HZ = 60;
export const TICK_DT = 1 / TICK_HZ;
const MAX_CATCHUP = 5;

export interface LoopCallbacks {
  /** Called 0..MAX_CATCHUP times per frame with a constant dt. */
  fixed(dt: number): void;
  /** Called once per frame. `alpha` is the blend between the last two sim states. */
  render(alpha: number, frameDt: number): void;
}

export class Loop {
  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = false;
  frameDt = 0;
  fps = 60;
  private fpsAcc = 0;
  private fpsFrames = 0;

  constructor(private cb: LoopCallbacks) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    const step = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(step);
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (dt > 0.25) dt = 0.25;
      this.frameDt = dt;

      this.fpsAcc += dt;
      this.fpsFrames++;
      if (this.fpsAcc >= 0.5) {
        this.fps = this.fpsFrames / this.fpsAcc;
        this.fpsAcc = 0;
        this.fpsFrames = 0;
      }

      this.acc += dt;
      let steps = 0;
      while (this.acc >= TICK_DT && steps < MAX_CATCHUP) {
        this.cb.fixed(TICK_DT);
        this.acc -= TICK_DT;
        steps++;
      }
      if (steps === MAX_CATCHUP) this.acc = 0;
      this.cb.render(this.acc / TICK_DT, dt);
    };
    this.raf = requestAnimationFrame(step);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
