// FORTNITE-STYLE RADIAL EMOTE WHEEL (Toon HUD).
// Opens when the player holds (or taps) the Emote key (H / Y by default):
//   - Pointer-locked mode: mouse movement moves a virtual aim vector from the wheel hub to highlight one of 6 slices;
//     releasing the key (or left-clicking) immediately plays the highlighted dance!
//   - Unlocked cursor / click: hovering or clicking any slice plays it; keys 1–6 also trigger slices directly.
//   - Center hub shows the highlighted dance's name, BPM & rarity glow (or "REPEAT LAST" when centered).
import { EMOTES, type DanceId } from "../actors/emotes";
import { addCss, uiAsset } from "./styles";
import { T } from "./toon";

const CSS = `
.kr-emwheel { position: fixed; inset: 0; z-index: 42; display: flex; align-items: center; justify-content: center;
  pointer-events: none; opacity: 0; transform: scale(.92); transition: opacity .12s ease, transform .14s cubic-bezier(.22,1.15,.36,1); }
.kr-emwheel.on { opacity: 1; transform: scale(1); pointer-events: auto; }
.kr-emwheel-box { position: relative; width: ${T(540)}; height: ${T(540)}; }
.kr-emwheel svg.ring { width: 100%; height: 100%; overflow: visible; filter: drop-shadow(0 ${T(10)} 0 rgba(10,16,24,.78)); }
.kr-emwheel .sl { cursor: pointer; transition: transform .1s ease, filter .1s ease; transform-origin: 260px 260px; }
.kr-emwheel .sl path { fill: rgba(14,25,38,.92); stroke: var(--kong-outline); stroke-width: 6; stroke-linejoin: round; transition: fill .1s ease; }
.kr-emwheel .sl.hi { transform: scale(1.045); }
.kr-emwheel .sl.hi path { fill: color-mix(in srgb, var(--c) 38%, rgba(14,25,38,.96)); stroke: var(--c); stroke-width: 7; }
.kr-emwheel .sl .arc { fill: none; stroke: var(--c); stroke-width: 7; stroke-linecap: round; opacity: .75; }
.kr-emwheel .sl.hi .arc { opacity: 1; stroke-width: 10; }
.kr-emwheel .item { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: ${T(126)};
  display: flex; flex-direction: column; align-items: center; text-align: center; pointer-events: none; }
.kr-emwheel .item .ic { width: ${T(76)}; height: ${T(76)}; object-fit: contain;
  filter: drop-shadow(0 ${T(4)} 0 var(--kong-outline)) drop-shadow(0 0 ${T(6)} rgba(0,0,0,.45));
  transition: transform .12s cubic-bezier(.22,1.25,.36,1), filter .12s ease; }
.kr-emwheel .item.hi .ic { transform: scale(1.18) translateY(${T(-3)});
  filter: drop-shadow(0 ${T(6)} 0 var(--kong-outline)) drop-shadow(0 0 ${T(14)} color-mix(in srgb, var(--c) 75%, transparent)); }
.kr-emwheel .item .nm { margin-top: ${T(2)}; font-family: var(--kong-font-display); font-size: ${T(16)}; line-height: 1.02;
  letter-spacing: .03em; color: var(--kong-text); -webkit-text-stroke: ${T(3.5)} var(--kong-outline); paint-order: stroke fill; white-space: nowrap; }
.kr-emwheel .item .num { position: absolute; top: ${T(-4)}; right: ${T(14)}; min-width: ${T(22)}; height: ${T(22)}; padding: 0 ${T(5)};
  border-radius: ${T(6)}; background: var(--kong-surface-2); border: ${T(2.5)} solid var(--kong-outline); color: var(--kong-accent);
  font-family: var(--kong-font-ui); font-weight: 900; font-size: ${T(12)}; line-height: ${T(17)}; text-align: center; z-index: 2; }
.kr-emwheel .hub { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: ${T(168)}; height: ${T(168)};
  border-radius: 50%; background: var(--kong-gradient-panel); border: var(--kong-outline-md) solid var(--kong-outline);
  box-shadow: 0 ${T(6)} 0 var(--kong-outline), inset 0 0 0 ${T(3)} var(--hc, var(--kong-accent));
  display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: ${T(12)}; pointer-events: none; }
.kr-emwheel .hub .eb { font-family: var(--kong-font-ui); font-weight: 900; font-size: ${T(11)}; letter-spacing: .16em; text-transform: uppercase; color: var(--hc, var(--kong-accent)); }
.kr-emwheel .hub .t { margin-top: ${T(4)}; font-family: var(--kong-font-display); font-size: ${T(22)}; line-height: 1.05; color: var(--kong-text);
  -webkit-text-stroke: ${T(3.5)} var(--kong-outline); paint-order: stroke fill; }
.kr-emwheel .hub .sub { margin-top: ${T(6)}; font-family: var(--kong-font-ui); font-weight: 800; font-size: ${T(11)}; letter-spacing: .1em;
  text-transform: uppercase; color: var(--kong-text-muted); }
.kr-emwheel .ptr { position: absolute; left: 50%; top: 50%; width: ${T(16)}; height: ${T(16)}; margin: ${T(-8)} 0 0 ${T(-8)};
  border-radius: 50%; background: var(--kong-accent); border: ${T(3)} solid var(--kong-outline); pointer-events: none; opacity: 0; }
.kr-emwheel .ptr.on { opacity: 1; }
.kr-emwheel .foot { position: absolute; left: 50%; bottom: ${T(-42)}; transform: translateX(-50%); white-space: nowrap;
  padding: ${T(6)} ${T(18)}; border-radius: 999px; background: rgba(10,18,28,.88); border: var(--kong-outline-xs) solid var(--kong-outline);
  font-family: var(--kong-font-ui); font-weight: 900; font-size: ${T(13)}; letter-spacing: .12em; text-transform: uppercase; color: var(--kong-text); }
.kr-emwheel .foot b { color: var(--kong-accent); }
`;

const CX = 260, CY = 260, R_IN = 94, R_OUT = 240, R_ARC = 228, R_LABEL = 168;
const N = EMOTES.length;
const STEP = (Math.PI * 2) / N;
const GAP = 0.036;

function polar(r: number, a: number): [number, number] {
  return [CX + Math.cos(a) * r, CY + Math.sin(a) * r];
}
function slicePath(i: number): string {
  const a0 = -Math.PI / 2 - STEP / 2 + i * STEP + GAP;
  const a1 = -Math.PI / 2 - STEP / 2 + (i + 1) * STEP - GAP;
  const [x0, y0] = polar(R_OUT, a0), [x1, y1] = polar(R_OUT, a1);
  const [x2, y2] = polar(R_IN, a1), [x3, y3] = polar(R_IN, a0);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${R_OUT} ${R_OUT} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)} A${R_IN} ${R_IN} 0 0 0 ${x3.toFixed(1)} ${y3.toFixed(1)} Z`;
}
function arcPath(i: number): string {
  const a0 = -Math.PI / 2 - STEP / 2 + i * STEP + GAP * 2.2;
  const a1 = -Math.PI / 2 - STEP / 2 + (i + 1) * STEP - GAP * 2.2;
  const [x0, y0] = polar(R_ARC, a0), [x1, y1] = polar(R_ARC, a1);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${R_ARC} ${R_ARC} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

export interface EmoteWheel {
  readonly el: HTMLElement;
  readonly open: boolean;
  readonly selected: DanceId | -1;
  show(lastId: DanceId, keyLabel: string, dancing: boolean): void;
  hide(): void;
  /** feed mouse delta (pointer-locked wheel selection) */
  moveDelta(dx: number, dy: number): void;
  /** pick directly via 0..5 */
  select(id: DanceId | -1): void;
  onPick: ((id: DanceId) => void) | null;
  onStop: (() => void) | null;
  dispose(): void;
}

export function createEmoteWheel(parent: HTMLElement): EmoteWheel {
  addCss("kr-ui-emwheel", CSS);
  const root = document.createElement("div");
  root.className = "kr-emwheel";
  const box = document.createElement("div");
  box.className = "kr-emwheel-box";
  root.appendChild(box);

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 520 520");
  svg.setAttribute("class", "ring");
  box.appendChild(svg);

  const slices: SVGGElement[] = [];
  const items: HTMLDivElement[] = [];

  for (let i = 0; i < N; i++) {
    const em = EMOTES[i];
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "sl");
    g.style.setProperty("--c", em.color);
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", slicePath(i));
    const a = document.createElementNS("http://www.w3.org/2000/svg", "path");
    a.setAttribute("class", "arc");
    a.setAttribute("d", arcPath(i));
    g.appendChild(p); g.appendChild(a);
    g.addEventListener("pointerenter", () => setSel(em.id));
    g.addEventListener("pointerdown", (ev) => { ev.stopPropagation(); setSel(em.id); api.onPick?.(em.id); });
    svg.appendChild(g);
    slices.push(g);

    const mid = -Math.PI / 2 + i * STEP;
    const [lx, ly] = polar(R_LABEL, mid);
    const it = document.createElement("div");
    it.className = "item";
    it.style.setProperty("--c", em.color);
    it.style.left = `${(lx / 520) * 100}%`;
    it.style.top = `${(ly / 520) * 100}%`;
    it.innerHTML = `<span class="num">${i + 1}</span><img class="ic" src="${uiAsset(`icons/emote-${em.key}.webp`)}" alt="${em.name}" draggable="false"/><span class="nm">${em.name}</span>`;
    box.appendChild(it);
    items.push(it);
  }

  const hub = document.createElement("div");
  hub.className = "hub";
  const hubEb = document.createElement("div"); hubEb.className = "eb";
  const hubT = document.createElement("div"); hubT.className = "t";
  const hubSub = document.createElement("div"); hubSub.className = "sub";
  hub.append(hubEb, hubT, hubSub);
  box.appendChild(hub);

  const ptr = document.createElement("div");
  ptr.className = "ptr";
  box.appendChild(ptr);

  const foot = document.createElement("div");
  foot.className = "foot";
  box.appendChild(foot);

  parent.appendChild(root);

  let isOpen = false;
  let sel: DanceId | -1 = -1;
  let last: DanceId = 0;
  let dancingNow = false;
  let vx = 0, vy = 0;

  function renderHub() {
    if (sel >= 0) {
      const em = EMOTES[sel];
      hub.style.setProperty("--hc", em.color);
      hubEb.textContent = `${em.tag} · ${em.bpm} BPM`;
      hubT.textContent = em.name;
      hubSub.textContent = "RELEASE / CLICK";
    } else {
      const em = EMOTES[last];
      hub.style.setProperty("--hc", dancingNow ? "#ff4d6d" : em.color);
      hubEb.textContent = dancingNow ? "DANCING NOW" : "EMOTE WHEEL";
      hubT.textContent = dancingNow ? "STOP DANCE" : em.name;
      hubSub.textContent = dancingNow ? "RELEASE TO STOP" : "AIM OR PRESS 1–6";
    }
  }

  function setSel(id: DanceId | -1) {
    if (sel === id) return;
    sel = id;
    for (let i = 0; i < N; i++) {
      const on = i === sel;
      slices[i].classList.toggle("hi", on);
      items[i].classList.toggle("hi", on);
    }
    renderHub();
  }

  const api: EmoteWheel = {
    el: root,
    get open() { return isOpen; },
    get selected() { return sel; },
    onPick: null,
    onStop: null,
    show(lastId, keyLabel, dancing) {
      last = lastId; dancingNow = dancing;
      vx = 0; vy = 0;
      ptr.classList.remove("on");
      setSel(-1);
      renderHub();
      foot.innerHTML = `AIM + RELEASE <b>${keyLabel}</b> · OR PRESS <b>1–6</b> · <b>MOVE</b> TO CANCEL`;
      isOpen = true;
      root.classList.add("on");
    },
    hide() {
      if (!isOpen) return;
      isOpen = false;
      root.classList.remove("on");
      ptr.classList.remove("on");
    },
    moveDelta(dx, dy) {
      if (!isOpen) return;
      vx += dx * 0.7; vy += dy * 0.7;
      const d = Math.hypot(vx, vy);
      if (d > 110) { vx = (vx / d) * 110; vy = (vy / d) * 110; }
      if (d < 22) {
        ptr.classList.remove("on");
        setSel(-1);
      } else {
        ptr.classList.add("on");
        ptr.style.transform = `translate(${(vx * 0.72).toFixed(1)}px, ${(vy * 0.72).toFixed(1)}px)`;
        // angle from top (-PI/2) clockwise into 0..N-1
        let a = Math.atan2(vy, vx) + Math.PI / 2 + STEP / 2;
        a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const idx = Math.floor(a / STEP) % N;
        setSel(idx as DanceId);
      }
    },
    select(id) { setSel(id); },
    dispose() { root.remove(); },
  };
  return api;
}
