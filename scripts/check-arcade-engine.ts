import assert from "node:assert/strict";
import { commandGame, createGame, getInteractable, getPlatforms, interact, stepGame } from "../src/lib/arcade/engine";
import { ANSWER_ZONES, EMPTY_INPUT, QUIZ, STATIONS, type GameState, type Input, type Projectile } from "../src/lib/arcade/types";

const FRAME = 1 / 60;
const input = (changes: Partial<Input> = {}): Input => ({ ...EMPTY_INPUT, ...changes });
let assertions = 0;

function check(name: string, test: () => void) {
  test();
  assertions += 1;
  console.log(`✓ ${name}`);
}

function ticks(state: GameState, count: number, controls = input()) {
  for (let index = 0; index < count; index += 1) stepGame(state, controls, FRAME);
}

function quizGame(answer: number | null) {
  const state = createGame();
  commandGame(state, "start");
  commandGame(state, "skip");
  commandGame(state, "next");
  if (answer !== null) {
    const zone = ANSWER_ZONES[answer];
    state.player.x = zone.x + zone.width / 2 - state.player.width / 2;
    stepGame(state, input(), FRAME);
  }
  return state;
}

function bossGame(answer: number | null = QUIZ.correct) {
  const state = quizGame(answer);
  commandGame(state, "reveal");
  commandGame(state, "next");
  return state;
}

function hit(state: GameState, owner: Projectile["owner"]): Projectile {
  const target = owner === "boss" ? state.player : state.boss;
  return {
    id: state.nextProjectileId++,
    x: target.x + target.width / 2,
    y: target.y + target.height / 2,
    vx: 0,
    vy: 0,
    radius: 8,
    owner,
    life: 1,
  };
}

check("phase guards reject out-of-order commands", () => {
  const state = createGame("Люда", "#aabbcc");
  for (const command of ["next", "reveal", "retry"] as const) commandGame(state, command);
  assert.equal(state.phase, "lobby");
  commandGame(state, "start");
  for (const command of ["start", "next", "reveal", "retry"] as const) commandGame(state, command);
  assert.equal(state.phase, "task");
  assert.equal(state.taskStep, 0);
  assert.equal(state.nickname, "Люда");
});

check("one-way platforms allow ascent and catch descent; held jump does not repeat", () => {
  const state = createGame();
  commandGame(state, "start");
  state.player.x = 120;
  let highestFeet = 610;
  let passedThrough = false;
  for (let index = 0; index < 150; index += 1) {
    stepGame(state, input({ jump: true }), FRAME);
    const feet = state.player.y + state.player.height;
    highestFeet = Math.min(highestFeet, feet);
    if (feet < 520 && state.player.vy < 0) passedThrough = true;
  }
  assert.ok(passedThrough);
  assert.ok(610 - highestFeet >= 160, "jump must reach the 156px task platform gap");
  assert.equal(state.player.y + state.player.height, 520);
  assert.equal(state.player.grounded, true);
  stepGame(state, input(), FRAME);
  stepGame(state, input({ jump: true }), FRAME);
  assert.ok(state.player.vy < 0, "a fresh jump press works after release");
});

check("character cannot leave world and long frames are bounded", () => {
  const state = createGame();
  commandGame(state, "start");
  state.player.x = 0;
  stepGame(state, input({ left: true }), 10);
  assert.equal(state.player.x, 0);
  assert.equal(state.time, 0.05);
  state.player.x = 1199;
  ticks(state, 1, input({ right: true }));
  assert.equal(state.player.x, 1200 - state.player.width);
  const time = state.time;
  for (const dt of [0, -1, NaN, Infinity]) stepGame(state, input(), dt);
  assert.equal(state.time, time);
});

check("task buttons require proximity and interaction uses a fresh key press", () => {
  const state = createGame();
  commandGame(state, "start");
  assert.equal(getInteractable(state), null);
  interact(state);
  assert.equal(state.taskStep, 0);
  const standAt = (stationIndex: number) => {
    const station = STATIONS[stationIndex];
    state.player.x = station.x + station.width / 2 - state.player.width / 2;
    state.player.y = station.y + station.height - state.player.height;
    state.player.vy = 0;
    state.player.grounded = true;
  };
  standAt(0);
  assert.equal(getInteractable(state), 0);
  stepGame(state, input({ interact: true }), FRAME);
  assert.equal(state.taskStep, 1);
  standAt(1);
  stepGame(state, input({ interact: true }), FRAME);
  assert.equal(state.taskStep, 1, "held E must not activate a second station");
  stepGame(state, input(), FRAME);
  stepGame(state, input({ interact: true }), FRAME);
  assert.equal(state.taskStep, 2);
  assert.equal(state.phase, "task-complete");
  assert.equal(getInteractable(state), null);
  commandGame(state, "next");
  assert.equal(state.phase, "quiz");
});

check("a player reaches both task stations through the real platform route without teleporting", () => {
  const state = createGame();
  commandGame(state, "start");
  const jumpTo = (centerX: number, platformY: number) => {
    // Release the previous jump before each new press; steer toward a landing point.
    stepGame(state, input(), FRAME);
    for (let frame = 0; frame < 180; frame += 1) {
      const distance = centerX - (state.player.x + state.player.width / 2);
      stepGame(state, input({ jump: frame === 0, right: distance > 3, left: distance < -3 }), FRAME);
      if (state.player.grounded && state.player.y + state.player.height === platformY) return;
    }
    assert.fail(`Could not land at (${centerX}, ${platformY}) from the normal route`);
  };
  jumpTo(220, 520); // Library.
  jumpTo(430, 440); // Paragraph.
  jumpTo(500, 284); // Heading button.
  assert.equal(getInteractable(state), 0);
  stepGame(state, input({ interact: true }), FRAME);
  assert.equal(state.taskStep, 1);
  jumpTo(740, 362); // Document text.
  jumpTo(975, 320); // Save panel.
  assert.equal(getInteractable(state), 1);
  stepGame(state, input({ interact: true }), FRAME);
  assert.equal(state.phase, "task-complete");
});

check("quiz starts unselected, locks revealed choice, and correct answer weakens boss", () => {
  const unselected = quizGame(null);
  stepGame(unselected, input(), FRAME);
  assert.equal(unselected.quizChoice, null);
  const state = quizGame(QUIZ.correct);
  assert.equal(state.quizChoice, QUIZ.correct);
  commandGame(state, "reveal");
  assert.equal(state.quizCorrect, true);
  state.player.x = 60;
  ticks(state, 5, input({ right: true }));
  assert.equal(state.quizChoice, QUIZ.correct, "reveal freezes the submitted choice");
  commandGame(state, "next");
  assert.equal(state.phase, "boss");
  assert.equal(state.boss.hp, 34);
  assert.equal(bossGame(0).boss.hp, 48);
  assert.equal(bossGame(null).boss.hp, 48);
});

check("jumping above a quiz platform does not select an answer", () => {
  const state = quizGame(1);
  stepGame(state, input({ jump: true }), FRAME);
  assert.equal(state.quizChoice, null);
});

check("pause freezes movement, projectiles and timers without queuing held jump", () => {
  const state = bossGame();
  state.projectiles.push(hit(state, "boss"));
  commandGame(state, "pause");
  const frozen = JSON.stringify({ time: state.time, player: state.player, boss: state.boss, projectiles: state.projectiles });
  ticks(state, 120, input({ right: true, jump: true, shoot: true }));
  assert.equal(JSON.stringify({ time: state.time, player: state.player, boss: state.boss, projectiles: state.projectiles }), frozen);
  commandGame(state, "resume");
  stepGame(state, input({ jump: true }), FRAME);
  assert.equal(state.player.vy, 0, "jump held during pause must not fire on resume");
});

check("boss damage respects invulnerability, defeat leaves a corpse and retry restores a weaker fight", () => {
  const state = bossGame();
  state.projectiles.push(hit(state, "boss"), hit(state, "boss"));
  stepGame(state, input(), FRAME);
  assert.equal(state.player.hp, 2, "same-frame spread may only deal one damage");
  state.projectiles.push(hit(state, "boss"));
  stepGame(state, input(), FRAME);
  assert.equal(state.player.hp, 2, "invulnerability lasts through later frames");
  state.player.hurtUntil = 0;
  state.projectiles.push(hit(state, "boss"));
  stepGame(state, input(), FRAME);
  state.player.hurtUntil = 0;
  state.projectiles.push(hit(state, "boss"));
  stepGame(state, input(), FRAME);
  assert.equal(state.phase, "defeat");
  assert.equal(state.player.hp, 0);
  assert.equal(state.player.y + state.player.height, 610);
  const deadX = state.player.x;
  ticks(state, 20, input({ right: true, jump: true, shoot: true }));
  assert.equal(state.player.x, deadX);
  assert.equal(state.projectiles.length, 0);
  const originalHp = state.boss.maxHp;
  commandGame(state, "retry");
  assert.equal(state.phase, "boss");
  assert.equal(state.player.hp, 3);
  assert.equal(state.attempt, 2);
  assert.ok(state.boss.maxHp < originalHp);
  for (let index = 0; index < 20; index += 1) commandGame(state, "retry");
  assert.equal(state.boss.maxHp, 10, "retry has a positive health floor");
});

check("firing produces moving projectiles and enforces a cooldown", () => {
  const state = bossGame();
  stepGame(state, input({ shoot: true }), FRAME);
  assert.equal(state.projectiles.filter((projectile) => projectile.owner === "player").length, 1);
  const firstX = state.projectiles[0].x;
  ticks(state, 10, input({ shoot: true }));
  assert.equal(state.projectiles.filter((projectile) => projectile.owner === "player").length, 1);
  assert.ok(state.projectiles[0].x > firstX);
  ticks(state, 10, input({ shoot: true }));
  assert.equal(state.projectiles.filter((projectile) => projectile.owner === "player").length, 2);
});

check("boss attacks on schedule and does not accumulate bullets indefinitely", () => {
  const state = bossGame();
  ticks(state, 90);
  assert.equal(state.projectiles.filter((projectile) => projectile.owner === "boss").length, 0);
  ticks(state, 12);
  assert.equal(state.projectiles.filter((projectile) => projectile.owner === "boss").length, 3);
  const nextAttack = state.boss.nextAttack;
  assert.ok(nextAttack > state.time + 2);
  state.player.hurtUntil = state.time + 100;
  ticks(state, 1800);
  assert.ok(state.projectiles.length <= 12);
});

check("victory is final even when an enemy bullet would kill the player in the same frame", () => {
  const state = bossGame();
  state.player.hp = 1;
  state.boss.hp = 3;
  state.projectiles.push(hit(state, "boss"), hit(state, "player"));
  stepGame(state, input(), FRAME);
  assert.equal(state.phase, "victory");
  assert.equal(state.player.hp, 1);
  assert.equal(state.boss.hp, 0);
  assert.equal(state.projectiles.length, 0);
  commandGame(state, "retry");
  ticks(state, 10, input({ shoot: true }));
  assert.equal(state.phase, "victory");
  assert.equal(state.projectiles.length, 0);
});

check("host can skip each stage and restart the whole local rehearsal", () => {
  const state = createGame("Тест", "#123456");
  commandGame(state, "start");
  commandGame(state, "skip");
  assert.equal(state.phase, "task-complete");
  commandGame(state, "next");
  commandGame(state, "skip");
  assert.equal(state.phase, "quiz-reveal");
  commandGame(state, "next");
  assert.equal(getPlatforms(state).length, 4);
  commandGame(state, "skip");
  assert.equal(state.phase, "victory");
  commandGame(state, "restart");
  assert.equal(state.phase, "lobby");
  assert.equal(state.nickname, "Тест");
  assert.equal(state.color, "#123456");
  assert.equal(state.taskStep, 0);
});

check("closed room ignores stale commands, movement and interaction until an explicit restart", () => {
  const state = bossGame();
  commandGame(state, "close");
  assert.equal(state.phase, "closed");
  const snapshot = JSON.stringify(state);
  for (const command of ["start", "next", "reveal", "retry", "skip", "pause", "resume", "close"] as const) commandGame(state, command);
  ticks(state, 100);
  interact(state);
  assert.equal(JSON.stringify(state), snapshot);
  commandGame(state, "restart");
  assert.equal(state.phase, "lobby");
});

console.log(`\n${assertions} arcade engine checks passed.`);
