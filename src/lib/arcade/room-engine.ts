import { createGame, getInteractable } from "./engine";
import { quizHealthMultiplier } from "./quiz-balance";
import type { RoomGameState, RoomPlayer } from "./room-types";
import {
  ANSWER_ZONES, BOSS_PLATFORMS, EMPTY_INPUT, QUIZ, QUIZ_PLATFORMS, TASK_PLATFORMS, WORLD,
  type Command, type GameState, type Input, type Phase, type Player, type Projectile, type Rect,
} from "./types";

const FLOOR_Y = 610;
const GRAVITY = 1500;
const MOVE_SPEED = 260;
const JUMP_SPEED = 740;
const SHOT_COOLDOWN = 0.32;
const INPUT_TIMEOUT_MS = 1000;
const MAX_STEP = 0.05;

/** Door on the document floor. The DOM draws it; the server owns its hit area. */
export const TASK_EXIT = { x: 1138, y: 530, width: 62, height: 80 } as const;

type Controls = {
  input: Input;
  previousInput: Input;
  pendingJump: boolean;
  pendingInteract: boolean;
  pendingShoot: boolean;
  pendingLeft: boolean;
  pendingRight: boolean;
  lastShot: number;
  sequence: number;
  receivedAt: number;
};
type Runtime = { controls: Map<string, Controls>; attackTarget: number };
const runtimes = new WeakMap<RoomGameState, Runtime>();

function runtimeOf(state: RoomGameState): Runtime {
  let runtime = runtimes.get(state);
  if (!runtime) {
    runtime = { controls: new Map(), attackTarget: 0 };
    runtimes.set(state, runtime);
  }
  return runtime;
}

function controlsOf(state: RoomGameState, id: string): Controls {
  const runtime = runtimeOf(state);
  let controls = runtime.controls.get(id);
  if (!controls) {
    controls = {
      input: { ...EMPTY_INPUT }, previousInput: { ...EMPTY_INPUT },
      pendingJump: false, pendingInteract: false, pendingShoot: false, pendingLeft: false, pendingRight: false,
      lastShot: state.time - SHOT_COOLDOWN, sequence: -1, receivedAt: 0,
    };
    runtime.controls.set(id, controls);
  }
  return controls;
}

function releaseControls(controls: Controls): void {
  controls.input = { ...EMPTY_INPUT };
  controls.previousInput = { ...EMPTY_INPUT };
  controls.pendingJump = false;
  controls.pendingInteract = false;
  controls.pendingShoot = false;
  controls.pendingLeft = false;
  controls.pendingRight = false;
}

function resetControls(state: RoomGameState): void {
  for (const member of Object.values(state.players)) {
    const controls = controlsOf(state, member.id);
    releaseControls(controls);
    controls.lastShot = state.time - SHOT_COOLDOWN;
  }
}

function createPlayer(index = 0): Player {
  return { ...createGame().player, x: 105 + index * 54 };
}

/** Creates an empty lobby. The server adds the authenticated host separately. */
export function createRoomGame(hostId: string): RoomGameState {
  const game = createGame();
  return {
    hostId, players: {}, phase: game.phase, paused: game.paused, time: game.time,
    phaseTime: game.phaseTime, taskStep: game.taskStep, attempt: game.attempt,
    boss: game.boss, projectiles: [], nextProjectileId: 1,
    notice: "Все входят в комнату. Ведущая начнёт игру, когда команда будет готова.",
    quizTotal: 0, quizCorrectCount: 0, bossParticipantCount: 1, bossBaseHp: 48,
  };
}

/** Migrates saved rooms from the earlier shared document-task format. */
export function normalizeRoomTaskProgress(state: RoomGameState): void {
  const sharedStep = state.taskStep === 1 ? 1 : state.taskStep === 2 ? 2 : 0;
  for (const member of Object.values(state.players)) {
    if (![0, 1, 2].includes(member.taskStep)) member.taskStep = sharedStep;
    if (typeof member.taskExited !== "boolean") member.taskExited = state.phase === "task-complete";
    if (member.taskExited) member.taskStep = 2;
  }
}

function updateTaskCompletion(state: RoomGameState): void {
  if (state.phase !== "task") return;
  const participating = Object.values(state.players).filter((member) => member.connected);
  if (participating.length === 0) return;
  state.taskStep = Math.min(...participating.map((member) => member.taskStep));
  if (participating.every((member) => member.taskExited)) {
    setPhase(state, "task-complete", "Все участники сохранили документ и вышли. Можно перейти к вопросу!");
  }
}

/** The server enforces room capacity, access and the lobby-only join policy. */
export function addRoomPlayer(state: RoomGameState, id: string, nickname: string, color: string): boolean {
  if (!id || Object.hasOwn(state.players, id)) return false;
  // Defining an own property also makes arbitrary client ids safe on a plain record.
  Object.defineProperty(state.players, id, {
    value: {
      id, nickname: nickname.trim().slice(0, 18) || "Игрок", color,
      connected: true, player: createPlayer(Object.keys(state.players).length),
      taskStep: 0, taskExited: false,
      quizChoice: null, quizCorrect: null,
    } satisfies RoomPlayer,
    enumerable: true, configurable: true, writable: true,
  });
  controlsOf(state, id);
  return true;
}

export function setRoomPlayerConnected(state: RoomGameState, id: string, connected: boolean): void {
  if (!Object.hasOwn(state.players, id)) return;
  state.players[id].connected = connected;
  const controls = controlsOf(state, id);
  releaseControls(controls);
  // A replacement socket starts its sequence at zero, while position and health remain intact.
  controls.sequence = -1;
  controls.receivedAt = 0;
  state.players[id].player.vx = 0;
  updateTaskCompletion(state);
}

/** Accepts buttons only. Call at least every 250ms while keys are held. */
export function setRoomInput(state: RoomGameState, id: string, input: Input, sequence: number): boolean {
  if (!Object.hasOwn(state.players, id) || !state.players[id].connected || state.phase === "closed") return false;
  if (["task", "task-complete"].includes(state.phase) && state.players[id].taskExited) return false;
  if (!Number.isSafeInteger(sequence) || sequence < 0) return false;
  if (!input || Object.keys(EMPTY_INPUT).some((key) => typeof input[key as keyof Input] !== "boolean")) return false;
  const controls = controlsOf(state, id);
  if (sequence <= controls.sequence) return false;
  if (!state.paused) {
    controls.pendingJump ||= input.jump && !controls.input.jump;
    controls.pendingInteract ||= input.interact && !controls.input.interact;
    controls.pendingShoot ||= input.shoot && !controls.input.shoot;
    controls.pendingLeft ||= input.left && !controls.input.left;
    controls.pendingRight ||= input.right && !controls.input.right;
  }
  controls.input = {
    left: input.left, right: input.right, jump: input.jump, interact: input.interact, shoot: input.shoot,
  };
  controls.sequence = sequence;
  controls.receivedAt = Date.now();
  if (state.paused) {
    controls.previousInput = { ...controls.input };
    controls.pendingJump = controls.pendingInteract = controls.pendingShoot = false;
    controls.pendingLeft = controls.pendingRight = false;
  }
  return true;
}

/** Compatibility view for the existing scene UI and pixel renderer. Treat it as read-only. */
export function projectPlayerGame(state: RoomGameState, id: string): GameState | null {
  if (!Object.hasOwn(state.players, id)) return null;
  const member = state.players[id];
  return {
    phase: state.phase, paused: state.paused, time: state.time, phaseTime: state.phaseTime,
    nickname: member.nickname, color: member.color, player: member.player,
    taskStep: member.taskStep, quizChoice: member.quizChoice, quizCorrect: member.quizCorrect,
    attempt: state.attempt, boss: state.boss, projectiles: state.projectiles,
    lastShot: -SHOT_COOLDOWN, nextProjectileId: state.nextProjectileId,
    previousInput: { ...EMPTY_INPUT }, notice: state.notice,
  };
}

function setPhase(state: RoomGameState, phase: Phase, notice: string): void {
  state.phase = phase;
  state.phaseTime = 0;
  state.notice = notice;
  resetControls(state);
}

function enterQuiz(state: RoomGameState): void {
  for (const member of Object.values(state.players)) {
    member.player = { ...createPlayer(), x: WORLD.width / 2 - 17 };
    member.quizChoice = null;
    member.quizCorrect = null;
  }
  state.quizTotal = 0;
  state.quizCorrectCount = 0;
  state.projectiles = [];
  setPhase(state, "quiz", "Встаньте на площадку с ответом. Ведущая раскроет правильный вариант.");
}

function revealQuiz(state: RoomGameState): void {
  const participating = Object.values(state.players).filter((member) => member.connected);
  for (const member of Object.values(state.players)) member.quizCorrect = member.quizChoice === QUIZ.correct;
  state.quizTotal = participating.length;
  state.quizCorrectCount = participating.filter((member) => member.quizCorrect).length;
  setPhase(state, "quiz-reveal", `Правильный ответ — стиль «Заголовок». Верно ответили: ${state.quizCorrectCount} из ${state.quizTotal}.`);
}

function enterBoss(state: RoomGameState, retry: boolean): void {
  state.attempt = retry ? state.attempt + 1 : 1;
  if (!retry) {
    state.bossParticipantCount = Math.max(1, Object.values(state.players).filter((member) => member.connected).length);
    state.bossBaseHp = Math.round(48 * state.bossParticipantCount * quizHealthMultiplier(state.quizCorrectCount, state.quizTotal));
  }
  const maxHp = Math.max(10 * state.bossParticipantCount, Math.round(state.bossBaseHp * 0.75 ** (state.attempt - 1)));
  Object.values(state.players).forEach((member, index) => { member.player = createPlayer(index); });
  state.boss.hp = maxHp;
  state.boss.maxHp = maxHp;
  state.boss.hurtUntil = 0;
  state.boss.nextAttack = state.time + 1.6;
  state.projectiles = [];
  state.paused = false;
  runtimeOf(state).attackTarget = 0;
  setPhase(state, "boss", retry ? "Новая попытка: босс стал слабее." : "Пиу-пиу! Стреляйте в босса и уклоняйтесь от его снарядов.");
}

/** Caller MUST authorize the host before invoking this API. */
export function commandRoomGame(state: RoomGameState, command: Command): void {
  if (command === "restart") {
    const players = state.players;
    Object.assign(state, createRoomGame(state.hostId));
    state.players = players;
    Object.values(players).forEach((member, index) => {
      member.player = createPlayer(index);
      member.taskStep = 0;
      member.taskExited = false;
      member.quizChoice = member.quizCorrect = null;
    });
    resetControls(state);
    return;
  }
  if (state.phase === "closed") return;
  if (command === "close") {
    state.paused = false;
    state.projectiles = [];
    for (const member of Object.values(state.players)) member.player.vx = member.player.vy = 0;
    setPhase(state, "closed", "Комната закрыта ведущей.");
    return;
  }
  if (command === "pause" || command === "resume") {
    state.paused = command === "pause";
    if (state.paused) resetControls(state);
    return;
  }
  if (command === "start" && state.phase === "lobby") {
    Object.values(state.players).forEach((member, index) => {
      member.player = createPlayer(index);
      member.taskStep = 0;
      member.taskExited = false;
    });
    state.taskStep = 0;
    state.paused = false;
    setPhase(state, "task", "Каждый оформляет заголовок, сохраняет документ и выходит через дверь справа.");
  } else if (command === "reveal" && state.phase === "quiz") {
    revealQuiz(state);
  } else if (command === "retry" && (state.phase === "boss" || state.phase === "defeat")) {
    enterBoss(state, true);
  } else if (command === "next") {
    if (state.phase === "task-complete") enterQuiz(state);
    else if (state.phase === "quiz-reveal") enterBoss(state, false);
  } else if (command === "skip") {
    if (state.phase === "task") {
      state.taskStep = 2;
      for (const member of Object.values(state.players)) {
        member.taskStep = 2;
        member.taskExited = true;
        member.player.vx = member.player.vy = 0;
      }
      setPhase(state, "task-complete", "Задача пропущена ведущей. Можно перейти к вопросу.");
    } else if (state.phase === "task-complete") enterQuiz(state);
    else if (state.phase === "quiz") revealQuiz(state);
    else if (state.phase === "quiz-reveal") enterBoss(state, false);
    else if (state.phase === "boss" || state.phase === "defeat") {
      state.boss.hp = 0;
      state.projectiles = [];
      setPhase(state, "victory", "Бой пропущен ведущей. Уровень завершён!");
    }
  }
}

/** Personal document action, validated against the authoritative avatar position. */
export function getRoomInteractable(state: RoomGameState, id: string): 0 | 1 | 2 | null {
  const game = projectPlayerGame(state, id);
  if (!game || !state.players[id].connected || state.players[id].taskExited
      || game.phase !== "task" || game.paused || game.player.hp <= 0) return null;
  if (game.taskStep < 2) return getInteractable(game) as 0 | 1 | null;
  const player = game.player;
  const center = player.x + player.width / 2;
  const nearDoor = center >= TASK_EXIT.x - 26 && center <= TASK_EXIT.x + TASK_EXIT.width;
  const onFloor = player.grounded && Math.abs(player.y + player.height - FLOOR_Y) < 1;
  return nearDoor && onFloor ? 2 : null;
}

export function interactRoomPlayer(state: RoomGameState, id: string): void {
  const action = getRoomInteractable(state, id);
  if (action === null) return;
  const member = state.players[id];
  if (action === 2) {
    member.taskExited = true;
    member.player.vx = member.player.vy = 0;
    releaseControls(controlsOf(state, id));
  } else {
    member.taskStep = action === 0 ? 1 : 2;
  }
  updateTaskCompletion(state);
}

function platformsFor(phase: Phase) {
  if (["boss", "defeat", "victory"].includes(phase)) return BOSS_PLATFORMS;
  if (["quiz", "quiz-reveal"].includes(phase)) return QUIZ_PLATFORMS;
  return TASK_PLATFORMS;
}

function movePlayer(state: RoomGameState, player: Player, controls: Controls, input: Input, dt: number): void {
  player.vx = (Number(input.right) - Number(input.left)) * MOVE_SPEED;
  if (player.vx !== 0) player.facing = player.vx < 0 ? -1 : 1;
  if (input.jump && !controls.previousInput.jump && player.grounded) {
    player.vy = -JUMP_SPEED;
    player.grounded = false;
  }
  const oldFeet = player.y + player.height;
  player.x = Math.max(0, Math.min(WORLD.width - player.width, player.x + player.vx * dt));
  player.vy += GRAVITY * dt;
  player.y += player.vy * dt;
  player.grounded = false;
  if (player.vy >= 0) {
    const feet = player.y + player.height;
    const crossed = platformsFor(state.phase).filter((platform) => oldFeet <= platform.y + 0.01 && feet >= platform.y
      && player.x + player.width > platform.x && player.x < platform.x + platform.width).sort((a, b) => a.y - b.y)[0];
    if (crossed) {
      player.y = crossed.y - player.height;
      player.vy = 0;
      player.grounded = true;
    }
  }
}

function spawnProjectile(state: RoomGameState, owner: Projectile["owner"], x: number, y: number,
  targetX: number, targetY: number, speed: number, offset = 0): void {
  const angle = Math.atan2(targetY - y, targetX - x) + offset;
  state.projectiles.push({
    id: state.nextProjectileId++, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    owner, radius: owner === "player" ? 4 : 8, life: 7,
  });
}

function hits(projectile: Projectile, rect: Rect): boolean {
  const closestX = Math.max(rect.x, Math.min(projectile.x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(projectile.y, rect.y + rect.height));
  return (projectile.x - closestX) ** 2 + (projectile.y - closestY) ** 2 <= projectile.radius ** 2;
}

function fight(state: RoomGameState, effectiveInputs: Map<string, Input>, dt: number): void {
  const living = Object.values(state.players).filter((member) => member.connected && member.player.hp > 0);
  for (const member of living) {
    const controls = controlsOf(state, member.id);
    if (effectiveInputs.get(member.id)?.shoot && state.time - controls.lastShot >= SHOT_COOLDOWN) {
      spawnProjectile(state, "player", member.player.x + member.player.width / 2, member.player.y + 16,
        state.boss.x + state.boss.width / 2, state.boss.y + state.boss.height / 2, 650);
      controls.lastShot = state.time;
    }
  }
  if (living.length > 0 && state.time >= state.boss.nextAttack) {
    const runtime = runtimeOf(state);
    const target = living[runtime.attackTarget++ % living.length].player;
    for (const offset of [-0.14, 0, 0.14]) {
      spawnProjectile(state, "boss", state.boss.x + 14, state.boss.y + state.boss.height / 2,
        target.x + target.width / 2, target.y + target.height / 2, 230, offset);
    }
    state.boss.nextAttack = state.time + 2.2;
  }
  for (const projectile of state.projectiles) {
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.life -= dt;
  }
  // Team victory wins a simultaneous last-player hit, matching the local prototype.
  for (const projectile of state.projectiles) {
    if (projectile.owner !== "player" || projectile.life <= 0 || !hits(projectile, state.boss)) continue;
    projectile.life = 0;
    state.boss.hp = Math.max(0, state.boss.hp - 3);
    state.boss.hurtUntil = state.time + 0.12;
    if (state.boss.hp === 0) {
      state.projectiles = [];
      setPhase(state, "victory", "Серёга побеждён! Команда прошла демо-уровень.");
      return;
    }
  }
  for (const projectile of state.projectiles) {
    if (projectile.owner !== "boss" || projectile.life <= 0) continue;
    const member = living.find((candidate) => candidate.player.hp > 0 && hits(projectile, candidate.player));
    if (!member) continue;
    projectile.life = 0;
    const player = member.player;
    if (state.time < player.hurtUntil) continue;
    player.hp = Math.max(0, player.hp - 1);
    player.hurtUntil = state.time + 1;
    if (player.hp === 0) {
      player.vx = player.vy = 0;
      player.y = FLOOR_Y - player.height;
      player.grounded = true;
      releaseControls(controlsOf(state, member.id));
    }
  }
  if (!Object.values(state.players).some((member) => member.connected && member.player.hp > 0)) {
    state.projectiles = [];
    setPhase(state, "defeat", "Команда выбыла. Повторите бой: у босса будет меньше здоровья.");
    return;
  }
  state.projectiles = state.projectiles.filter((projectile) => projectile.life > 0
    && projectile.x > -30 && projectile.x < WORLD.width + 30
    && projectile.y > -100 && projectile.y < WORLD.height + 30);
}

/** One authoritative tick for the entire room, using elapsed seconds. */
export function stepRoomGame(state: RoomGameState, dtSeconds: number): void {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return;
  const effectiveInputs = new Map<string, Input>();
  for (const member of Object.values(state.players)) {
    const controls = controlsOf(state, member.id);
    if (!member.connected || Date.now() - controls.receivedAt > INPUT_TIMEOUT_MS) releaseControls(controls);
    const input = {
      ...controls.input, jump: controls.input.jump || controls.pendingJump,
      interact: controls.input.interact || controls.pendingInteract,
      shoot: controls.input.shoot || controls.pendingShoot,
      left: controls.input.left || controls.pendingLeft, right: controls.input.right || controls.pendingRight,
    };
    controls.pendingJump = controls.pendingInteract = controls.pendingShoot = false;
    controls.pendingLeft = controls.pendingRight = false;
    effectiveInputs.set(member.id, input);
  }
  if (["closed", "lobby", "defeat"].includes(state.phase) || state.paused) {
    for (const [id, input] of effectiveInputs) controlsOf(state, id).previousInput = { ...input };
    return;
  }
  const dt = Math.min(dtSeconds, MAX_STEP);
  state.time += dt;
  state.phaseTime += dt;
  for (const member of Object.values(state.players)) {
    const input = effectiveInputs.get(member.id)!;
    const controls = controlsOf(state, member.id);
    if (member.connected && member.player.hp > 0
        && !(["task", "task-complete"].includes(state.phase) && member.taskExited)) {
      movePlayer(state, member.player, controls, input, dt);
      if (state.phase === "task" && input.interact && !controls.previousInput.interact) interactRoomPlayer(state, member.id);
      if (state.phase === "quiz") {
        const center = member.player.x + member.player.width / 2;
        const choice = member.player.grounded && Math.abs(member.player.y + member.player.height - FLOOR_Y) < 1
          ? ANSWER_ZONES.findIndex((zone) => center >= zone.x && center <= zone.x + zone.width) : -1;
        member.quizChoice = choice < 0 ? null : choice;
      }
    }
    controls.previousInput = { ...input };
  }
  if (state.phase === "boss") fight(state, effectiveInputs, dt);
}
