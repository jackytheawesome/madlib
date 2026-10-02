export const WORLD = { width: 1200, height: 675 } as const;

export type Phase =
  | "lobby"
  | "task"
  | "task-complete"
  | "quiz"
  | "quiz-reveal"
  | "boss"
  | "defeat"
  | "victory"
  | "closed";

export type Rect = { x: number; y: number; width: number; height: number };
export type Platform = Rect & { id: string };
export type Player = Rect & {
  vx: number;
  vy: number;
  facing: -1 | 1;
  grounded: boolean;
  hp: number;
  maxHp: number;
  hurtUntil: number;
};
export type Projectile = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  owner: "player" | "boss";
  life: number;
};
export type Boss = Rect & {
  hp: number;
  maxHp: number;
  nextAttack: number;
  hurtUntil: number;
};
export type GameState = {
  phase: Phase;
  paused: boolean;
  time: number;
  phaseTime: number;
  nickname: string;
  color: string;
  player: Player;
  taskStep: number;
  quizChoice: number | null;
  quizCorrect: boolean | null;
  attempt: number;
  boss: Boss;
  projectiles: Projectile[];
  lastShot: number;
  nextProjectileId: number;
  previousInput: Input;
  notice: string;
};
export type Input = {
  left: boolean;
  right: boolean;
  jump: boolean;
  interact: boolean;
  shoot: boolean;
};
export const EMPTY_INPUT: Input = {
  left: false,
  right: false,
  jump: false,
  interact: false,
  shoot: false,
};
export type Command = "start" | "next" | "reveal" | "retry" | "skip" | "pause" | "resume" | "restart" | "close";

export const TASK_PLATFORMS: Platform[] = [
  { id: "floor", x: 0, y: 610, width: 1200, height: 24 },
  { id: "library", x: 70, y: 520, width: 224, height: 16 },
  { id: "paragraph", x: 330, y: 440, width: 206, height: 16 },
  { id: "heading", x: 352, y: 284, width: 234, height: 16 },
  { id: "text", x: 570, y: 362, width: 258, height: 16 },
  { id: "save", x: 934, y: 320, width: 216, height: 16 },
];
export const BOSS_PLATFORMS: Platform[] = [
  { id: "floor", x: 0, y: 610, width: 1200, height: 24 },
  { id: "left", x: 210, y: 508, width: 230, height: 16 },
  { id: "middle", x: 490, y: 420, width: 220, height: 16 },
  { id: "right", x: 770, y: 508, width: 230, height: 16 },
];
export const QUIZ_PLATFORMS: Platform[] = [TASK_PLATFORMS[0]];
export const STATIONS = [
  { id: "heading", x: 418, y: 216, width: 164, height: 68, label: "Заголовок" },
  { id: "save", x: 968, y: 244, width: 154, height: 76, label: "Сохранить" },
] as const;
export const QUIZ = {
  question: "Как сделать заголовок, который появится в оглавлении?",
  options: ["Увеличить шрифт", "Выбрать стиль «Заголовок»", "Сделать текст жирным", "Написать КАПСОМ"],
  correct: 1,
  explanation: "Стиль задаёт структуру документа. Размер, жирность и КАПС меняют только внешний вид.",
} as const;
export const ANSWER_ZONES: Rect[] = QUIZ.options.map((_, index) => ({
  x: 40 + index * 290, y: 548, width: 250, height: 62,
}));
