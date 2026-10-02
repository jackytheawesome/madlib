import assert from "node:assert/strict";
import {
  addRoomPlayer, commandRoomGame, createRoomGame, interactRoomPlayer, projectPlayerGame,
  setRoomInput, setRoomPlayerConnected, stepRoomGame,
} from "../src/lib/arcade/room-engine";
import type { RoomGameState } from "../src/lib/arcade/room-types";
import { ANSWER_ZONES, EMPTY_INPUT, QUIZ, STATIONS, type Input, type Projectile, type Rect } from "../src/lib/arcade/types";

const FRAME = 1 / 60;
const IDS = ["host", "player-b", "player-c", "player-d"];
const input = (changes: Partial<Input> = {}): Input => ({ ...EMPTY_INPUT, ...changes });
let checks = 0;

function check(name: string, run: () => void): void {
  run();
  console.log(`✓ ${name}`);
  checks += 1;
}

function room(count = 4): RoomGameState {
  const state = createRoomGame(IDS[0]);
  IDS.slice(0, count).forEach((id, index) => {
    assert.equal(addRoomPlayer(state, id, `Игрок ${index + 1}`, ["#a899ff", "#61d6bd", "#ffb66b", "#ef8fae"][index]), true);
  });
  return state;
}

function ticks(state: RoomGameState, count: number): void {
  for (let frame = 0; frame < count; frame += 1) stepRoomGame(state, FRAME);
}

function quizRoom(answers: Array<number | null> = [1, 1, 0, null]): RoomGameState {
  const state = room(answers.length);
  commandRoomGame(state, "start");
  commandRoomGame(state, "skip");
  commandRoomGame(state, "next");
  answers.forEach((answer, index) => {
    if (answer === null) return;
    const zone = ANSWER_ZONES[answer];
    state.players[IDS[index]].player.x = zone.x + zone.width / 2 - 17;
  });
  stepRoomGame(state, FRAME);
  return state;
}

function bossRoom(answers: Array<number | null> = [1, 1, 0, null]): RoomGameState {
  const state = quizRoom(answers);
  commandRoomGame(state, "reveal");
  commandRoomGame(state, "next");
  return state;
}

function projectile(state: RoomGameState, owner: Projectile["owner"], target: Rect): Projectile {
  return {
    id: state.nextProjectileId++, owner, x: target.x + target.width / 2, y: target.y + target.height / 2,
    vx: 0, vy: 0, radius: 8, life: 1,
  };
}

function kill(state: RoomGameState, id: string): void {
  const player = state.players[id].player;
  player.hp = 1;
  player.hurtUntil = 0;
  state.projectiles.push(projectile(state, "boss", player));
  stepRoomGame(state, FRAME);
}

check("four distinct avatars move independently while the shared clock advances once", () => {
  const state = room();
  commandRoomGame(state, "start");
  const positions = IDS.map((id) => state.players[id].player.x);
  setRoomInput(state, IDS[0], input({ right: true }), 0);
  setRoomInput(state, IDS[1], input({ left: true }), 0);
  setRoomInput(state, IDS[2], input({ jump: true }), 0);
  stepRoomGame(state, FRAME);
  assert.equal(state.time, FRAME);
  assert.equal(state.players[IDS[0]].player.x, positions[0] + 260 * FRAME);
  assert.equal(state.players[IDS[1]].player.x, positions[1] - 260 * FRAME);
  assert.ok(state.players[IDS[2]].player.vy < 0);
  assert.equal(state.players[IDS[3]].player.x, positions[3]);
  assert.equal(new Set(IDS.map((id) => state.players[id].player)).size, 4);
});

check("sequence checks reject duplicates, stale packets, malformed controls and unknown ids", () => {
  const state = room();
  commandRoomGame(state, "start");
  assert.equal(setRoomInput(state, "host", input({ right: true }), 10), true);
  assert.equal(setRoomInput(state, "host", input({ left: true }), 10), false);
  assert.equal(setRoomInput(state, "host", input({ left: true }), 9), false);
  assert.equal(setRoomInput(state, "host", input(), NaN), false);
  assert.equal(setRoomInput(state, "host", input(), -1), false);
  assert.equal(setRoomInput(state, "host", { right: "yes" } as unknown as Input, 11), false);
  assert.equal(setRoomInput(state, "missing", input(), 0), false);
  const x = state.players.host.player.x;
  stepRoomGame(state, FRAME);
  assert.ok(state.players.host.player.x > x);
});

check("quick down/up packets survive until a server tick for movement, jump, E and F", () => {
  const state = room();
  commandRoomGame(state, "start");
  const x = state.players.host.player.x;
  setRoomInput(state, "host", input({ right: true, jump: true }), 0);
  setRoomInput(state, "host", input(), 1);
  stepRoomGame(state, FRAME);
  assert.ok(state.players.host.player.x > x);
  assert.ok(state.players.host.player.vy < 0);
  const movedX = state.players.host.player.x;
  stepRoomGame(state, FRAME);
  assert.equal(state.players.host.player.x, movedX, "movement tap lasts one frame");

  const station = STATIONS[0];
  Object.assign(state.players["player-b"].player, { x: station.x, y: station.y + station.height - 46 });
  setRoomInput(state, "player-b", input({ interact: true }), 0);
  setRoomInput(state, "player-b", input(), 1);
  stepRoomGame(state, FRAME);
  assert.equal(state.taskStep, 1);

  const fight = bossRoom();
  setRoomInput(fight, "host", input({ shoot: true }), 0);
  setRoomInput(fight, "host", input(), 1);
  stepRoomGame(fight, FRAME);
  assert.equal(fight.projectiles.filter((shot) => shot.owner === "player").length, 1);
});

check("inputs expire after one second of real time even if game time is paused", () => {
  const originalNow = Date.now;
  let now = 100_000;
  Date.now = () => now;
  try {
    const state = room();
    commandRoomGame(state, "start");
    setRoomInput(state, "host", input({ right: true }), 0);
    stepRoomGame(state, FRAME);
    const x = state.players.host.player.x;
    now += 1001;
    stepRoomGame(state, FRAME);
    assert.equal(state.players.host.player.x, x);
    commandRoomGame(state, "pause");
    setRoomInput(state, "host", input({ jump: true }), 1);
    now += 1001;
    stepRoomGame(state, FRAME);
    commandRoomGame(state, "resume");
    stepRoomGame(state, FRAME);
    assert.equal(state.players.host.player.vy, 0);
  } finally {
    Date.now = originalNow;
  }
});

check("two players at the same task button cannot accidentally complete both steps", () => {
  const state = room();
  commandRoomGame(state, "start");
  for (const id of IDS.slice(0, 2)) {
    const station = STATIONS[0];
    Object.assign(state.players[id].player, { x: station.x, y: station.y + station.height - 46 });
    setRoomInput(state, id, input({ interact: true }), 0);
  }
  stepRoomGame(state, FRAME);
  assert.equal(state.taskStep, 1);
  assert.equal(state.phase, "task");
  interactRoomPlayer(state, "missing");
  const station = STATIONS[1];
  Object.assign(state.players["player-c"].player, { x: station.x, y: station.y + station.height - 46 });
  interactRoomPlayer(state, "player-c");
  assert.equal(state.taskStep, 2);
  assert.equal(state.phase, "task-complete");
});

check("quiz votes are personal, jumping clears a vote and reveal freezes all choices", () => {
  const state = quizRoom();
  assert.deepEqual(IDS.map((id) => state.players[id].quizChoice), [1, 1, 0, null]);
  setRoomInput(state, "player-b", input({ jump: true }), 0);
  stepRoomGame(state, FRAME);
  assert.equal(state.players["player-b"].quizChoice, null);
  commandRoomGame(state, "reveal");
  assert.equal(state.quizCorrectCount, 1);
  assert.equal(state.quizTotal, 4);
  const locked = IDS.map((id) => state.players[id].quizChoice);
  state.players.host.player.x = ANSWER_ZONES[0].x;
  setRoomInput(state, "host", input({ right: true }), 0);
  ticks(state, 5);
  assert.deepEqual(IDS.map((id) => state.players[id].quizChoice), locked);
  assert.equal(state.players.host.quizCorrect, true);
});

check("four-player boss health uses the frozen correct-answer ratio and preserves solo balance", () => {
  assert.equal(bossRoom([null]).boss.hp, 48);
  assert.equal(bossRoom([QUIZ.correct]).boss.hp, 34);
  assert.equal(bossRoom([null, null, null, null]).boss.hp, 192);
  assert.equal(bossRoom([1, 1, 0, null]).boss.hp, 163);
  assert.equal(bossRoom([1, 1, 1, 1]).boss.hp, 134);
  const state = bossRoom();
  setRoomPlayerConnected(state, "player-d", false);
  commandRoomGame(state, "retry");
  assert.equal(state.bossParticipantCount, 4);
  assert.equal(state.boss.maxHp, 122);
  for (let count = 0; count < 30; count += 1) commandRoomGame(state, "retry");
  assert.equal(state.boss.maxHp, 40);
});

check("each player has a shooting cooldown and shared projectiles advance exactly once", () => {
  const state = bossRoom();
  IDS.forEach((id) => setRoomInput(state, id, input({ shoot: true }), 0));
  stepRoomGame(state, FRAME);
  assert.equal(state.projectiles.length, 4);
  const shot = state.projectiles[0];
  const x = shot.x;
  const vx = shot.vx;
  const life = shot.life;
  stepRoomGame(state, FRAME);
  assert.equal(shot.x, x + vx * FRAME);
  assert.equal(shot.life, life - FRAME);
  assert.equal(state.projectiles.length, 4);
  ticks(state, 18);
  assert.equal(state.projectiles.filter((bullet) => bullet.owner === "player").length, 4);
  stepRoomGame(state, FRAME);
  assert.equal(state.projectiles.filter((bullet) => bullet.owner === "player").length, 8);
  assert.equal(new Set(state.projectiles.map((bullet) => bullet.id)).size, state.projectiles.length);
});

check("one player dying leaves a corpse while the rest continue moving and shooting", () => {
  const state = bossRoom();
  kill(state, "host");
  assert.equal(state.phase, "boss");
  assert.equal(state.players.host.player.hp, 0);
  assert.equal(state.players.host.player.y + state.players.host.player.height, 610);
  const corpseX = state.players.host.player.x;
  const aliveX = state.players["player-b"].player.x;
  setRoomInput(state, "host", input({ right: true, jump: true, shoot: true }), 0);
  setRoomInput(state, "player-b", input({ right: true, shoot: true }), 0);
  stepRoomGame(state, FRAME);
  assert.equal(state.players.host.player.x, corpseX);
  assert.ok(state.players["player-b"].player.x > aliveX);
  assert.equal(state.projectiles.filter((shot) => shot.owner === "player").length, 1);
});

check("only the last online player's death defeats the team; retry revives everybody", () => {
  const state = bossRoom();
  for (const id of IDS.slice(0, 3)) {
    kill(state, id);
    assert.equal(state.phase, "boss");
  }
  kill(state, IDS[3]);
  assert.equal(state.phase, "defeat");
  assert.equal(state.projectiles.length, 0);
  commandRoomGame(state, "retry");
  assert.equal(state.phase, "boss");
  assert.deepEqual(IDS.map((id) => state.players[id].player.hp), [3, 3, 3, 3]);
  assert.equal(state.attempt, 2);
  assert.equal(state.boss.maxHp, 122);
});

check("same-frame boss spread deals only one damage per player and invulnerability is personal", () => {
  const state = bossRoom();
  for (const id of IDS.slice(0, 2)) {
    state.projectiles.push(projectile(state, "boss", state.players[id].player), projectile(state, "boss", state.players[id].player));
  }
  stepRoomGame(state, FRAME);
  assert.equal(state.players.host.player.hp, 2);
  assert.equal(state.players["player-b"].player.hp, 2);
  assert.equal(state.players["player-c"].player.hp, 3);
  state.projectiles.push(projectile(state, "boss", state.players.host.player));
  stepRoomGame(state, FRAME);
  assert.equal(state.players.host.player.hp, 2);
});

check("the boss fires one readable volley for the room, then targets the next living player", () => {
  const state = bossRoom();
  ticks(state, 98);
  const first = state.projectiles.filter((shot) => shot.owner === "boss");
  assert.equal(first.length, 3);
  const slope1 = first[1].vy / first[1].vx;
  state.projectiles = [];
  state.time = state.boss.nextAttack;
  stepRoomGame(state, FRAME);
  const second = state.projectiles.filter((shot) => shot.owner === "boss");
  assert.equal(second.length, 3);
  assert.notEqual(second[1].vy / second[1].vx, slope1);
});

check("disconnect releases held input, preserves avatar state and reconnect accepts a fresh sequence", () => {
  const state = bossRoom();
  setRoomInput(state, "player-b", input({ right: true, shoot: true }), 100);
  stepRoomGame(state, FRAME);
  state.players["player-b"].player.hp = 2;
  const player = { ...state.players["player-b"].player };
  setRoomPlayerConnected(state, "player-b", false);
  assert.equal(setRoomInput(state, "player-b", input({ right: true }), 101), false);
  ticks(state, 2);
  assert.equal(state.players["player-b"].player.x, player.x);
  assert.equal(state.players["player-b"].player.hp, 2);
  setRoomPlayerConnected(state, "player-b", true);
  assert.equal(setRoomInput(state, "player-b", input({ left: true }), 0), true);
  stepRoomGame(state, FRAME);
  assert.ok(state.players["player-b"].player.x < player.x);
  assert.equal(state.players["player-b"].player.hp, 2);
});

check("offline living avatars do not hold a defeated team hostage", () => {
  const state = bossRoom();
  IDS.slice(1).forEach((id) => setRoomPlayerConnected(state, id, false));
  kill(state, "host");
  assert.equal(state.phase, "defeat");
  assert.equal(state.players["player-b"].player.hp, 3);
});

check("pause freezes every avatar, projectile and clock without queuing an airborne jump", () => {
  const state = bossRoom();
  state.projectiles.push(projectile(state, "boss", state.players.host.player));
  commandRoomGame(state, "pause");
  const frozen = JSON.stringify(state);
  IDS.forEach((id) => setRoomInput(state, id, input({ right: true, jump: true, shoot: true }), 0));
  ticks(state, 120);
  assert.equal(JSON.stringify(state), frozen);
  commandRoomGame(state, "resume");
  stepRoomGame(state, FRAME);
  assert.equal(state.players.host.player.vy, 0, "a held jump during pause is not a fresh press");
});

check("victory takes precedence over a simultaneous lethal shot and remains final", () => {
  const state = bossRoom();
  IDS.slice(1).forEach((id) => setRoomPlayerConnected(state, id, false));
  state.players.host.player.hp = 1;
  state.boss.hp = 3;
  state.projectiles.push(projectile(state, "boss", state.players.host.player), projectile(state, "player", state.boss));
  stepRoomGame(state, FRAME);
  assert.equal(state.phase, "victory");
  assert.equal(state.players.host.player.hp, 1);
  commandRoomGame(state, "retry");
  assert.equal(state.phase, "victory");
});

check("serialized snapshots contain no inputs and restore safely with released controls", () => {
  const state = bossRoom();
  setRoomInput(state, "host", input({ right: true, shoot: true }), 25);
  const serialized = JSON.stringify(state);
  assert.ok(!serialized.includes("previousInput"));
  assert.ok(!serialized.includes("receivedAt"));
  assert.ok(!serialized.includes("sequence"));
  const restored = JSON.parse(serialized) as RoomGameState;
  const x = restored.players.host.player.x;
  stepRoomGame(restored, FRAME);
  assert.equal(restored.players.host.player.x, x);
  assert.equal(restored.projectiles.filter((shot) => shot.owner === "player").length, 0);
  assert.equal(setRoomInput(restored, "host", input({ left: true }), 0), true);
  assert.equal(projectPlayerGame(restored, "host")?.nickname, "Игрок 1");
  assert.equal(projectPlayerGame(restored, "missing"), null);
});

check("restart preserves roster and host identity; close blocks gameplay until authorized restart", () => {
  const state = bossRoom();
  commandRoomGame(state, "close");
  assert.equal(state.phase, "closed");
  assert.equal(setRoomInput(state, "host", input({ shoot: true }), 0), false);
  const closed = JSON.stringify(state);
  commandRoomGame(state, "start");
  commandRoomGame(state, "retry");
  commandRoomGame(state, "skip");
  ticks(state, 10);
  assert.equal(JSON.stringify(state), closed);
  commandRoomGame(state, "restart");
  assert.equal(state.phase, "lobby");
  assert.equal(state.hostId, "host");
  assert.equal(Object.keys(state.players).length, 4);
  assert.deepEqual(IDS.map((id) => state.players[id].player.hp), [3, 3, 3, 3]);
  assert.deepEqual(IDS.map((id) => state.players[id].quizChoice), [null, null, null, null]);
  assert.equal(state.taskStep, 0);
  assert.equal(state.time, 0);
});

check("arbitrary player ids cannot modify a record prototype or overwrite an existing participant", () => {
  const state = room(1);
  assert.equal(addRoomPlayer(state, "host", "Другой", "#000000"), false);
  assert.equal(addRoomPlayer(state, "__proto__", "Особый ник", "#61d6bd"), true);
  assert.equal(Object.getPrototypeOf(state.players), Object.prototype);
  assert.equal(state.players.__proto__.nickname, "Особый ник");
  assert.equal(Object.keys(state.players).length, 2);
});

console.log(`\n${checks} multiplayer engine checks passed.`);
