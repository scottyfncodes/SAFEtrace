/**
 * The diegetic HUD.
 *
 * Almost every element is a thing in the fiction: the risk score is the
 * SAFEtrace app's own Community Safety Score widget that every resident has,
 * and ammunition is bearings visible in a pocket flap rather than a counter.
 */
import type { Sim } from '../sim/sim';
import type { Settings } from '../core/settings';
import type { SafetraceMessage } from '../sim/events';
import { VERBS, type HackVerb, type NetworkNode } from '../sim/surveillance/network';

const KEY_PROMPTS = [
  '<span><kbd>W</kbd>push</span>',
  '<span><kbd>A D</kbd>carve</span>',
  '<span><kbd>Space</kbd>ollie</span>',
  '<span><kbd>S</kbd>slide</span>',
  '<span><kbd>RMB</kbd>aim</span>',
  '<span><kbd>E</kbd>inspect</span>',
].join('');

// Deliberately three lines, not six. The rest is discovered by moving.
const TOUCH_PROMPTS = [
  '<span>drag to carve</span>',
  '<span>forward to push</span>',
  '<span>flick up to ollie</span>',
].join('');
import { riskLabel } from '../sim/surveillance/risk';
import { SYSTEM } from '../content/copy';

const WORDMARK = '<b>SAFE</b><span>trace</span><sup>™</sup>';

export class Hud {
  private notifications: HTMLElement;
  private inspect: HTMLElement;
  private prompts: HTMLElement;
  private bearings: HTMLElement;
  private dialogue: HTMLElement;
  private debug: HTMLElement;
  private scoreValue!: HTMLElement;
  private scoreMeter!: HTMLElement;
  private phoneRows!: HTMLElement;

  private queue: SafetraceMessage[] = [];
  private live = new Set<HTMLElement>();
  private promptFade = 0;
  private dialogueTimer = 0;

  constructor(
    private root: HTMLElement,
    private sim: Sim,
    private settings: Settings,
    private touch = false,
    private onVerb: (verb: HackVerb, nodeId: string) => void = () => {},
  ) {
    root.innerHTML = `
      <div id="phone">
        <div class="wordmark">${WORDMARK}</div>
        <div class="score-row">
          <span class="score-label">Community Safety Score</span>
          <span class="score-value" id="score">96</span>
        </div>
        <div class="meter"><i id="meter" style="width:4%"></i></div>
        <div class="phone-rows" id="phone-rows"></div>
      </div>
      <div id="notifications"></div>
      <div id="inspect"></div>
      <div id="pocket">
        <div id="bearings"></div>
        <div class="cap">Bearings</div>
      </div>
      <div id="prompts"></div>
      <div id="dialogue"></div>
      <div id="debug"></div>
    `;
    this.notifications = root.querySelector('#notifications')!;
    this.inspect = root.querySelector('#inspect')!;
    this.prompts = root.querySelector('#prompts')!;
    this.prompts.innerHTML = touch ? TOUCH_PROMPTS : KEY_PROMPTS;
    this.bearings = root.querySelector('#bearings')!;
    this.dialogue = root.querySelector('#dialogue')!;
    this.debug = root.querySelector('#debug')!;
    this.scoreValue = root.querySelector('#score')!;
    this.scoreMeter = root.querySelector('#meter')!;
    this.phoneRows = root.querySelector('#phone-rows')!;

    for (let i = 0; i < sim.player.maxBearings; i++) {
      const el = document.createElement('i');
      this.bearings.appendChild(el);
    }

    // Verb chips are the one place the HUD accepts input. Delegated, so the
    // panel can re-render freely underneath.
    this.inspect.addEventListener('pointerup', (e) => {
      const target = (e.target as HTMLElement).closest('.verb') as HTMLElement | null;
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      const jumpTo = target.dataset.node;
      if (jumpTo) { this.sim.selectNode(jumpTo); return; }
      const verb = target.dataset.verb as HackVerb | undefined;
      const nodeId = this.inspect.dataset.node;
      if (verb && nodeId) this.onVerb(verb, nodeId);
    });
    this.inspect.addEventListener('pointerdown', (e) => e.stopPropagation());

    sim.bus.on('safetrace:message', (m) => this.queue.push(m));
    document.documentElement.style.setProperty('--text-scale', String(settings.textScale));
  }

  say(lines: string[], seconds = 3.4): void {
    this.dialogue.textContent = lines.join('  ');
    this.dialogue.classList.add('show');
    this.dialogueTimer = seconds;
  }

  clearSay(): void {
    this.dialogue.classList.remove('show');
    this.dialogueTimer = 0;
  }

  setVisible(v: boolean): void {
    this.root.style.opacity = v ? '1' : '0';
    this.root.style.transition = 'opacity 500ms cubic-bezier(.16,1,.3,1)';
  }

  update(dt: number): void {
    this.drainMessages();
    this.updatePhone();
    this.updateInspect();
    this.updateBearings();

    if (this.dialogueTimer > 0) {
      this.dialogueTimer -= dt;
      if (this.dialogueTimer <= 0) this.dialogue.classList.remove('show');
    }

    // Input prompts fade out permanently once the verbs are demonstrated.
    if (this.promptFade < 1 && this.sim.player.odometer > 140) {
      this.promptFade = Math.min(1, this.promptFade + dt * 0.4);
      this.prompts.style.opacity = String(1 - this.promptFade);
    }

    this.debug.classList.toggle('show', this.settings.showDebug);
    if (this.settings.showDebug) this.updateDebug();
  }

  private drainMessages(): void {
    while (this.queue.length && this.live.size < 5) {
      const m = this.queue.shift()!;
      const el = document.createElement('div');
      el.className = `note ${m.register === 'SYSTEM' ? 'system' : 'care'}${m.emphasis === 'strong' ? ' strong' : ''}`;
      const brand = m.register === 'SYSTEM' ? 'SAFEtrace CITY' : 'SAFEtrace CARE';
      el.innerHTML =
        `<div class="brand"><span>${brand}</span><span>now</span></div>` +
        m.lines.map((l) => `<div class="line">${escapeHtml(l)}</div>`).join('');
      this.notifications.appendChild(el);
      this.live.add(el);
      window.setTimeout(() => {
        el.classList.add('leaving');
        window.setTimeout(() => { el.remove(); this.live.delete(el); }, 260);
      }, m.duration * 1000);
    }
  }

  private updatePhone(): void {
    const risk = this.sim.playerRisk;
    const score = Math.round(100 - risk);
    this.scoreValue.textContent = String(score);
    this.scoreMeter.style.width = `${Math.max(2, 100 - risk)}%`;
    this.scoreMeter.style.background =
      risk < 25 ? 'var(--st-teal)' : risk < 65 ? 'var(--st-warn)' : 'var(--st-risk)';

    const t = this.sim.playerTrack;
    const flags = [...t.flags].filter((f) => f !== 'NORMAL_TRANSIT');
    const rows: Array<[string, string]> = [
      ['STATUS', riskLabel(risk)],
      ['SUBJECT', t.attributedIdentity === 'UNKNOWN' ? 'UNRESOLVED' : this.sim.playerSubject.displayName],
    ];
    if (this.sim.visionUnlocked) {
      rows.push(['TRACK', t.confidence > 0.28 ? `HELD ${Math.round(t.confidence * 100)}%` : 'NOT HELD']);
      rows.push(['FORECAST', `${Math.round(t.predictionConfidence * 100)}%`]);
      rows.push(['ANOMALY', `${Math.round(t.predictionError * 100)}%`]);
    }
    if (flags.length) rows.push(['FLAGS', flags.join(', ')]);

    this.phoneRows.innerHTML = rows
      .map(([k, v]) => `<div class="phone-row"><span>${escapeHtml(k)}</span><b>${escapeHtml(v)}</b></div>`)
      .join('');
  }

  private updateInspect(): void {
    const node = this.sim.focusNode;
    if (!node) { this.inspect.classList.remove('show'); return; }
    this.inspect.classList.add('show');

    const hack = this.sim.hack;
    const progress = hack ? 1 - hack.ticksRemaining / hack.ticksTotal : 0;
    const verbs = availableVerbs(node);

    const rolling = this.sim.player.speed > 1.4;

    this.inspect.innerHTML =
      `<div class="node-id">${escapeHtml(node.id)}</div>` +
      `<div>${escapeHtml(node.label)}</div>` +
      `<div class="rec">SEGMENT ${escapeHtml(node.segmentId)} · ${escapeHtml(node.state)}</div>` +
      (node.discovered && node.records?.length
        ? node.records.map((r) => `<div class="rec">${escapeHtml(r)}</div>`).join('')
        : '') +
      (node.discovered && node.edges.length
        ? `<div class="rec">EDGES: ${node.edges.map(escapeHtml).join(', ')}</div>`
        : '') +
      (rolling ? `<div class="rec hold">${escapeHtml(SYSTEM.holdStill)}</div>` : '') +
      this.tracedChips(node, verbs.length) +
      `<div class="verbs">${
        verbs.map((v, i) => {
          const busy = hack?.verb === v;
          const pct = busy ? ` ${Math.round(progress * 100)}%` : '';
          const label = this.touch ? `${v}${pct}` : `${i + 1} ${v}${pct}`;
          const cls = `verb${busy ? ' busy' : ''}${rolling ? ' waiting' : ''}`;
          return `<button class="${cls}" data-verb="${v}">${label}</button>`;
        }).join('')
      }</div>`;

    // Rebinding every frame would fight the touch layer, so the panel owns one
    // delegated handler for the life of the HUD.
    this.inspect.dataset.node = node.id;
  }

  /**
   * Records the player has followed an edge to.
   *
   * A service has no location, so once traced it can be read from anywhere.
   * Without this the chain existed in the simulation and was unreachable by a
   * person, which is the same as not existing.
   */
  private tracedChips(node: NetworkNode, verbCount: number): string {
    const services = this.sim.reachableServices().filter((s) => s.id !== node.id);
    if (services.length === 0) return '';
    return `<div class="traced"><span class="rec">TRACED</span>${
      services.map((s, i) => {
        const key = this.touch ? '' : `${verbCount + i + 1} `;
        return `<button class="verb node" data-node="${s.id}">${key}${escapeHtml(s.id)}</button>`;
      }).join('')
    }</div>`;
  }

  private updateBearings(): void {
    const kids = this.bearings.children;
    for (let i = 0; i < kids.length; i++) {
      (kids[i] as HTMLElement).classList.toggle('spent', i >= this.sim.player.bearings);
    }
  }

  private updateDebug(): void {
    const p = this.sim.player;
    const t = this.sim.playerTrack;
    this.debug.textContent = [
      `tick   ${this.sim.tick}`,
      `speed  ${p.speed.toFixed(2)} / ${this.sim.playerMaxSpeed.toFixed(1)}`,
      `flow   ${p.flow.toFixed(2)}  stance ${p.stance}`,
      `surf   ${this.sim.world.surfaceAt(p.pos)}`,
      `risk   ${t.risk.total.toFixed(1)} (${riskLabel(t.risk.total)})`,
      `  beh  ${t.risk.behaviour.toFixed(1)}`,
      `  evd  ${t.risk.evidence.toFixed(1)}`,
      `  inc  ${t.risk.incident.toFixed(1)}`,
      `  ano  ${t.risk.anomaly.toFixed(1)}`,
      `  his  ${t.risk.history.toFixed(1)}`,
      `conf   ${t.confidence.toFixed(2)}  pred ${t.predictionConfidence.toFixed(2)}`,
      `error  ${t.predictionError.toFixed(3)}`,
      `flags  ${[...t.flags].join(',')}`,
      `esc    ${this.sim.escalation}`,
      `seen   ${this.sim.playerObserved}`,
    ].join('\n');
  }
}

export function availableVerbs(node: NetworkNode): HackVerb[] {
  const out: HackVerb[] = ['QUERY', 'TRACE'];
  if (node.kind === 'CAMERA') out.push('LOOP');
  out.push('REROUTE');
  if (node.kind === 'UPLINK' || node.kind === 'JUNCTION') out.push('SUPPRESS');
  if (node.kind === 'UPLINK') out.push('MASK');
  return out;
}

export const VERB_SPECS = VERBS;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}
