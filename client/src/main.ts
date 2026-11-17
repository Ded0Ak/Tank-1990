import "./style.css";
import {
  asSeq,
  asTick,
  Tank,
  Team,
  World,
  type EntityId,
  type PlayerInput,
} from "@tank1990/shared";
import { RetroAudio } from "./audio.js";
import { GameEventBus } from "./bus.js";
import { createInput } from "./input.js";
import { createLoop } from "./loop.js";
import { TankRenderer } from "./render/renderer.js";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const modeBadge = document.getElementById("mode-badge") as HTMLSpanElement;
const btnSound = document.getElementById("btn-sound") as HTMLButtonElement;
const gameOverOverlay = document.getElementById("gameover-overlay") as HTMLDivElement;
const btnRestartOverlay = document.getElementById("btn-restart-overlay") as HTMLButtonElement;

const hudP1Score = document.getElementById("hud-p1-score") as HTMLDivElement;
const hudP1Hp = document.getElementById("hud-p1-hp") as HTMLDivElement;
const hudP2Score = document.getElementById("hud-p2-score") as HTMLDivElement;
const hudP2Hp = document.getElementById("hud-p2-hp") as HTMLDivElement;
const hudBase = document.getElementById("hud-base") as HTMLSpanElement;

const btnSolo = document.getElementById("btn-solo") as HTMLButtonElement;
const btnCoop = document.getElementById("btn-coop") as HTMLButtonElement;
const btnNextStage = document.getElementById("btn-next-stage") as HTMLButtonElement;

const bus = new GameEventBus();
const audio = new RetroAudio();
audio.attach(bus);

const input = createInput(window);
const renderer = new TankRenderer(canvas);
let stageIndex = 0;
let isCoop = false;
let world = new World(1990, stageIndex);
let localP1: Tank = world.spawnPlayerTank(Team.Player1);
let localP2: Tank | null = null;
let localSeq = 0;

function startLocalGame(coop: boolean, nextStage = false): void {
  isCoop = coop;
  if (nextStage) {
    stageIndex = (stageIndex + 1) % 2;
  }
  world = new World(1990 + stageIndex, stageIndex);
  localP1 = world.spawnPlayerTank(Team.Player1);
  localP2 = coop ? world.spawnPlayerTank(Team.Player2) : null;
  gameOverOverlay.classList.add("hidden");
  gameOverOverlay.classList.remove("flex");
  modeBadge.textContent = coop ? "2 ГРАВЦІ" : "1 ГРАВЕЦЬ";
}

window.addEventListener("pointerdown", () => audio.unlock(), { once: true });
window.addEventListener("keydown", () => audio.unlock(), { once: true });

btnSound.addEventListener("click", () => {
  audio.unlock();
  const muted = audio.toggleMute();
  btnSound.textContent = muted ? "Звук: ВИМК." : "Звук: УВІМК.";
});

btnSolo.addEventListener("click", () => {
  audio.unlock();
  startLocalGame(false, false);
});

btnCoop.addEventListener("click", () => {
  audio.unlock();
  startLocalGame(true, false);
});

btnNextStage.addEventListener("click", () => {
  audio.unlock();
  startLocalGame(isCoop, true);
});

btnRestartOverlay.addEventListener("click", () => {
  audio.unlock();
  startLocalGame(isCoop, false);
});

function updateHud(): void {
  let p1: Tank | undefined;
  let p2: Tank | undefined;

  for (const t of world.ofKind(Tank)) {
    if (t.team === Team.Player1) p1 = t;
    if (t.team === Team.Player2) p2 = t;
  }

  hudP1Score.textContent = p1 ? `${p1.score}` : "0";
  hudP1Hp.textContent = p1 ? `Життя: ${p1.hp}` : "Відродження...";

  if (p2) {
    hudP2Score.textContent = `${p2.score}`;
    hudP2Hp.textContent = `Життя: ${p2.hp}`;
  } else {
    hudP2Score.textContent = "—";
    hudP2Hp.textContent = isCoop ? "Відродження..." : "Не грає";
  }

  const alive = world.arena.isBaseAlive();
  hudBase.textContent = alive ? "ЗАХИЩЕНО" : "ЗНИЩЕНО";
  hudBase.className = alive ? "font-bold text-emerald-400" : "font-bold text-red-500";

  if (!alive) {
    gameOverOverlay.classList.remove("hidden");
    gameOverOverlay.classList.add("flex");
  }
}

const loop = createLoop({
  step(dt) {
    const p1Raw = input.readP1();

    localSeq++;
    const inputs = new Map<EntityId, PlayerInput>([
      [localP1.id, { seq: asSeq(localSeq), tick: asTick(localSeq), ...p1Raw }],
    ]);
    if (localP2) {
      const p2Raw = input.readP2();
      inputs.set(localP2.id, { seq: asSeq(localSeq), tick: asTick(localSeq), ...p2Raw });
    }
    world.step(dt, inputs);

    for (const ev of world.events) {
      bus.emitSimEvent(ev);
      if (ev.type === "exploded") {
        renderer.spawnExplosion(ev.x, ev.y, ev.big);
      }
    }
  },
  render() {
    renderer.render(world, performance.now() / 1000);
    updateHud();
  },
});

loop.start();
