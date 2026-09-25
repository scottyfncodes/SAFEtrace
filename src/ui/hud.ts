/**
 * The diegetic HUD.
 *
 * Almost every element is a thing in the fiction: the risk score is the
 * SAFEtrace app's own Community Safety Score widget that every resident has.
 * There is no ammunition counter, because there is no ammunition — the
 * slingshot throws rocks, and the town is made of them.
 */
import type { Sim } from '../sim/sim';
import type { Settings } from '../core/settings';
import type { MessagePriority, SafetraceMessage } from '../sim/events';
import { VERBS, verbsFor, type HackVerb, type NetworkNode } from '../sim/surveillance/network';

const KEY_PROMPTS = [
  '<span><kbd>W</kbd>push</span>',
  '<span><kbd>A D</kbd>carve</span>',
  '<span><kbd>Space</kbd>ollie</span>',
  // A phone has a TRICK button in the corner; a keyboard had the same verb on
  // an unlisted key, so half the players never found out it existed.
  '<span><kbd>R</kbd>trick</span>',
  '<span><kbd>G</kbd>grab</span>',
  '<span><kbd>RMB</kbd>look</span>',
  '<span><kbd>S</kbd>slide</span>',
  '<span><kbd>F</kbd>sling</span>',
  '<span><kbd>Q</kbd>plan</span>',
  '<span><kbd>E</kbd>talk / look</span>',
  '<span><kbd>N</kbd>notes</span>',
].join('');

// Two lines, not three. The ollie, the sling and the plan view are all buttons
// you can see, so there is nothing left to tell anybody about them.
const TOUCH_PROMPTS = [
  '<span>hold to roll</span>',
  '<span>push the way you want to go</span>',
].join('');
import { riskLabel } from '../sim/surveillance/risk';
import { resolveRecords } from '../sim/worldTypes';
import { INSPECT, PHONE, SYSTEM } from '../content/copy';
import type { TalkView } from '../content/story';


export class Hud {
  private notifications: HTMLElement;
  private inspect: HTMLElement;
  private prompts: HTMLElement;
  private dialogue: HTMLElement;
  private debug: HTMLElement;
  /**
   * The Community Safety Score is not on the HUD. It is found (see
   * `Sim.scoreDiscovered`), and after that it only speaks when it moves from
   * one band to another — a small chip under the buttons, and gone.
   */
  private scoreChip!: HTMLElement;
  private lastBand: string | null = null;
  private chipTimer = 0;

  private talk: HTMLElement;
  private toasts: HTMLElement;
  private notesBadge: HTMLElement;
  private buttons: HTMLElement;
  private talkView: TalkView | null = null;
  /** Set by the host: where a conversation's taps and answers go. */
  talkHandlers: { advance(): void; choose(id: string): void } = { advance: () => {}, choose: () => {} };
  /** Set by the host: the two buttons under the phone. */
  onButton: (which: 'notes' | 'menu') => void = () => {};

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
      <div id="corner">
      <div id="hud-buttons">
        <button class="hud-button" data-act="notes" aria-label="Notes">
          <span class="hb-label">Notes</span><span class="hb-key">${touch ? '' : 'N'}</span><span class="badge" id="notes-badge"></span>
        </button>
        <button class="hud-button" data-act="menu" aria-label="Pause">
          <span class="hb-label">${touch ? 'II' : 'Menu'}</span><span class="hb-key">${touch ? '' : 'Esc'}</span>
        </button>
      </div>
      <div id="score-chip" aria-live="polite"></div>
      </div>
      <div id="notifications"></div>
      <div id="inspect"></div>
      <div id="prompts"></div>
      <div id="dialogue"></div>
      <div id="talk"></div>
      <div id="toasts"></div>
      <div id="debug"></div>
    `;
    this.notifications = root.querySelector('#notifications')!;
    this.inspect = root.querySelector('#inspect')!;
    this.prompts = root.querySelector('#prompts')!;
    this.prompts.innerHTML = touch ? TOUCH_PROMPTS : KEY_PROMPTS;
    this.dialogue = root.querySelector('#dialogue')!;
    this.debug = root.querySelector('#debug')!;
    this.scoreChip = root.querySelector('#score-chip')!;
    this.talk = root.querySelector('#talk')!;
    this.toasts = root.querySelector('#toasts')!;
    this.notesBadge = root.querySelector('#notes-badge')!;
    this.buttons = root.querySelector('#hud-buttons')!;

    this.buttons.addEventListener('pointerup', (e) => {
      const b = (e.target as HTMLElement).closest('.hud-button') as HTMLElement | null;
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      if (b.dataset.act === 'notes') this.onButton('notes');
      else this.onButton('menu');
    });
    this.buttons.addEventListener('pointerdown', (e) => e.stopPropagation());

    // A conversation: tap the card to hear the next line, tap an answer to say it.
    this.talk.addEventListener('pointerup', (e) => {
      const choice = (e.target as HTMLElement).closest('.choice') as HTMLElement | null;
      e.preventDefault(); e.stopPropagation();
      if (choice?.dataset.choice) { this.talkHandlers.choose(choice.dataset.choice); return; }
      if (!this.talkView?.choices.length) this.talkHandlers.advance();
    });
    this.talk.addEventListener('pointerdown', (e) => e.stopPropagation());

    sim.bus.on('case:clue', ({ id }) => {
      const c = sim.casefile.clue(id);
      // The first note ever says where the notes are; nobody needs telling twice.
      if (c) this.toast('NOTED', sim.casefile.clues.size === 1 ? `${c.title} — ${touch ? 'tap Notes' : 'N'} to read` : c.title, false);
    });
    sim.bus.on('score:discovered', ({ score }) => {
      // Said once, as a thing found, in the same voice as a note.
      this.toast('FOUND', `${PHONE.found} — ${score}, ${riskLabel(100 - score).toLowerCase()}`, true);
      this.lastBand = riskLabel(sim.playerRisk);
    });
    sim.bus.on('case:deduction', ({ id }) => {
      const d = sim.casefile.deduction(id);
      if (d) this.toast('CONNECTED', d.title, true);
    });

    // Verb chips are the one place the HUD accepts input. Delegated, so the
    // panel can re-render freely underneath.
    this.inspect.addEventListener('pointerup', (e) => {
      const target = (e.target as HTMLElement).closest('.verb') as HTMLElement | null;
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      if (target.dataset.close) { this.sim.dismissFocus(); return; }
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

  /**
   * A conversation, or a thing being looked at. Speech, a name, and — on the
   * last line — the answers the player can give. Numbered on a keyboard,
   * tappable on a phone, and never more than three.
   */
  showTalk(view: TalkView | null): void {
    this.talkView = view;
    this.root.classList.toggle('talking', !!view);
    if (!view) { this.talk.classList.remove('show'); return; }
    const key = this.touch ? 'tap' : 'E';
    const who = view.who
      ? `<div class="who">${escapeHtml(view.who)}</div>`
      : `<div class="who look">You look closer</div>`;
    const choices = view.choices.length
      ? `<div class="choices">${view.choices.map((c, i) =>
        `<button class="choice" data-choice="${escapeHtml(c.id)}">${this.touch ? '' : `<kbd>${i + 1}</kbd>`}${escapeHtml(c.label)}</button>`).join('')}</div>`
      : `<div class="next">${view.more ? `${key} ▸` : `${key} — done`}</div>`;
    this.talk.innerHTML = `${who}<div class="said${view.kind === 'place' ? ' narration' : ''}">${escapeHtml(view.text)}</div>${choices}`;
    this.talk.classList.add('show');
  }

  get talkChoices(): string[] { return this.talkView?.choices.map((c) => c.id) ?? []; }

  /** Something went in the notes. Small, top-centre, and gone. */
  private toast(kind: string, title: string, strong: boolean): void {
    const el = document.createElement('div');
    el.className = `toast${strong ? ' strong' : ''}`;
    el.innerHTML = `<span class="tk">${escapeHtml(kind)}</span><span class="tt">${escapeHtml(title)}</span>`;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
    window.setTimeout(() => { el.classList.add('leaving'); window.setTimeout(() => el.remove(), 400); }, strong ? 4200 : 3000);
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
    this.updateScoreChip(dt);
    this.updateInspect();

    if (this.dialogueTimer > 0) {
      this.dialogueTimer -= dt;
      if (this.dialogueTimer <= 0) this.dialogue.classList.remove('show');
    }

    // Input prompts fade out permanently once the verbs are demonstrated.
    if (this.promptFade < 1 && this.sim.player.odometer > 140) {
      this.promptFade = Math.min(1, this.promptFade + dt * 0.4);
      this.prompts.style.opacity = String(1 - this.promptFade);
    }

    // Aiming is one job. The phone stays — SAFEtrace does not stop watching
    // because you stood still — but nothing else competes with the reticle.
    this.prompts.style.visibility = this.sim.aimMode ? 'hidden' : '';
    // Nor does a node panel sit over the plan: the plan cannot reach into
    // anything, so a panel full of verbs on top of it is only in the way.
    this.inspect.classList.toggle('hidden', this.sim.aimMode || this.sim.planViewActive);
    this.dialogue.classList.toggle('hidden', this.sim.aimMode);
    this.talk.classList.toggle('hidden', this.sim.aimMode);

    // The notes button says how much is new, and whether there is something in
    // there worth sitting down with — never what it is.
    const cf = this.sim.casefile;
    const unseen = cf.unseen;
    const open = cf.openConnections();
    const badge = unseen > 0 ? String(unseen) : open > 0 ? '•' : '';
    if (this.notesBadge.textContent !== badge) this.notesBadge.textContent = badge;
    this.buttons.classList.toggle('has-notes', cf.clues.size > 0);

    this.debug.classList.toggle('show', this.settings.showDebug);
    if (this.settings.showDebug) this.updateDebug();
  }

  /**
   * How many of each tier may be on screen at once.
   *
   * The old rule was "five of anything", which meant an advert about the
   * weather could sit on top of a patrol being authorised, and the first human
   * to play could not tell one from the other. Attention is scarce, so the
   * budget is explicit: a critical message always gets through, and the town's
   * chatter is the first thing dropped when the town is busy.
   */
  private static readonly BUDGET: Record<MessagePriority, number> = {
    critical: 2, important: 2, context: 2, ambient: 1,
  };

  private liveOf(priority: MessagePriority): number {
    let n = 0;
    for (const el of this.live) if (el.dataset.priority === priority) n++;
    return n;
  }

  private drainMessages(): void {
    /*
     * The town gets louder as it gets more interested in you.
     *
     * Before Devon is stopped, SAFEtrace is a pleasant utility that mentions
     * the weather; the player is learning to move and has no frame for a
     * segment or a node. So until VISION is unlocked the quiet tiers are
     * dropped and only what is actually happening gets through. Nothing is
     * rewritten and nothing is softened — the same words arrive later, when
     * they land instead of pile up.
     */
    if (!this.sim.visionUnlocked) {
      this.queue = this.queue.filter((m) => m.priority === 'critical' || m.priority === 'important');
    }

    // Anything urgent on screen silences the flavour underneath it, rather than
    // stacking on top of it.
    if (this.liveOf('critical') > 0) {
      for (const el of this.live) {
        if (el.dataset.priority === 'ambient') this.retire(el, 0);
      }
      this.queue = this.queue.filter((m) => m.priority !== 'ambient');
    }

    for (let guard = 0; guard < 8 && this.queue.length; guard++) {
      const next = this.queue[0];
      if (this.liveOf(next.priority) >= Hud.BUDGET[next.priority]) {
        // A tier that is full drops its oldest rather than queueing behind it:
        // stale surveillance is worse than none.
        if (next.priority === 'critical' || next.priority === 'important') {
          const oldest = [...this.live].find((el) => el.dataset.priority === next.priority);
          if (oldest) this.retire(oldest, 0);
        } else {
          this.queue.shift();
          continue;
        }
      }
      const m = this.queue.shift()!;
      // The same thing said twice in a row is said once.
      const key = m.lines.join('|');
      if ([...this.live].some((el) => el.dataset.key === key)) continue;

      const el = document.createElement('div');
      el.className = `note ${m.register === 'SYSTEM' ? 'system' : 'care'} p-${m.priority}${m.emphasis === 'strong' ? ' strong' : ''}`;
      el.dataset.priority = m.priority;
      el.dataset.key = key;
      const brand = m.register === 'SYSTEM' ? 'SAFEtrace CITY' : 'SAFEtrace CARE';
      el.innerHTML =
        `<div class="brand"><span>${brand}</span><span>now</span></div>` +
        m.lines.map((l) => `<div class="line">${escapeHtml(l)}</div>`).join('');
      // Critical first, so the eye lands on it without hunting.
      if (m.priority === 'critical') this.notifications.prepend(el);
      else this.notifications.appendChild(el);
      this.live.add(el);
      // Ambient is briefer than it was: it is texture, not information.
      const seconds = m.priority === 'ambient' ? Math.min(m.duration, 3.0)
        : m.priority === 'critical' ? m.duration + 1.2 : m.duration;
      this.retire(el, seconds * 1000);
    }
  }

  private retire(el: HTMLElement, afterMs: number): void {
    if (el.dataset.retiring) return;
    el.dataset.retiring = '1';
    window.setTimeout(() => {
      el.classList.add('leaving');
      window.setTimeout(() => { el.remove(); this.live.delete(el); }, 260);
    }, afterMs);
  }

  private updateScoreChip(dt: number): void {
    if (this.chipTimer > 0) {
      this.chipTimer -= dt;
      if (this.chipTimer <= 0) this.scoreChip.classList.remove('show');
    }
    if (!this.sim.scoreDiscovered) return;
    const risk = this.sim.playerRisk;
    const band = riskLabel(risk);
    if (this.lastBand === null) { this.lastBand = band; return; }
    if (band === this.lastBand) return;
    this.lastBand = band;
    this.scoreChip.textContent = PHONE.moved(Math.round(100 - risk), band);
    this.scoreChip.dataset.band = risk < 25 ? 'ok' : risk < 65 ? 'warn' : 'risk';
    this.scoreChip.classList.add('show');
    this.chipTimer = 4.5;
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
      `<div class="node-head">` +
        `<span class="node-kind">${escapeHtml(INSPECT.heading)} · ${escapeHtml(INSPECT.kind[node.kind] ?? 'Node')}</span>` +
        `<button class="verb close" data-close="1">${escapeHtml(INSPECT.dismiss)}</button>` +
      `</div>` +
      `<div class="node-id">${escapeHtml(node.id)}</div>` +
      `<div>${escapeHtml(node.label)}</div>` +
      `<div class="rec">SEGMENT ${escapeHtml(node.segmentId)} · ${escapeHtml(node.state)}</div>` +
      (node.discovered ? this.recordsOf(node) : '') +
      this.holding(node) +
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
          // What it leaves behind, read before choosing: hacking is the
          // clean middle of the ladder, and how clean is part of the choice.
          const trace = `<small class="trace">${escapeHtml(VERBS[v].trace)}</small>`;
          return `<button class="${cls}" data-verb="${v}">${label}${trace}</button>`;
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

  /**
   * Who a camera currently has, with the number beside them. This is where
   * most players first find out there is a number at all.
   */
  private holding(node: NetworkNode): string {
    if (node.kind !== 'CAMERA') return '';
    const risk = this.sim.playerRisk;
    const who = this.sim.playerTrack.attributedIdentity === 'UNKNOWN' ? 'SUBJECT 4417' : this.sim.playerSubject.displayName;
    return `<div class="rec held">${escapeHtml(PHONE.record(who, Math.round(100 - risk), riskLabel(risk)))}</div>`;
  }

  /** A node's records, whether authored as text or written at read time. */
  private recordsOf(node: NetworkNode): string {
    return resolveRecords(node.records, this.sim.recordContext())
      .map((r) => `<div class="rec">${escapeHtml(r)}</div>`).join('');
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
      // The answer to "is anybody actually coming", which is a different
      // question from the score above it and now has its own state machine.
      `chase  ${this.sim.pursuit}`,
      `seen   ${this.sim.playerObserved}`,
    ].join('\n');
  }
}

/** What this node will accept. The rule lives in the simulation, not here. */
export function availableVerbs(node: NetworkNode): HackVerb[] {
  return verbsFor(node.kind);
}

export const VERB_SPECS = VERBS;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}
