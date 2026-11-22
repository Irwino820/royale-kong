// First-session help: a small, replayable controls guide (title: LEARN CONTROLS) and a contextual coach box in the
// warm-up / firing range that retires each lesson only when the game observes you doing it (never on a timer). F1 or
// its button skips the coach for good. The lesson texts describe the controls exactly as they are bound.
import { addCss } from "./styles";
import { T } from "./toon";
import { preferences } from "../settings/preferences";
import { backText, bindingText, glyphFamily, lookText, onLabelsChange } from "../settings/labels";
import { glyph, PB } from "../settings/pad";
import { device, type DeviceState } from "../settings/device";
import { DEFAULT_BINDS, type BindAction } from "../settings/bindings";

/** the lessons for the active device or a preview, with the player's current bindings and hold / toggle choices */
function controlLessons(kind: DeviceState["kind"] = device.value.kind) {
  const p = preferences.value, k = (a: BindAction) => bindingText(a, 0, kind);
  const keys = (a: BindAction) => bindingText(a, undefined, kind), any = (a: BindAction) => keys(a).split(" / ").join(" or ");
  const hold = (toggle: boolean) => toggle ? "Press" : "Hold";
  if (kind === "pad") {
    // the same ten stations, told for the controller in hand (its glyphs, its hold / toggle / auto choices)
    const pad = p.pad, sprint = pad.sprintMode === "auto" ? "Push the stick fully forward" : `${hold(pad.sprintMode === "toggle")} ${k("sprint")}`;
    const slotKeys = `${k("prevSlot")} / ${k("nextSlot")}`, look = lookText(kind);
    return [
      ["Move", `${k("fwd")} · ${look}`, `Move with ${k("fwd")} (a light push walks) and look with ${look}. Tune speeds, curves and deadzones in SETTINGS → CONTROLLER.`],
      ["Sprint, slide and crouch", `${k("sprint")} + ${k("crouch")}`, `${sprint} to sprint. Press ${k("crouch")} while sprinting to slide. ${k("crouch")} also crouches${pad.crouchToggle ? " (press it again to stand)" : ""}. Jump out of a slide.`],
      ["Mantle", `${k("jump")} at a ledge`, "Jump toward a reachable ledge to climb up."],
      ["Take a weapon", k("use"), `Look at a weapon or chest and press ${k("use")} to take or open it. With nothing to take, the same button reloads.`],
      ["Aim and fire", `${keys("aim")} · ${keys("fire")}`, `${hold(pad.aimToggle)} ${any("aim")} to aim; ${any("fire")} fires. Aim assist slows your aim over enemies (SETTINGS → CONTROLLER).`],
      ["Reload", keys("reload"), pad.binds.reload.length ? `Reload with ${any("reload")} when you have reserve ammunition.` : `Press ${k("reload")} when there is nothing to take, or hold it next to loot.`],
      ["Heal", `${slotKeys}, then ${k("fire")}`, `Cycle to a healing consumable with ${slotKeys} (${k("lastSlot")} swaps back), then hold ${any("fire")}. Changing the selected item interrupts healing.`],
      ["Map pins", k("map"), `Open the map, move the reticle with ${k("fwd")}, place a pin with ${glyph(PB.A, glyphFamily())} (${glyph(PB.X, glyphFamily())} removes it); zoom with the triggers. ${k("map")} or back closes it.`],
      ["Inventory", k("inventory"), `Open the inventory, pick a slot with the d-pad, ${glyph(PB.A, glyphFamily())} picks an item up and puts it down on another slot, ${glyph(PB.X, glyphFamily())} drops it. ${k("inventory")} or back closes it.`],
      ["Jump from the plane", `${k("jump")} / ${k("sprint")} / ${k("glider")}`, `${k("jump")} jumps from the plane. Steer with ${look} and hold ${k("sprint")} (or look down) to dive. ${k("jump")} or ${k("glider")} opens the glider; hold ${k("jump")} to cut it.`],
    ] as const;
  }
  const same = (a: BindAction) => p.binds[a].join() === DEFAULT_BINDS[a].join();
  const moves = ["fwd", "left", "back", "right"] as const;
  const alts = moves.map((a) => p.binds[a][1]).filter(Boolean);
  const move = moves.map(k).join(" ") + (moves.every(same) ? " / arrow keys" : alts.length === 4 ? ` / ${moves.map((a) => bindingText(a, 1, kind)).join(" ")}` : "");
  const slots = same("slots") ? "1–5" : p.binds.slots.map((_, i) => bindingText("slots", i, kind)).join(" ");
  return [
    ["Move", move, "Move around and look with the mouse. Click the game to capture the cursor."],
    ["Sprint, slide and crouch", `${k("sprint")} + ${k("crouch")}`, `${hold(p.sprintToggle)} ${k("sprint")} to sprint. Press ${k("crouch")} while sprinting to slide. ${k("crouch")} also crouches${p.crouchToggle ? " (press it again to stand)" : ""}. Jump out of a slide.`],
    ["Mantle", `${k("jump")} at a ledge`, "Jump toward a reachable ledge to climb up."],
    ["Take a weapon", keys("use"), `Look at a weapon or chest, then use ${any("use")} to take or open it.`],
    ["Aim and fire", `${keys("aim")} · ${keys("fire")}`, `${hold(p.aimToggle)} ${any("aim")} to aim; ${any("fire")} fires. Only the Longstem sniper has a scope zoom.`],
    ["Reload", keys("reload"), `Reload with ${any("reload")} when you have reserve ammunition.`],
    ["Heal", `${slots}, then ${keys("fire")}`, "Select a healing consumable in your hotbar, then use the fire action. Wait for the use timer to finish. Changing the selected item interrupts healing. Movement is allowed."],
    ["Map pins", `${k("map")}, then click the map`, `Open the map and click to place a pin; right click removes it. Mark your drop from the plane. ${k("map")} or Esc returns to the game.`],
    ["Inventory", k("inventory"), `Open the inventory to inspect and rearrange your slots: drag items between slots, drag one off the panel to drop it. ${k("inventory")} or Esc closes it.`],
    ["Jump from the plane", `${k("jump")} / ${k("sprint")} / ${k("glider")}`, `${k("jump")} jumps from the plane. Steer with the mouse and ${hold(p.sprintToggle).toLowerCase()} ${k("sprint")} to dive. ${k("jump")} or ${k("glider")} opens the glider; hold ${k("jump")} to cut it.`],
  ] as const;
}
const KEY = "kr-controls-seen";
export function createControlsGuide(onDismiss?: () => void, onRange?: () => void) {
  addCss("kr-onboarding", `
.kr-guide { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; pointer-events: auto; background: var(--kong-scrim);
  color: var(--kong-text); font-family: var(--kong-font-ui); }
.kr-guide[hidden] { display: none; }
.kr-guide .guide-card { position: relative; width: min(${T(760)}, calc(100vw - 40px)); max-height: calc(100vh - 40px); overflow: auto; box-sizing: border-box; padding: ${T(80)} ${T(40)} ${T(36)};
  background: var(--kong-gradient-panel); border: var(--kong-outline-md) solid var(--kong-outline); border-radius: var(--kong-radius-dialog);
  box-shadow: var(--kong-drop-dialog); animation: tn-pop var(--kong-motion-slow) var(--kong-ease-spring) both; }
.kr-guide h2 { margin: 0 0 ${T(10)}; font-family: var(--kong-font-display); font-weight: 400; font-size: ${T(56)}; line-height: 1; letter-spacing: .01em;
  -webkit-text-stroke: var(--kong-text-outline-md) var(--kong-outline); paint-order: stroke fill; text-shadow: 0 ${T(6)} 0 var(--kong-outline); }
.kr-guide .guide-intro, .kr-guide .guide-text { font-weight: 600; font-size: var(--kong-fs-body); line-height: var(--kong-lh-body); color: var(--kong-text-muted); margin: 0 0 ${T(12)}; }
.kr-guide h3 { margin: ${T(18)} 0 ${T(8)}; font-family: var(--kong-font-display); font-weight: 400; font-size: var(--kong-fs-heading); line-height: var(--kong-lh-heading);
  -webkit-text-stroke: var(--kong-text-outline-xs) var(--kong-outline); paint-order: stroke fill; }
.kr-guide .guide-key { display: inline-block; margin: 0 0 ${T(12)}; padding: ${T(4)} ${T(12)}; border-radius: var(--kong-radius-key); border: var(--kong-outline-sm) solid var(--kong-outline);
  box-shadow: var(--kong-drop-pill); background: var(--kong-accent); color: var(--kong-on-accent); font-weight: 900; font-size: var(--kong-fs-key); letter-spacing: .04em; text-transform: uppercase; }
.kr-guide .station-list { display: flex; flex-wrap: wrap; gap: ${T(10)}; margin: ${T(18)} 0 ${T(6)}; }
.kr-guide button { appearance: none; cursor: pointer; font-family: var(--kong-font-ui); font-weight: 900; text-transform: uppercase; letter-spacing: .08em; color: var(--kong-text);
  border: var(--kong-outline-sm) solid var(--kong-outline); transition: transform var(--kong-motion-fast) var(--kong-ease-spring), box-shadow var(--kong-motion-fast); }
.kr-guide button:focus-visible { outline: var(--kong-focus-width) solid var(--kong-focus); outline-offset: var(--kong-focus-offset); }
.kr-guide .guide-devices { display: flex; flex-wrap: wrap; gap: ${T(4)}; width: fit-content; padding: ${T(4)};
  border: var(--kong-outline-sm) solid var(--kong-outline); border-radius: var(--kong-radius-button); background: var(--kong-surface); }
.kr-guide .guide-devices button { min-height: ${T(40)}; padding: 0 ${T(14)}; border-color: transparent; border-radius: var(--kong-radius-key);
  background: transparent; font-size: var(--kong-fs-tab); color: var(--kong-text-muted); }
.kr-guide .guide-devices button:hover { background: var(--kong-surface-raised); color: var(--kong-text); }
.kr-guide .guide-devices button[aria-pressed=true] { background: var(--kong-accent); color: var(--kong-on-accent); }
.kr-guide .station-list button { padding: ${T(8)} ${T(16)}; border-radius: 999px; background: var(--kong-surface-2); box-shadow: var(--kong-drop-pill); font-size: ${T(14)}; color: #CFE2EE; }
.kr-guide .station-list button:hover { background: var(--kong-surface-raised); color: var(--kong-text); transform: translateY(${T(-2)}); }
.kr-guide .station-list button[aria-pressed=true] { background: var(--kong-accent); color: var(--kong-on-accent); }
.kr-guide nav { display: flex; gap: ${T(14)}; flex-wrap: wrap; margin-top: ${T(22)}; }
.kr-guide nav button { min-height: var(--kong-control-height); padding: 0 ${T(24)}; border-width: var(--kong-outline-md); border-radius: var(--kong-radius-button);
  background: var(--kong-gradient-secondary); box-shadow: var(--kong-drop-button); font-size: var(--kong-fs-tab); }
.kr-guide nav button.next { background: var(--kong-gradient-primary); color: var(--kong-on-accent); }
.kr-guide .guide-card > button.back { appearance: none; position: absolute; top: ${T(24)}; right: ${T(24)}; display: inline-flex; align-items: center; gap: ${T(14)};
  padding: ${T(10)} ${T(18)}; border-radius: ${T(14)}; border: var(--kong-outline-sm) solid var(--kong-outline); background: var(--kong-surface-2);
  box-shadow: var(--kong-drop-pill); color: var(--kong-text); font-family: var(--kong-font-ui); font-weight: 600; font-size: ${T(17)};
  line-height: ${T(26.35)}; letter-spacing: .2em; text-transform: uppercase; transition: transform var(--kong-motion-fast) var(--kong-ease-spring); }
.kr-guide .guide-card > button.back b { font-weight: 900; }
.kr-guide .guide-card > button.back:hover { background: var(--kong-surface-raised); transform: translateY(${T(-2)}); }
.kr-guide .guide-card > button.back:active { transform: translateY(${T(3)}); box-shadow: var(--kong-drop-pressed); }
.kr-guide nav button:hover { transform: translateY(${T(-3)}); box-shadow: var(--kong-drop-hover); }
.kr-guide nav button:active { transform: translateY(${T(5)}); box-shadow: var(--kong-drop-pressed); }
.kr-guide nav button.close { background: none; border-color: transparent; box-shadow: none; color: var(--kong-text-muted); }
.kr-guide nav button.close:hover { color: var(--kong-text); transform: none; box-shadow: none; }
.kr-coach { position: fixed; left: ${T(40)}; bottom: calc(${T(158)} * var(--hud-scale, 1)); z-index: 12; width: min(${T(400)}, calc(100vw - 40px)); box-sizing: border-box;
  padding: ${T(16)} ${T(20)}; pointer-events: auto; color: var(--kong-text);
  /* see-through like the HUD chips: a flat dark tint, no outline / drop / blur; the yellow left edge stays */
  background: color-mix(in srgb, var(--kong-outline) 58%, transparent); border: 0; border-radius: var(--kong-radius-card);
  box-shadow: inset ${T(5)} 0 0 var(--kong-accent); text-shadow: 0 ${T(1)} ${T(2)} color-mix(in srgb, var(--kong-outline) 80%, transparent);
  font-family: var(--kong-font-ui); font-weight: 700; font-size: ${T(17)}; line-height: 1.45; }
.kr-coach[hidden] { display: none; }
.kr-coach button { appearance: none; cursor: pointer; margin-top: ${T(12)}; min-height: ${T(40)}; padding: 0 ${T(16)}; border-radius: var(--kong-radius-button);
  border: 0; background: color-mix(in srgb, var(--kong-surface-raised) 80%, transparent); box-shadow: none; color: var(--kong-text);
  font-family: var(--kong-font-ui); font-weight: 900; font-size: ${T(14)}; letter-spacing: .08em; text-transform: uppercase;
  transition: transform var(--kong-motion-fast) var(--kong-ease-spring); }
.kr-coach button:hover { transform: translateY(${T(-2)}); }
.kr-coach button:focus-visible { outline: var(--kong-focus-width) solid var(--kong-focus); outline-offset: var(--kong-focus-offset); }
html.kr-calm .kr-guide .guide-card { animation: none; }
`);
  const root = document.createElement("div"); root.className = "kr-guide"; root.hidden = true;
  root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", "Learn the controls");
  root.innerHTML = `<div class="guide-card"><button class="back">Back · <b>Esc</b></button><h2>Learn the controls</h2><p class="guide-intro">Preview your bindings for either input. Pick any lesson or follow them in order.</p><div class="guide-devices" role="group" aria-label="Preview input"><button type="button">Keyboard &amp; mouse</button><button type="button">Controller</button></div><div class="station-list"></div><div aria-live="polite"><h3></h3><p class="guide-key"></p><p class="guide-text"></p></div><nav><button class="next">Next</button><button class="close">Skip guide</button><button class="range">Practice controls in firing range</button></nav></div>`;
  const range = root.querySelector<HTMLButtonElement>(".range")!; range.hidden = !onRange; range.onclick = () => { close(); onRange?.(); };
  let index = 0, previous: HTMLElement | null = null;
  let preview: DeviceState["kind"] | null = null;
  const [keyboard, controller] = root.querySelectorAll<HTMLButtonElement>(".guide-devices button");
  keyboard.onclick = () => { preview = "kbm"; paint(index); };
  controller.onclick = () => { preview = "pad"; paint(index); };
  const stations = root.querySelector(".station-list")!;
  const next = root.querySelector<HTMLButtonElement>(".next")!;
  const heading = root.querySelector("h3")!, key = root.querySelector(".guide-key")!, text = root.querySelector(".guide-text")!;
  const back = root.querySelector<HTMLButtonElement>(".back")!, backKey = back.querySelector("b")!;
  controlLessons("kbm").forEach(([title], i) => { const b = document.createElement("button"); b.textContent = title; b.onclick = () => paint(i); stations.append(b); });
  function paint(i: number) {
    index = i;
    const kind = preview ?? device.value.kind, lessons = controlLessons(kind), lesson = lessons[i];
    keyboard.setAttribute("aria-pressed", String(kind === "kbm"));
    controller.setAttribute("aria-pressed", String(kind === "pad"));
    backKey.textContent = backText();
    const title = `${i + 1} / ${lessons.length} · ${lesson[0]}`;
    if (heading.textContent !== title) heading.textContent = title;
    if (key.textContent !== lesson[1]) key.textContent = lesson[1];
    if (text.textContent !== lesson[2]) text.textContent = lesson[2];
    [...stations.children].forEach((b, n) => b.setAttribute("aria-pressed", String(n === i)));
    next.textContent = i === lessons.length - 1 ? "Done" : "Next";
  }
  onLabelsChange(() => { if (!root.hidden) paint(index); });
  function close() { root.hidden = true; onDismiss?.(); try { localStorage.setItem(KEY, "1"); } catch { /* private mode */ } previous?.focus(); }
  root.addEventListener("click", (e) => { if (e.target === root) close(); });
  back.onclick = close;
  (root.querySelector(".close") as HTMLButtonElement).onclick = close;
  next.onclick = () => index === stations.childElementCount - 1 ? close() : paint(index + 1);
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    if (e.key === "Tab") { const bs = [...root.querySelectorAll<HTMLButtonElement>("button:not([hidden])")]; const first = bs[0], last = bs[bs.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
  });
  return {
    el: root,
    open() { previous = document.activeElement as HTMLElement; preview = null; paint(0); root.hidden = false; next.focus(); },
  };
}
export interface CoachObservation { active: boolean; moved?: boolean; slid?: boolean; mantled?: boolean; weaponTaken?: boolean; aimedAndFired?: boolean; reloaded?: boolean; healed?: boolean; mapPinned?: boolean; inventoryOpened?: boolean }
const OBSERVATIONS = ["moved", "slid", "mantled", "weaponTaken", "aimedAndFired", "reloaded", "healed", "mapPinned", "inventoryOpened"] as const;
/** No timer-based completion: each station retires only on observed success. */
export function createControlCoach() {
  const root = document.createElement("aside"); root.className = "kr-coach"; root.hidden = true; root.setAttribute("aria-label", "Controls coach");
  const text = document.createElement("div"), skip = document.createElement("button"); skip.textContent = "Skip coaching (F1)"; root.append(text, skip);
  let enabled = true, index = 0, shown = false;
  try { enabled = localStorage.getItem(KEY) !== "1"; } catch { /* private mode */ }
  skip.onclick = () => { enabled = false; shown = false; root.hidden = true; try { localStorage.setItem(KEY, "1"); } catch { /* private mode */ } };
  // a controller has no F1: the pause menu carries the skip instead
  device.subscribe((d) => { skip.textContent = d.kind === "pad" ? "Skip coaching (pause menu)" : "Skip coaching (F1)"; });
  return {
    el: root,
    skip() { skip.click(); },
    /** a lesson was on screen when play last ran (the pause menu offers SKIP COACHING) */
    get showing() { return enabled && shown; },
    resetProgress() { index = 0; },
    replay() { enabled = true; index = 0; },
    update(s: CoachObservation) {
      if (!enabled || !s.active) { root.hidden = true; return; }
      shown = true;
      while (index < OBSERVATIONS.length && s[OBSERVATIONS[index]]) index++;
      if (index === OBSERVATIONS.length) { skip.click(); return; }
      root.hidden = false;
      const lesson = controlLessons()[index];
      text.textContent = `${lesson[0]} · ${lesson[1]}. ${lesson[2]}`;
    },
  };
}

export { createCoachObserver } from "./coach-observer";
