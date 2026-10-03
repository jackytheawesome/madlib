"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { commandGame, createGame, getInteractable, interact, stepGame } from "@/lib/arcade/engine";
import { drawGame } from "@/lib/arcade/render";
import { HERO_COLORS } from "@/lib/arcade/palette";
import { quizHealthMultiplier } from "@/lib/arcade/quiz-balance";
import { ANSWER_ZONES, EMPTY_INPUT, QUIZ, STATIONS, WORLD, type Command, type GameState, type Input, type Phase, type Rect } from "@/lib/arcade/types";
import styles from "./arcade.module.css";

const KEY_INPUTS: Record<string, keyof Input> = {
  ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
  Space: "jump", ArrowUp: "jump", KeyW: "jump", KeyE: "interact", KeyF: "shoot",
};
const PHASE_NAMES: Record<Phase, string> = {
  lobby: "До старта", task: "Задача", "task-complete": "Задача выполнена",
  quiz: "Выбираем ответ", "quiz-reveal": "Ответ раскрыт", boss: "Бой с дизайнером",
  defeat: "Новая попытка", victory: "Уровень пройден", closed: "Репетиция закрыта",
};

function viewOf(state: GameState) {
  return {
    phase: state.phase, paused: state.paused, nickname: state.nickname, color: state.color,
    taskStep: state.taskStep, quizChoice: state.quizChoice, quizCorrect: state.quizCorrect,
    attempt: state.attempt, hp: state.player.hp, maxHp: state.player.maxHp,
    bossHp: state.boss.hp, bossMaxHp: state.boss.maxHp, notice: state.notice,
    near: getInteractable(state),
  };
}
type View = ReturnType<typeof viewOf>;

export function position(rect: Rect): CSSProperties {
  return {
    left: `${rect.x / WORLD.width * 100}%`, top: `${rect.y / WORLD.height * 100}%`,
    width: `${rect.width / WORLD.width * 100}%`, height: `${rect.height / WORLD.height * 100}%`,
  };
}

export function PixelMark({ color = "currentColor" }: { color?: string }) {
  return <svg width="24" height="28" viewBox="0 0 24 28" fill={color} aria-hidden="true"><path d="M6 0h12v3h3v9h-3v3h3v9h-6v4H9v-4H3v-9h3v-3H3V3h3z" /><path d="M8 6h3v3H8zm7 0h3v3h-3z" fill="#172238" /></svg>;
}

export function DocumentScene({ view, onInteract, exit }: { view: Pick<View, "taskStep" | "near" | "phase" | "paused">; onInteract: (station: number) => void; exit?: { rect: Rect; exited: boolean } }) {
  const heading = view.taskStep >= 1;
  const saved = view.taskStep >= 2;
  return <div className={styles.documentScene}>
    <div className={styles.appBar}>
      <span className={styles.documentIcon}>Д</span><strong>Документы</strong>
      <span className={styles.breadcrumb}>Рабочее пространство <span>/</span> План Q4</span>
      <span className={styles.editorStatus}>{saved ? "✓ Все изменения сохранены" : "Есть несохранённые изменения"}</span>
    </div>
    <div className={styles.library} style={position({ x: 34, y: 132, width: 260, height: 388 })}>
      <span className={styles.sectionEyebrow}>Мои документы</span>
      <div className={styles.libraryActive}><span>▤</span> План Q4 <span>↗</span></div>
      <div className={styles.libraryItem}>▤ Заметки встречи</div>
      <div className={styles.libraryItem}>▤ Идеи команды</div>
      <div className={styles.libraryDivider} />
      <span className={styles.sectionEyebrow}>{exit ? "Твоя задача" : "Задача команды"}</span>
      <p className={styles.libraryTask}>Оформить заголовок.<br />Сохранить документ.</p>
      <div className={`${styles.taskCheck} ${heading ? styles.checked : ""}`}><span>{heading ? "✓" : "1"}</span> Стиль «Заголовок»</div>
      <div className={`${styles.taskCheck} ${saved ? styles.checked : ""}`}><span>{saved ? "✓" : "2"}</span> Сохранение</div>
    </div>
    <div className={styles.paper} style={position({ x: 318, y: 146, width: 598, height: 410 })}>
      <div className={styles.paperTop}><span>План Q4</span><span>•••</span></div>
      <div className={styles.paperToolbar}><span>Стиль текста</span><span>Б</span><span>К</span><span>≡</span><span>↗</span></div>
      <div className={styles.paperBody}>
        <span className={styles.selectionHint}>{heading ? "Заголовок 1" : "Выделенная строка"}</span>
        <p className={`${styles.documentTitle} ${heading ? styles.formattedTitle : ""}`}>План на четвёртый квартал</p>
        <p>Собираем идеи, делимся результатами<br />и придумываем, что сделать дальше.</p>
        <div className={styles.textLine} /><div className={styles.textLineShort} />
        <p className={styles.documentNote}>Хороший план начинается<br />с хорошего заголовка.</p>
      </div>
    </div>
    <button
      className={`${styles.station} ${styles.headingStation} ${view.near === 0 ? styles.stationNear : ""} ${heading ? styles.stationDone : ""}`}
      style={position(STATIONS[0])} onClick={() => onInteract(0)} disabled={view.phase !== "task" || heading || view.paused}
      aria-label="Применить стиль Заголовок, когда герой рядом"
    ><span className={styles.stationIcon}>H1</span><span>{heading ? "Применён" : "Заголовок"}</span><span className={styles.stationKey}>{heading ? "✓" : "E"}</span></button>
    <div className={styles.savePanel} style={position({ x: 934, y: 172, width: 216, height: 148 })}>
      <strong>{saved ? "Документ готов" : "Последний штрих"}</strong>
      <p>{saved ? exit ? "Спустись к выходу" : "Можно идти к вопросу" : "Сохрани изменения"}</p>
    </div>
    <button
      className={`${styles.station} ${styles.saveStation} ${view.near === 1 ? styles.stationNear : ""} ${saved ? styles.stationDone : ""}`}
      style={position(STATIONS[1])} onClick={() => onInteract(1)} disabled={view.phase !== "task" || !heading || saved || view.paused}
      aria-label="Сохранить документ, когда герой рядом"
    ><span>{saved ? "Сохранено" : "Сохранить"}</span><span className={styles.stationKey}>{saved ? "✓" : "E"}</span></button>
    {exit && <button
      className={`${styles.taskExit} ${saved ? styles.exitUnlocked : ""} ${view.near === 2 ? styles.exitNear : ""}`}
      style={position(exit.rect)} onClick={() => onInteract(2)}
      disabled={view.phase !== "task" || view.paused || !saved || exit.exited}
      aria-label={saved ? "Выйти после выполнения задания, когда герой рядом" : "Выход закрыт: оформи заголовок и сохрани документ"}
      title={saved ? "Подойди и нажми E" : "Сначала выполни обе задачи"}
    ><span className={styles.exitSign}>Выход</span><span className={styles.exitDoor} aria-hidden="true">{saved ? "↗" : "×"}</span><span className={styles.exitKey}>{saved ? "E" : "закрыт"}</span></button>}
    <div className={styles.mapCaption} style={position({ x: 365, y: 574, width: 510, height: 28 })}>{exit ? saved ? "Задание готово — спустись к выходу справа и нажми E" : "Оформи заголовок и сохрани документ, затем выйди справа" : "Прыгай по платформам к подсвеченной кнопке"}</div>
  </div>;
}

function QuizScene({ view }: { view: View }) {
  const revealed = view.phase === "quiz-reveal";
  return <div className={styles.quizScene}>
    <div className={styles.quizHeading}>
      <span className={styles.sceneEyebrow}>Один вопрос перед боем</span>
      <h2>{QUIZ.question}</h2>
      <p>{revealed ? QUIZ.explanation : "Встань на площадку с ответом. Менять выбор можно до раскрытия."}</p>
    </div>
    {QUIZ.options.map((option, index) => <div
      key={option}
      className={`${styles.answerCard} ${view.quizChoice === index ? styles.answerSelected : ""} ${revealed && index === QUIZ.correct ? styles.answerCorrect : ""} ${revealed && view.quizChoice === index && index !== QUIZ.correct ? styles.answerWrong : ""}`}
      style={position({ x: ANSWER_ZONES[index].x, y: 390, width: ANSWER_ZONES[index].width, height: 128 })}
    ><span className={styles.answerLetter}>{String.fromCharCode(65 + index)}</span><strong>{option}</strong><span className={styles.answerLabel}>{revealed && index === QUIZ.correct ? "✓ Правильный ответ" : view.quizChoice === index ? "Твой выбор" : "Встань сюда"}</span></div>)}
    <div className={styles.quizResult} style={position({ x: 320, y: 267, width: 560, height: 82 })}>
      {revealed ? <><strong>{view.quizCorrect ? "Верно! −30% здоровья босса" : "+30% здоровья босса"}</strong><span>{view.quizCorrect ? "Серёга начнёт бой с 34 HP вместо 48" : `${view.quizChoice === null ? "Без ответа — тоже ошибка." : "В этот раз мимо."} Серёга начнёт бой с 62 HP вместо 48.`}</span></> : <><strong>{view.quizChoice === null ? "Выбери площадку" : `Выбран вариант ${String.fromCharCode(65 + view.quizChoice)}`}</strong><span>Верный ответ ослабит босса, ошибка усилит</span></>}
    </div>
  </div>;
}

function BossScene({ view }: { view: View }) {
  return <div className={styles.bossScene}>
    <div className={styles.arenaGrid} />
    <div className={styles.arenaTitle}><span className={styles.sceneEyebrow}>Босс уровня</span><h2>Серёга</h2><p>Дизайнер Документов</p></div>
    <div className={styles.bossHealth}><div><span>Здоровье босса</span><strong>{view.bossHp} / {view.bossMaxHp}</strong></div><div className={styles.healthTrack}><span style={{ width: `${view.bossHp / view.bossMaxHp * 100}%` }} /></div><small>Попытка {view.attempt}{view.quizCorrect ? " · бонус за квиз" : ""}</small></div>
    <div className={styles.arenaDecoration} style={position({ x: 47, y: 362, width: 98, height: 152 })}><span>H1</span><span>H2</span><span>¶</span></div>
    <div className={styles.arenaHint} style={position({ x: 414, y: 559, width: 440, height: 30 })}>Удерживай F · прыгай через оранжевые снаряды</div>
  </div>;
}

export default function ArcadeDemo() {
  const gameRef = useRef(createGame("Люда", HERO_COLORS[0].value));
  const inputRef = useRef<Input>({ ...EMPTY_INPUT });
  const heldKeys = useRef(new Set<string>());
  const pendingPresses = useRef(new Set<keyof Input>());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(() => viewOf(createGame("Люда", HERO_COLORS[0].value)));
  const [nickname, setNickname] = useState("Люда");
  const [color, setColor] = useState(HERO_COLORS[0].value);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let previous = performance.now();
    let published = 0;
    let animation = 0;
    const frame = (now: number) => {
      const state = gameRef.current;
      const frameInput = { ...inputRef.current };
      // A quick tap must survive until the next frame, even after its keyup.
      for (const key of pendingPresses.current) frameInput[key] = true;
      stepGame(state, frameInput, Math.min((now - previous) / 1000, 0.05));
      pendingPresses.current.clear();
      previous = now;
      drawGame(ctx, state, { reducedMotion: media.matches });
      if (now - published > 80) {
        setView(viewOf(state));
        published = now;
      }
      animation = requestAnimationFrame(frame);
    };
    animation = requestAnimationFrame(frame);
    const loseFocus = () => {
      heldKeys.current.clear();
      pendingPresses.current.clear();
      inputRef.current = { ...EMPTY_INPUT };
      if (!["lobby", "closed", "victory", "defeat"].includes(gameRef.current.phase)) {
        commandGame(gameRef.current, "pause");
        setView(viewOf(gameRef.current));
      }
    };
    const hidden = () => { if (document.hidden) loseFocus(); };
    window.addEventListener("blur", loseFocus);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      cancelAnimationFrame(animation);
      window.removeEventListener("blur", loseFocus);
      document.removeEventListener("visibilitychange", hidden);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  function announce(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }

  function send(command: Command) {
    heldKeys.current.clear();
    pendingPresses.current.clear();
    inputRef.current = { ...EMPTY_INPUT };
    if (command === "start") {
      gameRef.current.nickname = nickname.trim().slice(0, 18) || "Игрок";
      gameRef.current.color = color;
    }
    commandGame(gameRef.current, command);
    setView(viewOf(gameRef.current));
    if (!["close", "restart", "pause"].includes(command)) requestAnimationFrame(() => stageRef.current?.focus());
  }

  function useStation(station: number) {
    if (getInteractable(gameRef.current) !== station) {
      announce("Подойди героем к кнопке по платформам — появится подсказка E.");
    } else {
      interact(gameRef.current);
      setView(viewOf(gameRef.current));
    }
    stageRef.current?.focus();
  }

  function keyboard(event: KeyboardEvent<HTMLDivElement>, pressed: boolean) {
    if (pressed && event.target instanceof HTMLElement && event.target.closest("button, input, textarea, a, select")) return;
    if (event.code === "Escape" && pressed && !event.repeat) {
      event.preventDefault();
      if (!["lobby", "closed", "victory", "defeat"].includes(gameRef.current.phase)) send(gameRef.current.paused ? "resume" : "pause");
      return;
    }
    const key = KEY_INPUTS[event.code];
    if (!key) return;
    event.preventDefault();
    if (pressed && !event.repeat && !inputRef.current[key]) pendingPresses.current.add(key);
    if (pressed) heldKeys.current.add(event.code);
    else heldKeys.current.delete(event.code);
    inputRef.current[key] = [...heldKeys.current].some((code) => KEY_INPUTS[code] === key);
  }

  const taskScene = ["lobby", "task", "task-complete", "closed"].includes(view.phase);
  const quizScene = ["quiz", "quiz-reveal"].includes(view.phase);
  const combatScene = ["boss", "defeat", "victory"].includes(view.phase);
  const phaseIndex = taskScene ? 0 : quizScene ? 1 : 2;
  const canPause = !["lobby", "closed", "victory", "defeat"].includes(view.phase);
  const canSkip = !["lobby", "closed", "victory"].includes(view.phase);
  const primary: { label: string; command: Command } | null =
    view.phase === "task-complete" ? { label: "Перейти к вопросу", command: "next" }
      : view.phase === "quiz" ? { label: "Раскрыть ответ", command: "reveal" }
        : view.phase === "quiz-reveal" ? { label: "Начать бой", command: "next" }
          : view.phase === "defeat" ? { label: "Ещё попытка", command: "retry" } : null;

  return <div className={styles.shell}>
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>chepuha<span>.fun</span><span className={styles.brandDivider}>/</span><span className={styles.brandSection}>аркада</span></Link>
      <span className={styles.localBadge}><i />Локальная репетиция · 1 игрок</span>
    </header>
    <main className={styles.main}>
      <div className={styles.intro}><div><p className={styles.eyebrow}>Первый уровень / 01</p><h1>Документы<span>↗</span></h1></div><p>Оформи документ.<br />Разберись с дизайнером.</p></div>
      <div className={styles.layout}>
        <section className={styles.gameColumn} aria-label="Игровое поле">
          <div className={styles.gameFrame}>
            <div className={styles.gameTop}>
              <div className={styles.stages}>{["Документ", "Вопрос", "Босс"].map((name, index) => <span key={name} className={index === phaseIndex ? styles.activeStage : index < phaseIndex ? styles.doneStage : ""}><i>{index < phaseIndex ? "✓" : `0${index + 1}`}</i>{name}</span>)}</div>
              <span className={styles.playerHud}><PixelMark color={view.color} /><span>{view.nickname}</span>{combatScene && <span className={styles.hearts} aria-label={`Здоровье: ${view.hp} из ${view.maxHp}`}>{Array.from({ length: 3 }, (_, i) => <span key={i} className={i >= view.hp ? styles.emptyHeart : ""}>♥</span>)}</span>}</span>
            </div>
            <div
              ref={stageRef} className={styles.stage} tabIndex={0} aria-label="Игровое поле. Стрелки или A D — идти, пробел — прыгать, E — действие, F — стрелять. Escape — пауза."
              onKeyDown={(event) => keyboard(event, true)} onKeyUp={(event) => keyboard(event, false)}
              onBlur={() => { heldKeys.current.clear(); pendingPresses.current.clear(); inputRef.current = { ...EMPTY_INPUT }; }}
              onClick={(event) => { if (!(event.target instanceof HTMLElement && event.target.closest("button, input"))) stageRef.current?.focus(); }}
            >
              {taskScene && <DocumentScene view={view} onInteract={useStation} />}
              {quizScene && <QuizScene view={view} />}
              {combatScene && <BossScene view={view} />}
              <canvas ref={canvasRef} width={WORLD.width} height={WORLD.height} className={styles.canvas} aria-hidden="true" />
              {view.phase === "lobby" && <div className={styles.overlay}><form className={styles.startCard} onSubmit={(event) => { event.preventDefault(); send("start"); }}>
                <span className={styles.cardEyebrow}>Документы → вопрос → босс</span><h2>Готова к маленькому<br />приключению?</h2><p>Прыгай по интерфейсу, выполни задачу<br />и победи пиксельного Серёгу.</p>
                <label htmlFor="arcade-nickname">Твой ник</label><input id="arcade-nickname" value={nickname} maxLength={18} onChange={(event) => setNickname(event.target.value)} autoComplete="off" />
                <div className={styles.colorPicker}><span>Цвет героя</span><div>{HERO_COLORS.map(({ value, name }) => <button key={value} type="button" aria-label={`Цвет героя ${name}`} aria-pressed={color === value} className={color === value ? styles.colorSelected : ""} onClick={() => setColor(value)}><PixelMark color={value} /></button>)}</div></div>
                <button type="submit" className={styles.primary}>Начать уровень <span>→</span></button><small>Здесь ты и игрок, и ведущая</small>
              </form></div>}
              {view.paused && <div className={styles.overlay}><div className={styles.messageCard}><span className={styles.cardEyebrow}>Можно выдохнуть</span><h2>Пауза</h2><p>Игра замерла. Продолжим с того же места.</p><button className={styles.primary} onClick={() => send("resume")}>Продолжить →</button></div></div>}
              {view.phase === "closed" && <div className={styles.overlay}><div className={styles.messageCard}><span className={styles.cardEyebrow}>До следующего раза</span><h2>Репетиция закрыта</h2><p>Можно открыть её заново<br />и попробовать другой маршрут.</p><button className={styles.primary} onClick={() => send("restart")}>Открыть заново →</button></div></div>}
              {view.phase === "victory" && <div className={styles.resultBanner}><span>✦</span><div><strong>Серёга повержен!</strong><p>Документ готов. Можно праздновать.</p></div><button onClick={() => send("restart")}>Ещё раз ↗</button></div>}
              {view.phase === "defeat" && <div className={`${styles.resultBanner} ${styles.defeatBanner}`}><span>×</span><div><strong>Пиу-пиу оказалось сильнее</strong><p>В следующей попытке у босса будет {Math.max(10, Math.round(Math.round(48 * quizHealthMultiplier(view.quizCorrect ? 1 : 0, 1)) * 0.75 ** view.attempt))} HP.</p></div><button onClick={() => send("retry")}>Ещё попытка ↗</button></div>}
              {toast && <div className={styles.toast} role="status">{toast}</div>}
            </div>
            <div className={styles.gameBottom}><span><kbd>A</kbd><kbd>D</kbd> идти</span><span><kbd>Space</kbd> прыгать</span><span><kbd>E</kbd> действие</span><span><kbd>F</kbd> пиу-пиу</span><span><kbd>Esc</kbd> пауза</span></div>
          </div>
          <p className={styles.underGame}>Кликни по игровому полю, чтобы вернуть управление. При уходе из вкладки игра встанет на паузу.</p>
        </section>
        <aside className={styles.hostPanel} aria-label="Управление мероприятием">
          <div className={styles.hostHeader}><span className={styles.hostIcon}>✳</span><div><h2>Пульт ведущей</h2><p>Темп задаёшь ты</p></div></div>
          <div className={styles.phaseStatus}><span className={styles.panelLabel}>Сейчас</span><strong>{view.paused ? "Пауза" : PHASE_NAMES[view.phase]}</strong></div>
          <p className={styles.notice} role="status">{view.notice}</p>
          {primary && <button className={styles.primary} onClick={() => send(primary.command)} disabled={view.paused}>{primary.label} →</button>}
          <div className={styles.hostActions}>
            <button onClick={() => send(view.paused ? "resume" : "pause")} disabled={!canPause}><span>{view.paused ? "▷" : "Ⅱ"}</span>{view.paused ? "Продолжить" : "Пауза"}</button>
            <button onClick={() => send("skip")} disabled={!canSkip || view.paused}><span>↪</span>Пропустить этап</button>
            {combatScene && view.phase !== "victory" && <button onClick={() => send("retry")} disabled={view.paused}><span>↻</span>Повторить бой</button>}
            <button onClick={() => send("restart")} disabled={view.phase === "lobby" || view.phase === "closed"}><span>↺</span>Начать заново</button>
          </div>
          <div className={styles.participants}><span className={styles.panelLabel}>Участники <span>1</span></span><div><PixelMark color={view.color} /><strong>{view.nickname}</strong><span>ты</span></div></div>
          <button className={styles.closeButton} onClick={() => send("close")} disabled={view.phase === "closed"}>Закрыть репетицию <span>↗</span></button>
        </aside>
      </div>
    </main>
  </div>;
}
