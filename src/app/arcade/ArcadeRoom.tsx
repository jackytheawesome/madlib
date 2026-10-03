"use client";

import Link from "next/link";
import PartySocket from "partysocket";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { getRoomInteractable, projectPlayerGame, TASK_EXIT } from "@/lib/arcade/room-engine";
import { HERO_COLORS } from "@/lib/arcade/palette";
import { quizHealthAdjustment } from "@/lib/arcade/quiz-balance";
import { drawRoomGame } from "@/lib/arcade/render";
import type { RoomGameState } from "@/lib/arcade/room-types";
import { ANSWER_ZONES, EMPTY_INPUT, QUIZ, STATIONS, WORLD, type Command, type Input, type Phase } from "@/lib/arcade/types";
import { DocumentScene, PixelMark, position } from "./ArcadeDemo";
import styles from "./arcade.module.css";

const KEY_INPUTS: Record<string, keyof Input> = {
  ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
  Space: "jump", ArrowUp: "jump", KeyW: "jump", KeyE: "interact", KeyF: "shoot",
};
const PHASE_NAMES: Record<Phase, string> = {
  lobby: "Все собираются", task: "Задача", "task-complete": "Задача выполнена",
  quiz: "Выбираем ответ", "quiz-reveal": "Ответ раскрыт", boss: "Бой с дизайнером",
  defeat: "Новая попытка", victory: "Уровень пройден", closed: "Комната закрыта",
};

type Session = { token: string; playerId: string; role: "host" | "guest"; nickname: string; color: string };
type RoomMeta = { open: boolean; hostOnline: boolean; limit: number };
type PublicStatus = RoomMeta & { phase: Phase; count: number };
type Network = "connecting" | "online" | "reconnecting";
type Snapshot = { current: RoomGameState; previous: RoomGameState | null; receivedAt: number };

function validSession(value: unknown): value is Session {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<Session>;
  return typeof session.token === "string" && typeof session.playerId === "string"
    && (session.role === "host" || session.role === "guest")
    && typeof session.nickname === "string" && typeof session.color === "string";
}

/** Smooth only positions between authoritative snapshots; never advance gameplay in a browser. */
function interpolate(snapshot: Snapshot, now: number): RoomGameState {
  const { current, previous, receivedAt } = snapshot;
  if (!previous || previous.phase !== current.phase || current.paused) return current;
  const amount = Math.min(1, Math.max(0, (now - receivedAt) / 50));
  const players = { ...current.players };
  for (const [id, member] of Object.entries(players)) {
    const before = previous.players[id]?.player;
    if (!before || Math.hypot(member.player.x - before.x, member.player.y - before.y) > 180) continue;
    players[id] = { ...member, player: { ...member.player,
      x: before.x + (member.player.x - before.x) * amount,
      y: before.y + (member.player.y - before.y) * amount,
    } };
  }
  return { ...current, players };
}

function RoomQuiz({ state, playerId }: { state: RoomGameState; playerId: string }) {
  const member = state.players[playerId];
  const choice = member?.quizChoice ?? null;
  const revealed = state.phase === "quiz-reveal";
  const adjustment = quizHealthAdjustment(state.quizCorrectCount, state.quizTotal);
  const healthLabel = adjustment === 0 ? "HP босса без изменений" : `${adjustment > 0 ? "+" : "−"}${Math.abs(adjustment)}% HP босса`;
  const result = adjustment > 0 ? "Ошибок больше — босс стал сильнее." : adjustment < 0 ? "Правильных ответов больше — босс стал слабее." : "Здоровье босса осталось прежним.";
  return <div className={styles.quizScene}>
    <div className={styles.quizHeading}>
      <span className={styles.sceneEyebrow}>Один вопрос перед боем</span>
      <h2>{QUIZ.question}</h2>
      <p>{revealed ? QUIZ.explanation : "Встань на площадку с ответом. Менять выбор можно до раскрытия."}</p>
    </div>
    {QUIZ.options.map((option, index) => <div key={option}
      className={`${styles.answerCard} ${choice === index ? styles.answerSelected : ""} ${revealed && index === QUIZ.correct ? styles.answerCorrect : ""} ${revealed && choice === index && index !== QUIZ.correct ? styles.answerWrong : ""}`}
      style={position({ x: ANSWER_ZONES[index].x, y: 390, width: ANSWER_ZONES[index].width, height: 128 })}
    ><span className={styles.answerLetter}>{String.fromCharCode(65 + index)}</span><strong>{option}</strong><span className={styles.answerLabel}>{revealed && index === QUIZ.correct ? "✓ Правильный ответ" : choice === index ? "Твой выбор" : "Встань сюда"}</span></div>)}
    <div className={styles.quizResult} style={position({ x: 250, y: 267, width: 700, height: 82 })}>
      {revealed ? <><strong>Верно ответили {state.quizCorrectCount} из {state.quizTotal} · {healthLabel}</strong><span>{result} {member?.quizCorrect ? "Твой ответ помог команде!" : choice === null ? "Без ответа — тоже ошибка." : "В бою ещё можно помочь."}</span></> : <><strong>{choice === null ? "Выбери площадку" : `Твой выбор — ${String.fromCharCode(65 + choice)}`}</strong><span>Большинство ответов решит: босс станет слабее или сильнее</span></>}
    </div>
  </div>;
}

function RoomBoss({ state }: { state: RoomGameState }) {
  return <div className={styles.bossScene}>
    <div className={styles.arenaGrid} />
    <div className={styles.arenaTitle}><span className={styles.sceneEyebrow}>Босс уровня</span><h2>Серёга</h2><p>Дизайнер Документов</p></div>
    <div className={styles.bossHealth}><div><span>Здоровье босса</span><strong>{state.boss.hp} / {state.boss.maxHp}</strong></div><div className={styles.healthTrack}><span style={{ width: `${Math.max(0, state.boss.hp / Math.max(1, state.boss.maxHp)) * 100}%` }} /></div><small>Попытка {state.attempt} · квиз: {state.quizCorrectCount} из {state.quizTotal}</small></div>
    <div className={styles.arenaDecoration} style={position({ x: 47, y: 362, width: 98, height: 152 })}><span>H1</span><span>H2</span><span>¶</span></div>
    <div className={styles.arenaHint} style={position({ x: 350, y: 559, width: 580, height: 30 })}>Удерживай F · уклоняйся · игроки друг другу не мешают</div>
  </div>;
}

export default function ArcadeRoom({ hostMode = false }: { hostMode?: boolean }) {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [restoreUnavailable, setRestoreUnavailable] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [state, setState] = useState<RoomGameState | null>(null);
  const [room, setRoom] = useState<RoomMeta | null>(null);
  const [publicStatus, setPublicStatus] = useState<PublicStatus | null>(null);
  const [network, setNetwork] = useState<Network>("connecting");
  const [nickname, setNickname] = useState("");
  const [color, setColor] = useState(HERO_COLORS[0].value);
  const [password, setPassword] = useState("");
  const [guestPassword, setGuestPassword] = useState("");
  const [hostPassword, setHostPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [settings, setSettings] = useState(false);
  const socketRef = useRef<PartySocket | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);
  const stateRef = useRef<RoomGameState | null>(null);
  const onlineRef = useRef(false);
  const sequenceRef = useRef(0);
  const localIdRef = useRef("");
  const heldKeys = useRef(new Set<string>());
  const inputRef = useRef<Input>({ ...EMPTY_INPUT });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const restore = async () => {
      try {
        const response = await fetch(`/api/arcade/session?role=${hostMode ? "host" : "player"}`, { cache: "no-store", signal: controller.signal });
        const data: unknown = await response.json();
        if (response.status === 503) {
          setRestoreUnavailable(true); setError("Сервер комнаты временно недоступен. Сохранённый вход можно восстановить позже."); return;
        }
        setRestoreUnavailable(false);
        if (response.ok && validSession(data) && (!hostMode || data.role === "host")) {
          setSession(data); setNickname(data.nickname); setColor(data.color);
        }
      } catch {
        if (!controller.signal.aborted) { setRestoreUnavailable(true); setError("Не удалось связаться с комнатой. Попробуй подключиться ещё раз."); }
      }
      finally { if (!controller.signal.aborted) setBooting(false); }
    };
    void restore();
    return () => controller.abort();
  }, [hostMode, restoreAttempt]);

  useEffect(() => {
    const controller = new AbortController();
    const update = async () => {
      try {
        const response = await fetch("/api/arcade/status", { cache: "no-store", signal: controller.signal });
        if (response.ok) setPublicStatus(await response.json() as PublicStatus);
      } catch { /* A failed status poll must not disconnect an existing game. */ }
    };
    void update();
    const timer = setInterval(() => { if (!document.hidden) void update(); }, 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!session) return;
    const host = process.env.NEXT_PUBLIC_ARCADE_HOST?.replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!host) return;
    let disposed = false;
    let ended = false;
    let validatingSession = false;
    let nextValidationAt = 0;
    const validationController = new AbortController();
    const socket = new PartySocket({ host, party: "arcade", room: "demo", query: { token: session.token }, maxEnqueuedMessages: 0 });
    socketRef.current = socket;
    localIdRef.current = session.playerId;
    const clear = () => { heldKeys.current.clear(); inputRef.current = { ...EMPTY_INPUT }; };
    const release = () => {
      clear();
      if (onlineRef.current && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "input", input: inputRef.current, sequence: ++sequenceRef.current }));
    };
    const endSession = (message: string) => {
      ended = true; onlineRef.current = false; clear(); socket.close();
      setSession(null); setState(null); setRoom(null);
      stateRef.current = null; snapshotRef.current = null;
      setError(message);
    };
    const revalidate = async () => {
      if (disposed || ended || validatingSession || Date.now() < nextValidationAt) return;
      validatingSession = true; nextValidationAt = Date.now() + 5000;
      try {
        // A rejected upgrade is exposed as code 1006, without its HTTP 401 status.
        const response = await fetch(`/api/arcade/session?role=${session.role === "host" ? "host" : "player"}`, { cache: "no-store", signal: validationController.signal });
        if (disposed || ended) return;
        if (response.status === 401 || response.status === 403) {
          endSession("Вход в комнату истёк или пароль изменён. Войди заново.");
        }
        // A valid current ticket keeps its socket and existing reconnect backoff.
        // HTTP 503 leaves the cookie and websocket reconnect backoff intact.
      } catch { /* Temporary HTTP failures use the existing websocket reconnect path. */ }
      finally { validatingSession = false; }
    };
    socket.addEventListener("open", () => {
      if (disposed || ended) return;
      clear(); onlineRef.current = false;
      setNetwork("connecting");
    });
    socket.addEventListener("message", (event) => {
      if (disposed || ended) return;
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.type === "welcome") {
        sequenceRef.current = 0;
        onlineRef.current = true;
        localIdRef.current = message.playerId;
        setNetwork("online"); setError("");
        release();
      } else if (message.type === "state" && message.state?.players) {
        const next = message.state as RoomGameState;
        const changed = stateRef.current?.phase !== next.phase || stateRef.current?.paused !== next.paused;
        snapshotRef.current = { current: next, previous: snapshotRef.current?.current ?? null, receivedAt: performance.now() };
        stateRef.current = next;
        setState(next); setRoom(message.room as RoomMeta);
        if (changed) { release(); requestAnimationFrame(() => stageRef.current?.focus()); }
      } else if (message.type === "error") {
        setError(typeof message.message === "string" ? message.message : "Не удалось выполнить действие.");
      }
    });
    socket.addEventListener("close", (event) => {
      onlineRef.current = false; clear();
      if (disposed || ended) return;
      setNetwork("reconnecting");
      if ([4001, 4003, 4004].includes(event.code)) {
        endSession(event.code === 4004 ? "Комната ведущей открыта в другой вкладке. Продолжай там или войди здесь заново." : event.code === 4003 ? "Ведущая закрыла комнату или изменила пароль. Для входа нужен новый пароль." : "Вход в комнату истёк. Войди заново.");
      } else void revalidate();
    });
    socket.addEventListener("error", () => { void revalidate(); });
    const inputs = setInterval(() => {
      if (onlineRef.current && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "input", input: inputRef.current, sequence: ++sequenceRef.current }));
    }, 50);
    const hidden = () => { if (document.hidden) release(); };
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      disposed = true; validationController.abort(); release(); onlineRef.current = false;
      clearInterval(inputs); socket.close(); socketRef.current = null;
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [session]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animation = 0;
    const frame = (now: number) => {
      const snapshot = snapshotRef.current;
      if (snapshot) drawRoomGame(ctx, interpolate(snapshot, now), localIdRef.current, { reducedMotion: media.matches });
      else ctx.clearRect(0, 0, WORLD.width, WORLD.height);
      animation = requestAnimationFrame(frame);
    };
    animation = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(animation); if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  function transmit(message: object) {
    const socket = socketRef.current;
    if (!onlineRef.current || socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }

  function clearInput() {
    heldKeys.current.clear(); inputRef.current = { ...EMPTY_INPUT };
    transmit({ type: "input", input: inputRef.current, sequence: ++sequenceRef.current });
  }

  function command(value: Command) {
    if (session?.role !== "host") return;
    clearInput(); transmit({ type: "command", command: value });
    stageRef.current?.focus();
  }

  function announce(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2800);
  }

  function station(index: number) {
    const current = stateRef.current;
    if (!current || !onlineRef.current) return;
    if (getRoomInteractable(current, localIdRef.current) !== index) announce("Подойди героем к кнопке — появится подсказка E.");
    else transmit({ type: "interact", station: index === 2 ? "exit" : STATIONS[index]?.id });
    stageRef.current?.focus();
  }

  function keyboard(event: KeyboardEvent<HTMLDivElement>, pressed: boolean) {
    if (pressed && event.target instanceof HTMLElement && event.target.closest("button, input, textarea, a, select")) return;
    const current = stateRef.current;
    if (event.code === "Escape" && pressed && !event.repeat && session?.role === "host" && current && !["lobby", "closed", "victory", "defeat"].includes(current.phase)) {
      event.preventDefault(); command(current.paused ? "resume" : "pause"); return;
    }
    const key = KEY_INPUTS[event.code];
    if (!key) return;
    event.preventDefault();
    if (pressed && (!onlineRef.current || !current || current.paused || current.players[localIdRef.current]?.player.hp === 0)) return;
    if (pressed) heldKeys.current.add(event.code);
    else heldKeys.current.delete(event.code);
    inputRef.current[key] = [...heldKeys.current].some((code) => KEY_INPUTS[code] === key);
    // Fresh keydown and keyup packets preserve a tap shorter than the 50 ms heartbeat.
    if (!event.repeat) transmit({ type: "input", input: inputRef.current, sequence: ++sequenceRef.current });
  }

  async function join(event: FormEvent) {
    event.preventDefault();
    if (booting || restoreUnavailable || busy) return;
    setBusy(true); setError("");
    try {
      if (hostMode) {
        const login = await fetch("/api/arcade/host-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: hostPassword }) });
        if (!login.ok) throw new Error("Пароль ведущей не подошёл.");
      }
      const response = await fetch("/api/arcade/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: hostMode ? "host" : "player", nickname: nickname.trim(), color, ...(hostMode ? {} : { password }) }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !validSession(data)) throw new Error(data.error || data.message || "Не удалось войти в комнату.");
      setSession(data); setNetwork("connecting"); setPassword(""); setHostPassword("");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Нет связи. Попробуй ещё раз."); }
    finally { setBusy(false); }
  }

  function roomAction(action: "open" | "password" | "close") {
    if (session?.role !== "host") return;
    setError(""); clearInput();
    if (action !== "close" && guestPassword.length < 6) { setError("Пароль для участников — минимум 6 символов."); return; }
    if (transmit({ type: "room", action, ...(action === "close" ? {} : { password: guestPassword }) })) {
      setGuestPassword(""); setSettings(false);
      stageRef.current?.focus();
    }
  }

  const isHost = session?.role === "host";
  const online = network === "online" && !!state;
  const local = state && session ? projectPlayerGame(state, session.playerId) : null;
  const localMember = state && session ? state.players[session.playerId] : null;
  const phase = state?.phase ?? publicStatus?.phase ?? "lobby";
  const paused = state?.paused ?? false;
  const taskScene = ["lobby", "task", "task-complete", "closed"].includes(phase);
  const quizScene = ["quiz", "quiz-reveal"].includes(phase);
  const combatScene = ["boss", "defeat", "victory"].includes(phase);
  const phaseIndex = taskScene ? 0 : quizScene ? 1 : 2;
  const members = state ? Object.values(state.players) : [];
  const count = members.filter((member) => member.connected).length;
  const limit = room?.limit ?? publicStatus?.limit ?? 4;
  const canPause = !["lobby", "closed", "victory", "defeat"].includes(phase);
  const canSkip = !["lobby", "closed", "victory"].includes(phase);
  const primary: { label: string; command: Command } | null =
    phase === "lobby" && room?.open ? { label: "Начать уровень", command: "start" }
      : phase === "task-complete" ? { label: "Перейти к вопросу", command: "next" }
        : phase === "quiz" ? { label: "Раскрыть ответ", command: "reveal" }
          : phase === "quiz-reveal" ? { label: "Начать бой", command: "next" }
            : phase === "defeat" ? { label: "Ещё попытка", command: "retry" } : null;
  const roomEditable = ["lobby", "closed"].includes(phase);
  const joinDisabled = busy || !nickname.trim() || (hostMode ? !hostPassword : password.length < 6 || publicStatus?.open === false);

  return <div className={styles.shell}>
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>chepuha<span>.fun</span><span className={styles.brandDivider}>/</span><span className={styles.brandSection}>аркада</span></Link>
      <span className={`${styles.localBadge} ${session && !online ? styles.connectionPending : ""}`}><i />{session ? online ? `В комнате · ${count}/${limit}` : network === "reconnecting" ? "Восстанавливаем связь" : "Подключаемся" : "Совместная репетиция · 4 игрока"}</span>
    </header>
    <main className={styles.main}>
      <div className={styles.intro}><div><p className={styles.eyebrow}>Первый уровень / 01</p><h1>Документы<span>↗</span></h1></div><p>Оформите документ.<br />Разберитесь с дизайнером.</p></div>
      <div className={styles.layout}>
        <section className={styles.gameColumn} aria-label="Игровое поле">
          <div className={styles.gameFrame}>
            <div className={styles.gameTop}>
              <div className={styles.stages}>{["Документ", "Вопрос", "Босс"].map((name, index) => <span key={name} className={index === phaseIndex ? styles.activeStage : index < phaseIndex ? styles.doneStage : ""}><i>{index < phaseIndex ? "✓" : `0${index + 1}`}</i>{name}</span>)}</div>
              <span className={styles.playerHud}><PixelMark color={session?.color ?? color} /><span>{session?.nickname ?? "Твой герой"}</span>{combatScene && local && <span className={styles.hearts} aria-label={`Здоровье: ${local.player.hp} из ${local.player.maxHp}`}>{Array.from({ length: local.player.maxHp }, (_, index) => <span key={index} className={index >= local.player.hp ? styles.emptyHeart : ""}>♥</span>)}</span>}</span>
            </div>
            <div ref={stageRef} className={styles.stage} tabIndex={0}
              aria-label={`Игровое поле. Стрелки или A D — идти, пробел — прыгать, E — действие, F — стрелять.${isHost ? " Escape — пауза." : ""}`}
              onKeyDown={(event) => keyboard(event, true)} onKeyUp={(event) => keyboard(event, false)} onBlur={clearInput}
              onClick={(event) => { if (!(event.target instanceof HTMLElement && event.target.closest("button, input"))) stageRef.current?.focus(); }}
            >
              {taskScene && <DocumentScene view={{ phase, paused: paused || !online, taskStep: local?.taskStep ?? 0, near: state && session ? getRoomInteractable(state, session.playerId) : null }} onInteract={station} exit={{ rect: TASK_EXIT, exited: localMember?.taskExited ?? false }} />}
              {quizScene && state && session && <RoomQuiz state={state} playerId={session.playerId} />}
              {combatScene && state && <RoomBoss state={state} />}
              <canvas ref={canvasRef} width={WORLD.width} height={WORLD.height} className={styles.canvas} aria-hidden="true" />

              {!session && <div className={styles.overlay}><form className={`${styles.startCard} ${styles.roomCard}`} onSubmit={join}>
                <span className={styles.cardEyebrow}>{hostMode ? "Комната ведущей" : "Документы → вопрос → босс"}</span>
                <h2>{booting ? "Проверяем вход…" : restoreUnavailable ? "Нет связи с комнатой" : hostMode ? "Вход для ведущей" : "Приключение на четверых"}</h2>
                <p>{hostMode ? "Пароль участников задашь после входа." : publicStatus?.open === false ? "Комната пока закрыта. Дождись ведущей." : "Оформите документ и победите Серёгу."}</p>
                <div className={styles.joinFields}>
                  <div><label htmlFor="arcade-room-nickname">Твой ник</label><input id="arcade-room-nickname" value={nickname} maxLength={18} onChange={(event) => setNickname(event.target.value)} autoComplete="nickname" required disabled={busy || booting} /></div>
                  <div><label htmlFor="arcade-room-password">{hostMode ? "Пароль ведущей" : "Пароль комнаты"}</label><input id="arcade-room-password" type="password" value={hostMode ? hostPassword : password} minLength={hostMode ? undefined : 6} maxLength={128} onChange={(event) => hostMode ? setHostPassword(event.target.value) : setPassword(event.target.value)} autoComplete={hostMode ? "current-password" : "off"} required disabled={busy || booting} /></div>
                </div>
                <div className={styles.colorPicker}><span>Цвет героя</span><div>{HERO_COLORS.map(({ value, name }) => <button key={value} type="button" aria-label={`Цвет героя ${name}`} aria-pressed={color === value} disabled={busy} className={color === value ? styles.colorSelected : ""} onClick={() => setColor(value)}><PixelMark color={value} /></button>)}</div></div>
                {error && <p className={styles.formError} role="alert">{error}</p>}
                {restoreUnavailable ? <button type="button" className={styles.primary} disabled={booting} onClick={() => { setBooting(true); setError(""); setRestoreAttempt((attempt) => attempt + 1); }}>Повторить подключение <span>↻</span></button> : <button type="submit" className={styles.primary} disabled={booting || joinDisabled}>{busy ? "Входим…" : hostMode ? "Войти как ведущая" : "Присоединиться"}<span>→</span></button>}
                <small>{hostMode ? "Игру запускаешь ты" : `${publicStatus?.count ?? 0}/${limit} участников · нужен компьютер с клавиатурой`}</small>
              </form></div>}

              {session && !online && <div className={styles.overlay}><div className={styles.messageCard}><span className={styles.cardEyebrow}>Связь с комнатой</span><h2>{network === "reconnecting" ? "Возвращаемся в игру" : "Подключаемся…"}</h2><p>{process.env.NEXT_PUBLIC_ARCADE_HOST ? "Управление вернётся после подключения. Твой герой сохранён." : "Сервер комнаты ещё не настроен."}</p>{error && <p className={styles.formError} role="alert">{error}</p>}</div></div>}

              {session && online && isHost && room?.open === false && <div className={styles.overlay}><form className={`${styles.startCard} ${styles.roomCard}`} onSubmit={(event) => { event.preventDefault(); roomAction("open"); }}><span className={styles.cardEyebrow}>Пульт ведущей</span><h2>Открой комнату</h2><p>Придумай пароль и передай участникам <a href="/arcade" target="_blank" rel="noopener noreferrer">ссылку для игроков ↗</a>.</p><label htmlFor="arcade-guest-password">Пароль для участников</label><input id="arcade-guest-password" type="password" minLength={6} maxLength={128} autoComplete="new-password" value={guestPassword} onChange={(event) => setGuestPassword(event.target.value)} required />{error && <p className={styles.formError} role="alert">{error}</p>}<button className={styles.primary} disabled={guestPassword.length < 6}>Открыть комнату <span>→</span></button><small>До 4 участников вместе с ведущей</small></form></div>}

              {session && online && !isHost && room?.open && phase === "lobby" && <div className={styles.lobbyBanner}><strong>Ты в команде!</strong><span>{count}/{limit} участников · ведущая скоро запустит уровень</span></div>}
              {session && online && paused && room?.open && <div className={styles.overlay}><div className={styles.messageCard}><span className={styles.cardEyebrow}>{room.hostOnline ? "Можно выдохнуть" : "Ждём ведущую"}</span><h2>Пауза</h2><p>{room.hostOnline ? "Игра замерла. Продолжим с того же места." : "Ведущая потеряла связь. Комната ждёт её возвращения."}</p>{isHost && <button className={styles.primary} onClick={() => command("resume")}>Продолжить →</button>}</div></div>}
              {online && phase === "victory" && <div className={styles.resultBanner}><span>✦</span><div><strong>Серёга повержен!</strong><p>Документ готов. Команда справилась.</p></div>{isHost && <button onClick={() => command("restart")}>Ещё раз ↗</button>}</div>}
              {online && phase === "defeat" && state && <div className={`${styles.resultBanner} ${styles.defeatBanner}`}><span>×</span><div><strong>Пиу-пиу оказалось сильнее</strong><p>В следующей попытке у босса будет {Math.max(10 * state.bossParticipantCount, Math.round(state.bossBaseHp * 0.75 ** state.attempt))} HP.</p></div>{isHost && <button onClick={() => command("retry")}>Ещё попытка ↗</button>}</div>}
              {online && phase === "boss" && local?.player.hp === 0 && <div className={styles.spectatorBanner} role="status">Твой герой отдыхает с глазами-крестиками. Болей за команду!</div>}
              {online && taskScene && localMember?.taskExited && <div className={styles.spectatorBanner} role="status">✓ Ты выполнил задание и вышел. Ждём остальных — в квизе вернёшься на карту.</div>}
              {toast && <div className={styles.toast} role="status">{toast}</div>}
            </div>
            <div className={styles.gameBottom}><span><kbd>A</kbd><kbd>D</kbd> идти</span><span><kbd>Space</kbd> прыгать</span><span><kbd>E</kbd> действие</span><span><kbd>F</kbd> пиу-пиу</span>{isHost && <span><kbd>Esc</kbd> пауза</span>}</div>
          </div>
          <p className={styles.underGame}>Кликни по игровому полю, чтобы вернуть управление. При уходе из вкладки твой герой остановится.</p>
        </section>

        <aside className={styles.hostPanel} aria-label={isHost ? "Управление мероприятием" : "Комната и участники"}>
          <div className={styles.hostHeader}><span className={styles.hostIcon}>{isHost ? "✳" : "✦"}</span><div><h2>{isHost ? "Пульт ведущей" : "Команда"}</h2><p>{isHost ? "Темп задаёшь ты" : "Проходим вместе"}</p></div></div>
          <div className={styles.phaseStatus}><span className={styles.panelLabel}>Сейчас</span><strong>{paused ? "Пауза" : PHASE_NAMES[phase]}</strong></div>
          <p className={styles.notice} role="status">{state?.notice || (publicStatus?.open ? "Войди по паролю, чтобы присоединиться." : "Ведущая ещё не открыла комнату.")}</p>
          {isHost && <>
            {primary && <button className={styles.primary} onClick={() => command(primary.command)} disabled={!online || paused}>{primary.label} →</button>}
            <div className={styles.hostActions}>
              <button onClick={() => command(paused ? "resume" : "pause")} disabled={!online || !canPause}><span>{paused ? "▷" : "Ⅱ"}</span>{paused ? "Продолжить" : "Пауза"}</button>
              <button onClick={() => command("skip")} disabled={!online || !canSkip || paused}><span>↪</span>Пропустить этап</button>
              {combatScene && phase !== "victory" && <button onClick={() => command("retry")} disabled={!online || paused}><span>↻</span>Повторить бой</button>}
              <button onClick={() => command("restart")} disabled={!online || phase === "lobby" || phase === "closed"}><span>↺</span>Начать заново</button>
              <button onClick={() => setSettings(!settings)} disabled={!online || !roomEditable || !room?.open}><span>⌘</span>Изменить пароль</button>
            </div>
            {settings && <form className={styles.roomSettings} onSubmit={(event) => { event.preventDefault(); roomAction("password"); }}><label htmlFor="arcade-new-password">Новый пароль участников</label><input id="arcade-new-password" type="password" minLength={6} maxLength={128} autoComplete="new-password" value={guestPassword} onChange={(event) => setGuestPassword(event.target.value)} required /><p>Участникам потребуется войти заново.</p><button className={styles.primary} disabled={!online || !roomEditable || guestPassword.length < 6}>Изменить пароль →</button></form>}
          </>}
          {session && error && <p className={styles.panelError} role="alert">{error}</p>}
          <div className={styles.participants}><span className={styles.panelLabel}>Участники <span>{session ? count : publicStatus?.count ?? 0}/{limit}</span></span>{members.map((member) => <div key={member.id} className={!member.connected ? styles.participantOffline : ""}><PixelMark color={member.color} /><strong>{member.nickname}{member.taskExited && <span className={styles.completedMark} aria-label="Задание выполнено, игрок вышел"> ✓</span>}</strong><span>{!member.connected ? "нет связи" : taskScene && member.taskExited ? "готово" : member.id === session?.playerId ? "ты" : member.id === state?.hostId ? "ведущая" : combatScene && member.player.hp === 0 ? "отдыхает" : "в игре"}</span></div>)}{!members.length && <p className={styles.emptyParticipants}>Здесь появится ваша команда</p>}</div>
          {isHost && <button className={styles.closeButton} onClick={() => roomAction("close")} disabled={!online || !room?.open}>Закрыть комнату <span>↗</span></button>}
        </aside>
      </div>
    </main>
  </div>;
}
