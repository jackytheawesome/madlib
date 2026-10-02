import {
  ANSWER_ZONES,
  BOSS_PLATFORMS,
  EMPTY_INPUT,
  QUIZ,
  QUIZ_PLATFORMS,
  STATIONS,
  TASK_PLATFORMS,
  WORLD,
  type Command,
  type GameState,
  type Input,
  type Phase,
  type Platform,
  type Projectile,
  type Rect,
} from "./types";

const FLOOR_Y = 610;
const GRAVITY = 1500;
const MOVE_SPEED = 260;
const JUMP_SPEED = 740;
const SHOT_COOLDOWN = 0.32;
const MAX_STEP = 0.05;

function createPlayer(x = 105) {
  return {
    x,
    y: FLOOR_Y - 46,
    width: 34,
    height: 46,
    vx: 0,
    vy: 0,
    facing: 1 as const,
    grounded: true,
    hp: 3,
    maxHp: 3,
    hurtUntil: 0,
  };
}

export function createGame(nickname = "Ведущая", color = "#9f79ff"): GameState {
  return {
    phase: "lobby",
    paused: false,
    time: 0,
    phaseTime: 0,
    nickname,
    color,
    player: createPlayer(),
    taskStep: 0,
    quizChoice: null,
    quizCorrect: null,
    attempt: 0,
    boss: {
      x: 995,
      y: 210,
      width: 100,
      height: 128,
      hp: 48,
      maxHp: 48,
      nextAttack: 0,
      hurtUntil: 0,
    },
    projectiles: [],
    lastShot: -SHOT_COOLDOWN,
    nextProjectileId: 1,
    previousInput: { ...EMPTY_INPUT },
    notice: "Локальная репетиция: начните игру в панели ведущей.",
  };
}

export function getPlatforms(state: GameState): Platform[] {
  if (["boss", "defeat", "victory"].includes(state.phase)) return BOSS_PLATFORMS;
  if (["quiz", "quiz-reveal"].includes(state.phase)) return QUIZ_PLATFORMS;
  return TASK_PLATFORMS;
}

function setPhase(state: GameState, phase: Phase, notice: string) {
  state.phase = phase;
  state.phaseTime = 0;
  state.previousInput = { ...EMPTY_INPUT };
  state.notice = notice;
}

function enterQuiz(state: GameState) {
  state.player = createPlayer(WORLD.width / 2 - 17);
  state.quizChoice = null;
  state.quizCorrect = null;
  state.projectiles = [];
  setPhase(state, "quiz", "Встаньте на площадку с ответом. Ведущая раскроет правильный вариант.");
}

function revealQuiz(state: GameState) {
  state.quizCorrect = state.quizChoice === QUIZ.correct;
  setPhase(
    state,
    "quiz-reveal",
    state.quizCorrect
      ? "Верно! У босса будет меньше здоровья."
      : "Правильный ответ — стиль «Заголовок». Начинаем бой!",
  );
}

function enterBoss(state: GameState, retry: boolean) {
  state.attempt = retry ? state.attempt + 1 : 1;
  const baseHp = state.quizCorrect ? 34 : 48;
  const maxHp = Math.max(10, Math.round(baseHp * 0.75 ** (state.attempt - 1)));
  state.player = createPlayer();
  state.boss.hp = maxHp;
  state.boss.maxHp = maxHp;
  state.boss.hurtUntil = 0;
  state.boss.nextAttack = state.time + 1.6;
  state.projectiles = [];
  state.lastShot = state.time - SHOT_COOLDOWN;
  state.paused = false;
  setPhase(state, "boss", retry ? "Новая попытка: босс стал слабее." : "Пиу-пиу! Стреляйте в босса и уклоняйтесь от его снарядов.");
}

/** Commands are guarded so stale host actions cannot revive a closed room or a finished fight. */
export function commandGame(state: GameState, command: Command): void {
  if (command === "restart") {
    Object.assign(state, createGame(state.nickname, state.color));
    return;
  }
  if (state.phase === "closed") return;
  if (command === "close") {
    state.paused = false;
    state.projectiles = [];
    state.player.vx = 0;
    state.player.vy = 0;
    setPhase(state, "closed", "Комната закрыта ведущей. Для новой репетиции откройте её заново.");
    return;
  }
  if (command === "pause" || command === "resume") {
    state.paused = command === "pause";
    return;
  }
  if (command === "start" && state.phase === "lobby") {
    state.player = createPlayer();
    state.paused = false;
    setPhase(state, "task", "Доберитесь до кнопки «Заголовок» и нажмите E.");
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

export function getInteractable(state: GameState): number | null {
  if (state.phase !== "task" || state.paused || state.taskStep > 1) return null;
  const station = STATIONS[state.taskStep];
  const player = state.player;
  const nearX = Math.abs(player.x + player.width / 2 - (station.x + station.width / 2)) <= 110;
  const nearY = Math.abs(player.y + player.height - (station.y + station.height)) <= 90;
  return nearX && nearY ? state.taskStep : null;
}

export function interact(state: GameState): void {
  const station = getInteractable(state);
  if (station === null) return;
  state.taskStep += 1;
  if (state.taskStep === 2) {
    setPhase(state, "task-complete", "Заголовок оформлен, документ сохранён. Задача выполнена!");
  } else {
    state.notice = "Отлично! Теперь доберитесь до «Сохранить» и нажмите E.";
  }
}

function movePlayer(state: GameState, input: Input, dt: number) {
  const player = state.player;
  player.vx = (Number(input.right) - Number(input.left)) * MOVE_SPEED;
  if (player.vx !== 0) player.facing = player.vx < 0 ? -1 : 1;
  if (input.jump && !state.previousInput.jump && player.grounded) {
    player.vy = -JUMP_SPEED;
    player.grounded = false;
  }

  const oldFeet = player.y + player.height;
  player.x = Math.max(0, Math.min(WORLD.width - player.width, player.x + player.vx * dt));
  player.vy += GRAVITY * dt;
  player.y += player.vy * dt;
  player.grounded = false;

  // Platforms are one-way: a rising player passes through; a falling player lands from above.
  if (player.vy >= 0) {
    const feet = player.y + player.height;
    const crossed = getPlatforms(state)
      .filter((platform) => oldFeet <= platform.y + 0.01 && feet >= platform.y
        && player.x + player.width > platform.x && player.x < platform.x + platform.width)
      .sort((a, b) => a.y - b.y)[0];
    if (crossed) {
      player.y = crossed.y - player.height;
      player.vy = 0;
      player.grounded = true;
    }
  }
}

function spawnProjectile(state: GameState, owner: Projectile["owner"], x: number, y: number, targetX: number, targetY: number, speed: number, offset = 0) {
  const angle = Math.atan2(targetY - y, targetX - x) + offset;
  state.projectiles.push({
    id: state.nextProjectileId++,
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    owner,
    radius: owner === "player" ? 4 : 8,
    life: 7,
  });
}

function hits(projectile: Projectile, rect: Rect) {
  const closestX = Math.max(rect.x, Math.min(projectile.x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(projectile.y, rect.y + rect.height));
  return (projectile.x - closestX) ** 2 + (projectile.y - closestY) ** 2 <= projectile.radius ** 2;
}

function fight(state: GameState, input: Input, dt: number) {
  const { player, boss } = state;
  if (input.shoot && state.time - state.lastShot >= SHOT_COOLDOWN) {
    spawnProjectile(state, "player", player.x + player.width / 2, player.y + 16,
      boss.x + boss.width / 2, boss.y + boss.height / 2, 650);
    state.lastShot = state.time;
  }
  if (state.time >= boss.nextAttack) {
    // A repeatable three-shot spread is readable and easy to rehearse.
    for (const offset of [-0.14, 0, 0.14]) {
      spawnProjectile(state, "boss", boss.x + 14, boss.y + boss.height / 2,
        player.x + player.width / 2, player.y + player.height / 2, 230, offset);
    }
    boss.nextAttack = state.time + 2.2;
  }

  for (const projectile of state.projectiles) {
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.life -= dt;
  }

  // Resolve outgoing shots first. Once either result is final, later hits cannot undo it.
  for (const projectile of state.projectiles) {
    if (projectile.owner !== "player" || projectile.life <= 0 || !hits(projectile, boss)) continue;
    projectile.life = 0;
    boss.hp = Math.max(0, boss.hp - 3);
    boss.hurtUntil = state.time + 0.12;
    if (boss.hp === 0) {
      state.projectiles = [];
      setPhase(state, "victory", "Серёга побеждён! Команда прошла демо-уровень.");
      return;
    }
  }
  for (const projectile of state.projectiles) {
    if (projectile.owner !== "boss" || projectile.life <= 0 || !hits(projectile, player)) continue;
    projectile.life = 0;
    if (state.time < player.hurtUntil) continue;
    player.hp = Math.max(0, player.hp - 1);
    player.hurtUntil = state.time + 1;
    if (player.hp === 0) {
      player.vx = 0;
      player.vy = 0;
      player.y = FLOOR_Y - player.height;
      player.grounded = true;
      state.projectiles = [];
      setPhase(state, "defeat", "Герой выбыл. Повторите бой: у босса будет меньше здоровья.");
      return;
    }
  }
  state.projectiles = state.projectiles.filter((projectile) => projectile.life > 0
    && projectile.x > -30 && projectile.x < WORLD.width + 30
    && projectile.y > -100 && projectile.y < WORLD.height + 30);
}

export function stepGame(state: GameState, input: Input, dtSeconds: number): void {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return;
  if (state.phase === "closed" || state.phase === "lobby" || state.phase === "defeat" || state.paused) {
    state.previousInput = { ...input };
    return;
  }
  const dt = Math.min(dtSeconds, MAX_STEP);
  state.time += dt;
  state.phaseTime += dt;
  movePlayer(state, input, dt);
  if (state.phase === "task" && input.interact && !state.previousInput.interact) interact(state);
  if (state.phase === "quiz") {
    const center = state.player.x + state.player.width / 2;
    state.quizChoice = state.player.grounded && Math.abs(state.player.y + state.player.height - FLOOR_Y) < 1
      ? ANSWER_ZONES.findIndex((zone) => center >= zone.x && center <= zone.x + zone.width)
      : null;
    if (state.quizChoice === -1) state.quizChoice = null;
  }
  if (state.phase === "boss") fight(state, input, dt);
  state.previousInput = { ...input };
}
