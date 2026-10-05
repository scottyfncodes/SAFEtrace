/**
 * The plan, carried out into the street (sim/recon.ts).
 *
 * One strip under the run: the chain the player committed to, with the step
 * they are on lit, and one live line for that step — how long the window
 * has left, how long the stone has bought, where the stone goes. Before a
 * plan, when something watches the way, the same strip names the barrier
 * and says recon is one press away. Nothing else; the street is the screen.
 */
import { RECON_COPY } from '../content/copy';
import { dist, wrapAngle, type Vec2 } from '../core/math';
import type { Sim } from '../sim/sim';
import {
  type CommittedPlan, type PlanStep, barriers, currentStep, planRoute, routeHead, gapNow, distanceAlong,
} from '../sim/recon';
import './planStrip.css';

const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];

export type StripTone = 'plan' | 'held' | 'blown' | 'barrier';

export interface StripView {
  tone: StripTone;
  chain: Array<{ text: string; state: 'done' | 'now' | 'next' | 'hole' }>;
  live: string | null;
}

/** A step, as the chain prints it. */
export function stepText(st: PlanStep, label: string | null): string {
  const id = st.sensorId ?? '';
  switch (st.kind) {
    case 'distract': return RECON_COPY.step.distract(id);
    case 'gap': return RECON_COPY.step.gap(id, st.gap ?? 0);
    case 'covered': return RECON_COPY.step.covered(id);
    case 'unknown': return RECON_COPY.step.unknown(id);
    default: return RECON_COPY.step.target(label);
  }
}

/** The whole chain on one line, for the plan view's preview. */
export function chainText(plan: CommittedPlan): string {
  return plan.steps.map((s) => stepText(s, plan.label)).join(' → ');
}

/** What the strip should say this frame. */
export function stripView(sim: Sim, plan: CommittedPlan | null, camYaw: number): StripView | null {
  if (!plan) return null;
  const chain: StripView['chain'] = plan.steps.map((s) => ({
    text: stepText(s, plan.label),
    state: s.done ? 'done' : s.kind === 'unknown' || s.kind === 'covered' ? 'hole' : 'next',
  }));
  const now = currentStep(plan);
  if (plan.status === 'executing' && now) {
    const i = plan.steps.indexOf(now);
    if (chain[i].state !== 'hole') chain[i].state = 'now';
  }
  const me = sim.player.pos;
  const arrow = (p: Vec2) => {
    const a = wrapAngle(Math.atan2(p.y - me.y, p.x - me.x) - camYaw);
    return ARROWS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
  };
  let live: string | null = null;
  if (plan.status === 'executing' && now) {
    const s = now.sensorId ? sim.sensorById.get(now.sensorId) : undefined;
    const id = now.sensorId ?? '';
    if (now.kind === 'target') live = RECON_COPY.live.target(Math.round(dist(me, plan.target)), arrow(plan.target));
    else if (now.kind === 'unknown') live = RECON_COPY.live.unknown(id);
    else if (now.kind === 'covered') live = RECON_COPY.live.covered(id);
    else if (now.kind === 'distract' && s && now.at) {
      live = RECON_COPY.live.throwAt(id, Math.round(dist(me, now.at)), arrow(now.at));
    } else if (now.kind === 'gap' && s && now.exposed) {
      const w = gapNow(s, now.exposed, sim.time, distanceAlong(plan.route, me));
      const t = Number.isFinite(w.flipsIn) ? w.flipsIn : s.data.sweepPeriod;
      live = w.go ? RECON_COPY.live.go(id, t) : RECON_COPY.live.wait(id, t);
    }
    // A stone that has landed: the next step's line is how long it bought.
    const turned = plan.steps.find((x) => x.kind === 'distract' && x.done && x.sensorId);
    if (turned && now.kind !== 'distract') {
      const s2 = sim.sensorById.get(turned.sensorId!);
      const left = s2 && s2.attend ? Math.max(0, (s2.attendUntil - sim.tick) / 60) : 0;
      if (left > 0) live = RECON_COPY.live.turned(turned.sensorId!, left);
    }
  }
  // Why it went wrong stays on the strip after the stamp has gone.
  if (plan.status === 'blown' && plan.failure) {
    live = (RECON_COPY.reason[plan.failure.reason] ?? RECON_COPY.reason.unscouted)(plan.failure.sensorId);
  }
  return { tone: plan.status === 'executing' ? 'plan' : plan.status, chain: compact(chain), live };
}

/** A long chain, as the step being done, the one after it, and where it ends. */
function compact(chain: StripView['chain']): StripView['chain'] {
  if (chain.length <= 4) return chain;
  let i = chain.findIndex((c) => c.state !== 'done');
  if (i < 0 || i >= chain.length - 1) i = Math.max(0, chain.length - 3);
  const keep = chain.slice(i, Math.min(i + 2, chain.length - 1));
  if (i + 2 < chain.length - 1) keep.push({ text: '…', state: 'next' });
  keep.push(chain[chain.length - 1]);
  return keep;
}

/**
 * The barrier, before any plan: the first camera that watches the way to
 * where the player is going, once the rider is close enough to it to care.
 */
export function barrierAhead(sim: Sim, target: Vec2 | null): string | null {
  if (!target) return null;
  const route = routeHead(planRoute(sim, sim.player.pos, target), 60);
  for (const b of barriers(sim, route)) {
    if (b.exposed[0].s > 35) break;
    // Already read and already passed is not a barrier.
    if (b.exposed[b.exposed.length - 1].s < 2) continue;
    return b.sensorId;
  }
  return null;
}

export class PlanStrip {
  private el: HTMLElement;
  private last = '';

  constructor(host: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'plan-strip';
    this.el.className = 'hidden';
    this.el.setAttribute('aria-live', 'polite');
    host.appendChild(this.el);
  }

  /** A committed plan, or a barrier line, or nothing. */
  show(view: StripView | null, barrier: string | null = null): void {
    let html = '';
    let cls = 'hidden';
    if (view) {
      cls = `t-${view.tone}`;
      const chain = view.chain.map((c) => `<span class="ps-${c.state}">${c.text}</span>`).join('<b>→</b>');
      html = `<div class="ps-chain"><em>PLAN</em>${chain}</div>${view.live ? `<div class="ps-live">${view.live}</div>` : ''}`;
    } else if (barrier) {
      cls = 't-barrier';
      html = `<div class="ps-live">${barrier}</div>`;
    }
    const key = cls + html;
    if (key === this.last) return;
    this.last = key;
    this.el.className = cls;
    if (html) this.el.innerHTML = html;
  }
}

/** Seconds a finished plan stays on the strip before it goes. */
export const STRIP_LINGER = 3.5;
