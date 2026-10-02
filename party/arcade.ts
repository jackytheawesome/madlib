import type * as Party from "partykit/server";
import { issueTicket, verifyTicket, type ArcadeTicket } from "../src/lib/arcade/auth";
import {
  addRoomPlayer, commandRoomGame, createRoomGame, interactRoomPlayer,
  setRoomInput, setRoomPlayerConnected, stepRoomGame,
} from "../src/lib/arcade/room-engine";
import type { RoomGameState } from "../src/lib/arcade/room-types";
import { STATIONS, type Command, type Input } from "../src/lib/arcade/types";

const LIMIT = 4;
const ROOM_ID = "demo";
const HOST_ID = "host";
const STORAGE_KEY = "arcade-room-v1";
const COMMANDS = new Set<Command>(["start", "next", "reveal", "retry", "skip", "pause", "resume", "restart", "close"]);
const encoder = new TextEncoder();

type ConnectionIdentity = Pick<ArcadeTicket, "playerId" | "role" | "epoch" | "expiresAt">;
type PersistentRoom = {
  version: 1;
  open: boolean;
  epoch: number;
  passwordHash: string | null;
  passwordSalt: string | null;
  game: RoomGameState;
};
type Reservation = { expiresAt: number };
type RateWindow = { count: number; start: number };

function response(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function configuredSecret(env: Record<string, unknown>): string | null {
  const value = env.ARCADE_SECRET;
  return typeof value === "string" && value.length >= 32 ? value : null;
}

function equalString(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function bytesHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function passwordHash(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits({
    name: "PBKDF2", salt: encoder.encode(salt), iterations: 100_000, hash: "SHA-256",
  }, key, 256);
  return bytesHex(new Uint8Array(hash));
}

function profile(value: Record<string, unknown>): { nickname: string; color: string } | null {
  if (typeof value.nickname !== "string" || typeof value.color !== "string") return null;
  const nickname = value.nickname.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 18);
  if (!nickname || !/^#[0-9a-f]{6}$/i.test(value.color)) return null;
  return { nickname, color: value.color };
}

/** One separate, authoritative room. Existing Chepuha rooms keep their own server. */
export default class ArcadeServer implements Party.Server {
  readonly options = { hibernate: false };
  game = createRoomGame(HOST_ID);
  open = false;
  epoch = 0;
  private passwordHash: string | null = null;
  private passwordSalt: string | null = null;
  private readonly reservations = new Map<string, Reservation>();
  private readonly passwordAttempts = new Map<string, RateWindow>();
  private readonly messageRates = new Map<string, RateWindow>();
  private simulation: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private lastSnapshot = 0;
  private lastPersist = 0;
  private settingsBusy = false;
  private settingsRevision = 0;

  constructor(readonly room: Party.Room) {
    commandRoomGame(this.game, "close");
  }

  static async onBeforeConnect(request: Party.Request, lobby: Party.Lobby): Promise<Party.Request | Response> {
    if (lobby.id !== ROOM_ID) return response({ error: "Комната не найдена" }, 404);
    const secret = configuredSecret(lobby.env);
    if (!secret) return response({ error: "Комната ещё не настроена" }, 503);
    const token = new URL(request.url).searchParams.get("token");
    if (!token || !await verifyTicket(secret, token)) return response({ error: "Нужно войти в комнату" }, 401);
    return request;
  }

  async onStart(): Promise<void> {
    const saved = await this.room.storage.get<PersistentRoom>(STORAGE_KEY);
    if (saved?.version === 1) {
      this.open = saved.open;
      this.epoch = saved.epoch;
      this.passwordHash = saved.passwordHash;
      this.passwordSalt = saved.passwordSalt;
      this.game = saved.game;
      for (const id of Object.keys(this.game.players)) setRoomPlayerConnected(this.game, id, false);
      if (this.open) commandRoomGame(this.game, "pause");
      else commandRoomGame(this.game, "close");
    }
  }

  async onRequest(request: Party.Request): Promise<Response> {
    if (this.room.id !== ROOM_ID) return response({ error: "Комната не найдена" }, 404);
    if (request.method === "GET") return response(this.publicStatus());
    if (request.method !== "POST") return response({ error: "Метод не поддерживается" }, 405);
    const secret = configuredSecret(this.room.env);
    if (!secret) return response({ error: "Комната ещё не настроена" }, 503);
    if (!equalString(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
      return response({ error: "Нет доступа" }, 401);
    }
    const raw = await request.text();
    if (raw.length > 8192) return response({ error: "Слишком большой запрос" }, 413);
    let data: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      data = parsed as Record<string, unknown>;
    } catch {
      return response({ error: "Некорректный запрос" }, 400);
    }

    if (data.action === "session") {
      const ticket = typeof data.token === "string" ? await verifyTicket(secret, data.token) : null;
      if (!ticket || !this.mayResume(ticket)) return response({ error: "Нужно войти заново" }, 401);
      return this.ticketResponse(secret, ticket);
    }
    const identity = profile(data);
    if (!identity) return response({ error: "Укажите ник и цвет героя" }, 400);
    if (data.action === "host") {
      return this.ticketResponse(secret, { ...identity, playerId: HOST_ID, role: "host", epoch: this.epoch });
    }
    if (data.action !== "join") return response({ error: "Неизвестное действие" }, 400);
    if (!this.open) return response({ error: "Ведущая ещё не открыла комнату" }, 403);
    if (!this.hostOnline()) return response({ error: "Дождитесь ведущую" }, 403);
    if (typeof data.resumeToken === "string") {
      const existing = await verifyTicket(secret, data.resumeToken);
      if (existing?.role === "guest" && this.mayResume(existing)) return this.ticketResponse(secret, existing);
    }
    if (this.game.phase !== "lobby") return response({ error: "Игра уже началась. Дождитесь новой репетиции" }, 409);
    const attemptKey = request.headers.get("x-arcade-client")?.slice(0, 160) || "proxy";
    if (!this.allowAttempt(attemptKey)) return response({ error: "Слишком много попыток. Попробуйте через минуту" }, 429);
    if (typeof data.password !== "string" || data.password.length > 128 || !this.passwordHash || !this.passwordSalt
      || !equalString(await passwordHash(data.password, this.passwordSalt), this.passwordHash)) {
      return response({ error: "Неверный пароль" }, 403);
    }
    // Hashing yields, so admission policy and capacity are checked again afterwards.
    if (!this.open || !this.hostOnline()) return response({ error: "Комната закрыта" }, 403);
    if (this.game.phase !== "lobby") return response({ error: "Игра уже началась" }, 409);
    this.pruneReservations();
    if (Object.keys(this.game.players).length + this.reservations.size >= LIMIT) {
      return response({ error: "В комнате уже четыре игрока" }, 409);
    }
    const playerId = crypto.randomUUID();
    this.reservations.set(playerId, { expiresAt: Date.now() + 45_000 });
    return this.ticketResponse(secret, { ...identity, playerId, role: "guest", epoch: this.epoch });
  }

  async onConnect(connection: Party.Connection<ConnectionIdentity>, context: Party.ConnectionContext): Promise<void> {
    const secret = configuredSecret(this.room.env);
    const token = new URL(context.request.url).searchParams.get("token");
    const ticket = secret && token ? await verifyTicket(secret, token) : null;
    if (this.room.id !== ROOM_ID || !ticket || (ticket.role === "guest" && !this.mayConnectGuest(ticket))) {
      connection.close(4001, "Войдите в комнату заново");
      return;
    }
    if (ticket.role === "guest" && !this.hostOnline()) {
      connection.close(4005, "Дождитесь возвращения ведущей");
      return;
    }
    const other = this.connectionFor(ticket.playerId);
    connection.setState({ playerId: ticket.playerId, role: ticket.role, epoch: ticket.epoch, expiresAt: ticket.expiresAt });
    if (other && other.id !== connection.id) other.close(4004, "Игра открыта в другой вкладке");
    if (Object.hasOwn(this.game.players, ticket.playerId)) {
      const member = this.game.players[ticket.playerId];
      member.nickname = ticket.nickname;
      member.color = ticket.color;
      setRoomPlayerConnected(this.game, ticket.playerId, true);
    } else {
      addRoomPlayer(this.game, ticket.playerId, ticket.nickname, ticket.color);
    }
    this.reservations.delete(ticket.playerId);
    connection.send(JSON.stringify({ type: "welcome", playerId: ticket.playerId, role: ticket.role }));
    this.broadcastState();
    this.startSimulation();
    await this.persist();
  }

  async onMessage(message: string | ArrayBuffer | ArrayBufferView, sender: Party.Connection<ConnectionIdentity>): Promise<void> {
    const identity = sender.state;
    if (!identity || identity.expiresAt <= Math.floor(Date.now() / 1000)
      || (identity.role === "guest" && (!this.open || identity.epoch !== this.epoch))) {
      sender.close(4001, "Войдите в комнату заново");
      return;
    }
    if (typeof message !== "string" || message.length > 4096 || !this.allowMessage(sender.id)) return;
    let data: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(message);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      data = parsed as Record<string, unknown>;
    } catch {
      this.error(sender, "Некорректное сообщение");
      return;
    }
    if (data.type === "input") {
      setRoomInput(this.game, identity.playerId, data.input as Input, data.sequence as number);
      return;
    }
    if (data.type === "interact") {
      if (data.station !== STATIONS[this.game.taskStep]?.id) return;
      interactRoomPlayer(this.game, identity.playerId);
      this.broadcastState();
      await this.persist();
      return;
    }
    if (identity.role !== "host") {
      this.error(sender, "Это действие доступно только ведущей");
      return;
    }
    if (data.type === "command" && COMMANDS.has(data.command as Command)) {
      const command = data.command as Command;
      if (command === "close") await this.closeRoom();
      else if (this.open) {
        if (this.settingsBusy) { this.error(sender, "Подождите завершения смены пароля"); return; }
        commandRoomGame(this.game, command);
        this.broadcastState();
        await this.persist();
      }
      return;
    }
    if (data.type === "room") {
      if (data.action === "close") await this.closeRoom();
      else if (data.action === "open" || data.action === "password") await this.openRoom(data.password, sender);
      else this.error(sender, "Неизвестное действие");
      return;
    }
    this.error(sender, "Неизвестное действие");
  }

  async onClose(connection: Party.Connection<ConnectionIdentity>): Promise<void> {
    this.messageRates.delete(connection.id);
    const identity = connection.state;
    if (!identity || this.connectionFor(identity.playerId, connection.id)) return;
    setRoomPlayerConnected(this.game, identity.playerId, false);
    if (identity.role === "host") commandRoomGame(this.game, "pause");
    this.broadcastState();
    if (!this.anyAuthorizedConnection()) this.stopSimulation();
    await this.persist();
  }

  async onError(connection: Party.Connection<ConnectionIdentity>): Promise<void> {
    await this.onClose(connection);
  }

  private mayResume(ticket: ArcadeTicket): boolean {
    if (ticket.role === "host") return true;
    this.pruneReservations();
    return this.open && ticket.epoch === this.epoch
      && (Object.hasOwn(this.game.players, ticket.playerId) || this.reservations.has(ticket.playerId));
  }

  private mayConnectGuest(ticket: ArcadeTicket): boolean {
    if (!this.open || ticket.epoch !== this.epoch) return false;
    if (Object.hasOwn(this.game.players, ticket.playerId)) return true;
    this.pruneReservations();
    if (Object.keys(this.game.players).length >= LIMIT) return false;
    return this.game.phase === "lobby" || this.reservations.has(ticket.playerId);
  }

  private hostOnline(): boolean {
    return !!this.connectionFor(HOST_ID);
  }

  private connectionFor(playerId: string, exclude?: string): Party.Connection<ConnectionIdentity> | undefined {
    for (const connection of this.room.getConnections<ConnectionIdentity>()) {
      if (connection.id !== exclude && connection.readyState === 1 && connection.state?.playerId === playerId
        && connection.state.expiresAt > Math.floor(Date.now() / 1000)) return connection;
    }
    return undefined;
  }

  private anyAuthorizedConnection(): boolean {
    for (const connection of this.room.getConnections<ConnectionIdentity>()) {
      if (connection.readyState === 1 && connection.state) return true;
    }
    return false;
  }

  private publicStatus() {
    return {
      open: this.open, hostOnline: this.hostOnline(), phase: this.game.phase,
      count: Object.values(this.game.players).filter((member) => member.connected).length, limit: LIMIT,
    };
  }

  private async ticketResponse(secret: string, admission: Pick<ArcadeTicket, "playerId" | "role" | "nickname" | "color" | "epoch">): Promise<Response> {
    const token = await issueTicket(secret, admission);
    return response({ token, playerId: admission.playerId, role: admission.role, nickname: admission.nickname, color: admission.color });
  }

  private allowAttempt(key: string): boolean {
    const now = Date.now();
    const previous = this.passwordAttempts.get(key);
    if (!previous || now - previous.start >= 60_000) {
      this.passwordAttempts.set(key, { count: 1, start: now });
      if (this.passwordAttempts.size > 1000) for (const [id, value] of this.passwordAttempts) {
        if (now - value.start >= 60_000) this.passwordAttempts.delete(id);
      }
      return true;
    }
    previous.count++;
    return previous.count <= 8;
  }

  private allowMessage(connectionId: string): boolean {
    const now = Date.now();
    const previous = this.messageRates.get(connectionId);
    if (!previous || now - previous.start >= 1000) {
      this.messageRates.set(connectionId, { count: 1, start: now });
      return true;
    }
    return ++previous.count <= 150;
  }

  private pruneReservations(): void {
    for (const [id, value] of this.reservations) if (value.expiresAt <= Date.now()) this.reservations.delete(id);
  }

  private async openRoom(password: unknown, sender: Party.Connection<ConnectionIdentity>): Promise<void> {
    if (this.settingsBusy) { this.error(sender, "Подождите завершения предыдущего действия"); return; }
    if (this.game.phase !== "lobby" && this.game.phase !== "closed") {
      this.error(sender, "Сначала перезапустите репетицию, чтобы изменить пароль");
      return;
    }
    if (typeof password !== "string" || password.length < 6 || password.length > 128) {
      this.error(sender, "Пароль должен содержать от 6 до 128 символов");
      return;
    }
    this.settingsBusy = true;
    const revision = this.settingsRevision;
    try {
      const salt = bytesHex(crypto.getRandomValues(new Uint8Array(16)));
      const hash = await passwordHash(password, salt);
      // A later close action wins over a password hash that was still being computed.
      if (revision !== this.settingsRevision || !this.hostOnline()) return;
      this.epoch++;
      this.passwordHash = hash;
      this.passwordSalt = salt;
      this.open = true;
      const host = this.game.players[HOST_ID];
      this.game = createRoomGame(HOST_ID);
      if (host) addRoomPlayer(this.game, HOST_ID, host.nickname, host.color);
      this.reservations.clear();
      this.passwordAttempts.clear();
      this.broadcastState();
      this.disconnectGuests();
      await this.persist();
    } finally {
      this.settingsBusy = false;
    }
  }

  private async closeRoom(): Promise<void> {
    this.settingsRevision++;
    this.open = false;
    this.epoch++;
    this.reservations.clear();
    commandRoomGame(this.game, "close");
    this.broadcastState();
    this.disconnectGuests();
    await this.persist();
  }

  private disconnectGuests(): void {
    for (const connection of this.room.getConnections<ConnectionIdentity>()) {
      if (connection.state?.role === "guest") {
        connection.send(JSON.stringify({ type: "error", message: "Комната закрыта или пароль изменён. Войдите заново" }));
        connection.close(4003, "Комната закрыта или пароль изменён");
      }
    }
  }

  private startSimulation(): void {
    if (this.simulation) return;
    this.lastTick = this.lastSnapshot = this.lastPersist = Date.now();
    this.simulation = setInterval(() => {
      const now = Date.now();
      const previousPhase = this.game.phase;
      stepRoomGame(this.game, Math.min(0.05, Math.max(0, (now - this.lastTick) / 1000)));
      this.lastTick = now;
      if (now - this.lastSnapshot >= 50) {
        this.broadcastState();
        this.lastSnapshot = now;
      }
      if (previousPhase !== this.game.phase || now - this.lastPersist >= 5000) {
        this.lastPersist = now;
        void this.persist();
      }
    }, 1000 / 60);
  }

  private stopSimulation(): void {
    if (this.simulation) clearInterval(this.simulation);
    this.simulation = null;
  }

  private broadcastState(): void {
    const payload = JSON.stringify({ type: "state", state: this.game, room: { open: this.open, hostOnline: this.hostOnline(), limit: LIMIT } });
    for (const connection of this.room.getConnections<ConnectionIdentity>()) {
      const identity = connection.state;
      if (connection.readyState !== 1 || !identity) continue;
      if (identity.expiresAt <= Math.floor(Date.now() / 1000)) { connection.close(4001, "Сессия завершена"); continue; }
      if (identity.role === "guest" && (!this.open || identity.epoch !== this.epoch)) continue;
      connection.send(payload);
    }
  }

  private error(connection: Party.Connection, message: string): void {
    connection.send(JSON.stringify({ type: "error", message }));
  }

  private async persist(): Promise<void> {
    await this.room.storage.put(STORAGE_KEY, {
      version: 1, open: this.open, epoch: this.epoch,
      passwordHash: this.passwordHash, passwordSalt: this.passwordSalt, game: this.game,
    } satisfies PersistentRoom);
  }
}

ArcadeServer satisfies Party.Worker;
