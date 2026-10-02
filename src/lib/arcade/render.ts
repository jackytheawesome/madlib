import {
  ANSWER_ZONES,
  BOSS_PLATFORMS,
  QUIZ,
  STATIONS,
  TASK_PLATFORMS,
  WORLD,
  type Boss,
  type GameState,
  type Platform,
  type Player,
} from "./types";
import { projectPlayerGame } from "./room-engine";
import type { RoomGameState } from "./room-types";

type DrawOptions = { reducedMotion?: boolean };

const palette = {
  ink: "#121b30",
  hair: "#28324b",
  skin: "#f5bd91",
  skinShade: "#d78f72",
  white: "#fff6e4",
  trousers: "#283b59",
  shoes: "#111a2b",
  cyan: "#7cf3f0",
  orange: "#ffb25b",
  violet: "#a899ff",
  platform: "#25354f",
  platformEdge: "#101c32",
};

function pixelRect(
  ctx: CanvasRenderingContext2D,
  color: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
}

function crossEye(ctx: CanvasRenderingContext2D, x: number, y: number, pixel: number) {
  ctx.fillStyle = palette.ink;
  for (let i = 0; i < 3; i += 1) {
    ctx.fillRect(x + i * pixel, y + i * pixel, pixel, pixel);
    ctx.fillRect(x + (2 - i) * pixel, y + i * pixel, pixel, pixel);
  }
}

function drawPlatform(ctx: CanvasRenderingContext2D, platform: Platform, boss = false) {
  const { x, y, width, height } = platform;
  const topColor = boss ? "#d99764" : palette.violet;
  pixelRect(ctx, palette.platformEdge, x, y + 4, width, height);
  pixelRect(ctx, palette.platform, x + 3, y + 4, width - 6, height - 4);
  pixelRect(ctx, topColor, x, y, width, 4);
  pixelRect(ctx, boss ? "#ffcf99" : "#d5ccff", x + 3, y, width - 6, 2);
  for (let notch = x + 15; notch < x + width - 8; notch += 32) {
    pixelRect(ctx, "#3d4e69", notch, y + 8, 8, 3);
  }
}

function drawName(
  ctx: CanvasRenderingContext2D,
  nickname: string,
  color: string,
  centerX: number,
  y: number,
) {
  ctx.save();
  ctx.font = "600 13px system-ui, sans-serif";
  let name = nickname.trim() || "Игрок";
  if (name.length > 22) name = `${name.slice(0, 21)}…`;
  const width = Math.ceil(ctx.measureText(name).width) + 29;
  const x = Math.round(centerX - width / 2);
  const top = Math.round(y);
  pixelRect(ctx, "#0e192b", x + 3, top, width - 6, 23);
  pixelRect(ctx, "#0e192b", x, top + 3, width, 17);
  pixelRect(ctx, "#32455f", x + 3, top, width - 6, 1);
  pixelRect(ctx, color, x + 8, top + 9, 5, 5);
  ctx.fillStyle = "#f3f6ff";
  ctx.textBaseline = "middle";
  ctx.fillText(name, x + 18, top + 11.5);
  ctx.restore();
}

function drawCorpse(ctx: CanvasRenderingContext2D, player: Player, color: string) {
  const x = Math.round(player.x - 6);
  const floor = Math.round(player.y + player.height);
  ctx.save();
  ctx.globalAlpha = 0.2;
  pixelRect(ctx, palette.ink, x - 2, floor - 2, 57, 4);
  ctx.restore();
  pixelRect(ctx, palette.shoes, x, floor - 12, 7, 10);
  pixelRect(ctx, palette.trousers, x + 7, floor - 12, 12, 10);
  pixelRect(ctx, color, x + 19, floor - 15, 17, 13);
  pixelRect(ctx, palette.skinShade, x + 22, floor - 5, 13, 3);
  pixelRect(ctx, palette.skin, x + 36, floor - 13, 15, 11);
  pixelRect(ctx, palette.hair, x + 36, floor - 16, 15, 4);
  pixelRect(ctx, palette.hair, x + 48, floor - 13, 3, 10);
  crossEye(ctx, x + 38, floor - 10, 1.5);
  crossEye(ctx, x + 44, floor - 10, 1.5);
}

function drawPlayer(ctx: CanvasRenderingContext2D, state: GameState, quiet: boolean) {
  const player = state.player;
  const dead = player.hp <= 0 || state.phase === "defeat";
  if (dead) {
    drawCorpse(ctx, player, state.color);
    drawName(ctx, state.nickname, state.color, player.x + player.width / 2, player.y + player.height - 47);
    return;
  }

  if (player.grounded) {
    ctx.save();
    ctx.globalAlpha = 0.19;
    pixelRect(ctx, palette.ink, player.x + 2, player.y + player.height - 2, player.width - 4, 4);
    ctx.restore();
  }

  const running = player.grounded && Math.abs(player.vx) > 10;
  const step = running && !quiet ? Math.floor(state.time * 10) % 2 : 0;
  const airborne = !player.grounded;
  const hurt = state.time < player.hurtUntil;
  ctx.save();
  if (hurt && !quiet && Math.floor(state.time * 18) % 2 === 0) ctx.globalAlpha = 0.38;
  ctx.translate(Math.round(player.x), Math.round(player.y));
  if (player.facing === -1) {
    ctx.translate(player.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.translate(Math.floor((player.width - 33) / 2), player.height - 45);

  // Eleven by fifteen pixels, each three world units: readable at small sizes.
  pixelRect(ctx, palette.hair, 12, 0, 12, 3);
  pixelRect(ctx, palette.hair, 6, 3, 21, 9);
  pixelRect(ctx, palette.skinShade, 6, 12, 6, 9);
  pixelRect(ctx, palette.skin, 12, 9, 15, 12);
  pixelRect(ctx, palette.skin, 27, 15, 3, 3);
  pixelRect(ctx, palette.hair, 9, 9, 6, 6);
  pixelRect(ctx, palette.ink, 24, 12, 3, 3);
  pixelRect(ctx, palette.skinShade, 21, 18, 6, 3);
  pixelRect(ctx, palette.skin, 15, 21, 9, 3);

  pixelRect(ctx, state.color, 6, 24, 21, 12);
  pixelRect(ctx, state.color, 3, airborne ? 21 : 24 + step * 3, 6, 6);
  pixelRect(ctx, palette.skin, 3, airborne ? 18 : 30 + step * 3, 3, 6);
  pixelRect(ctx, state.color, 27, airborne ? 21 : 24, 3, 6);
  pixelRect(ctx, palette.skin, 27, airborne ? 18 : 30 - step * 3, 3, 6);
  pixelRect(ctx, palette.white, 21, 27, 3, 3);
  pixelRect(ctx, "#ffffff30", 9, 24, 6, 3);

  const leftFoot = airborne ? 36 : 39 - step * 3;
  const rightFoot = airborne ? 39 : 36 + step * 3;
  pixelRect(ctx, palette.trousers, 9, 36, 6, Math.max(3, leftFoot - 33));
  pixelRect(ctx, palette.trousers, 21, 36, 6, Math.max(3, rightFoot - 33));
  pixelRect(ctx, palette.shoes, 6, leftFoot + 3, 9, 3);
  pixelRect(ctx, palette.shoes, 21, rightFoot + 3, 9, 3);

  if (state.phase === "victory") {
    pixelRect(ctx, palette.orange, 8, -14, 3, 3);
    pixelRect(ctx, palette.cyan, 23, -18, 3, 3);
  }
  ctx.restore();
  drawName(ctx, state.nickname, state.color, player.x + player.width / 2, player.y - 34);
}

function drawBoss(ctx: CanvasRenderingContext2D, boss: Boss, time: number, quiet: boolean, preview = false) {
  const dead = boss.hp <= 0 && !preview;
  ctx.save();
  if (!preview && time < boss.hurtUntil && !quiet && Math.floor(time * 18) % 2 === 0) {
    ctx.globalAlpha = 0.45;
  }
  ctx.translate(Math.round(boss.x), Math.round(boss.y));
  ctx.scale(boss.width / 54, boss.height / 84);

  const block = (color: string, x: number, y: number, width: number, height: number) => {
    pixelRect(ctx, color, x * 3, y * 3, width * 3, height * 3);
  };

  block(palette.hair, 6, 0, 8, 2);
  block(palette.hair, 4, 2, 12, 4);
  block(palette.skinShade, 4, 6, 2, 5);
  block(palette.skin, 6, 4, 9, 8);
  block(palette.skin, 3, 7, 3, 2);
  block(palette.hair, 14, 4, 2, 4);
  block(palette.skinShade, 7, 10, 7, 2);
  block(palette.hair, 6, 11, 8, 2);
  block(palette.skin, 8, 13, 5, 2);

  if (dead) {
    crossEye(ctx, 6 * 3, 6 * 3, 2);
    crossEye(ctx, 11 * 3, 6 * 3, 2);
  } else {
    block(palette.ink, 4, 5, 12, 1);
    block(palette.ink, 5, 6, 4, 3);
    block(palette.ink, 10, 6, 4, 3);
    block("#c9eff4", 6, 6, 2, 2);
    block("#c9eff4", 11, 6, 2, 2);
    block(palette.ink, 6, 7, 1, 1);
    block(palette.ink, 11, 7, 1, 1);
  }

  block("#cd775c", 4, 15, 12, 8);
  block("#ed9570", 5, 15, 10, 6);
  block("#f9be90", 6, 15, 3, 1);
  block("#ffe2bc", 12, 17, 2, 2);
  block("#cd775c", 2, 16, 3, 6);
  block(palette.skin, 2, 21, 3, 3);
  block("#cd775c", 16, 16, 2, 5);
  block(palette.skin, 16, 21, 2, 3);
  block(palette.trousers, 5, 23, 4, 4);
  block(palette.trousers, 12, 23, 3, 4);
  block(palette.shoes, 4, 27, 5, 1);
  block(palette.shoes, 12, 27, 5, 1);

  // A tiny desktop pointer wand: the product designer's weapon.
  block(palette.ink, 0, 16, 1, 10);
  block(palette.white, 0, 12, 1, 5);
  block(palette.white, 1, 13, 1, 3);
  block(palette.white, 2, 14, 1, 1);
  block(palette.cyan, 0, 18, 1, 2);
  ctx.restore();
}

function drawProjectiles(ctx: CanvasRenderingContext2D, state: GameState, quiet: boolean) {
  for (const shot of state.projectiles) {
    const size = Math.max(4, Math.round(shot.radius * 2));
    const color = shot.owner === "player" ? palette.cyan : palette.orange;
    const length = Math.hypot(shot.vx, shot.vy) || 1;
    const dx = shot.vx / length;
    const dy = shot.vy / length;
    if (!quiet) {
      ctx.save();
      ctx.globalAlpha = 0.2;
      pixelRect(ctx, color, shot.x - dx * 15 - size / 2, shot.y - dy * 15 - size / 2, size, size);
      ctx.globalAlpha = 0.45;
      pixelRect(ctx, color, shot.x - dx * 8 - size / 2, shot.y - dy * 8 - size / 2, size, size);
      ctx.restore();
    }
    pixelRect(ctx, color, shot.x - size / 2, shot.y - size / 2, size, size);
    pixelRect(ctx, palette.white, shot.x - 1.5, shot.y - 1.5, 3, 3);
  }
}

function drawStationHint(ctx: CanvasRenderingContext2D, state: GameState, quiet: boolean) {
  const station = STATIONS[state.taskStep];
  if (!station || state.player.hp <= 0) return;
  const center = station.x + station.width / 2;
  const feet = state.player.y + state.player.height;
  if (Math.abs(state.player.x + state.player.width / 2 - center) > 110 ||
      Math.abs(feet - (station.y + station.height)) > 90) return;
  const bob = quiet ? 0 : Math.sin(state.time * 4) * 3;
  const x = Math.round(center - 13);
  const y = Math.round(station.y - 35 + bob);
  pixelRect(ctx, palette.ink, x + 3, y, 20, 24);
  pixelRect(ctx, palette.ink, x, y + 3, 26, 18);
  pixelRect(ctx, palette.cyan, x + 3, y, 20, 2);
  pixelRect(ctx, palette.cyan, x + 10, y + 26, 6, 3);
  pixelRect(ctx, palette.cyan, x + 12, y + 29, 2, 2);
  ctx.font = "700 15px system-ui, sans-serif";
  ctx.fillStyle = palette.white;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("E", center, y + 12);
}

function drawQuizZones(ctx: CanvasRenderingContext2D, state: GameState) {
  const revealed = state.phase === "quiz-reveal";
  for (let index = 0; index < ANSWER_ZONES.length; index += 1) {
    const zone = ANSWER_ZONES[index];
    const chosen = state.quizChoice === index;
    const correct = revealed && index === QUIZ.correct;
    const wrong = revealed && chosen && !correct;
    const color = correct ? "#88efbd" : wrong ? "#ff8c95" : chosen ? palette.cyan : "#64758f";
    if (chosen || correct) {
      ctx.save();
      ctx.globalAlpha = 0.12;
      pixelRect(ctx, color, zone.x, zone.y, zone.width, zone.height);
      ctx.restore();
    }
    pixelRect(ctx, color, zone.x, zone.y + zone.height - 5, zone.width, 5);
    pixelRect(ctx, color, zone.x, zone.y + zone.height - 15, 3, 10);
    pixelRect(ctx, color, zone.x + zone.width - 3, zone.y + zone.height - 15, 3, 10);
  }
  drawPlatform(ctx, TASK_PLATFORMS[0]);
}

/** Draws only game sprites and collision surfaces; the product UI stays in the DOM. */
function drawScene(ctx: CanvasRenderingContext2D, state: GameState, options: DrawOptions): void {
  ctx.save();
  ctx.clearRect(0, 0, WORLD.width, WORLD.height);
  ctx.imageSmoothingEnabled = false;
  const quiet = Boolean(options.reducedMotion || state.paused);

  switch (state.phase) {
    case "task":
    case "task-complete":
      for (const platform of TASK_PLATFORMS) drawPlatform(ctx, platform);
      if (state.phase === "task") drawStationHint(ctx, state, quiet);
      break;
    case "quiz":
    case "quiz-reveal":
      drawQuizZones(ctx, state);
      break;
    case "boss":
    case "defeat":
    case "victory":
      for (const platform of BOSS_PLATFORMS) drawPlatform(ctx, platform, true);
      drawBoss(ctx, state.boss, state.time, quiet);
      drawProjectiles(ctx, state, quiet);
      break;
    case "lobby":
      drawPlatform(ctx, BOSS_PLATFORMS[0]);
      drawBoss(ctx, { ...state.boss, x: 966, y: 610 - state.boss.height }, state.time, true, true);
      break;
    case "closed":
      ctx.globalAlpha = 0.35;
      drawPlatform(ctx, BOSS_PLATFORMS[0]);
      break;
  }
  ctx.restore();
}

export function drawGame(ctx: CanvasRenderingContext2D, state: GameState, options: DrawOptions = {}): void {
  drawScene(ctx, state, options);
  ctx.save();
  drawPlayer(ctx, state, Boolean(options.reducedMotion || state.paused));
  ctx.restore();
}

/** Shared scenery is drawn once, followed by every room avatar; the local one stays on top. */
export function drawRoomGame(ctx: CanvasRenderingContext2D, state: RoomGameState, localPlayerId: string, options: DrawOptions = {}): void {
  const members = Object.values(state.players);
  const localView = projectPlayerGame(state, localPlayerId)
    ?? (members[0] ? projectPlayerGame(state, members[0].id) : null);
  if (!localView) {
    ctx.clearRect(0, 0, WORLD.width, WORLD.height);
    return;
  }
  drawScene(ctx, localView, options);
  const sorted = members.filter((member) => member.id !== localPlayerId);
  const local = members.find((member) => member.id === localPlayerId);
  if (local) sorted.push(local);
  for (const member of sorted) {
    const game = projectPlayerGame(state, member.id)!;
    ctx.save();
    if (!member.connected) ctx.globalAlpha = 0.45;
    drawPlayer(ctx, game, Boolean(options.reducedMotion || state.paused));
    ctx.restore();
  }
}
