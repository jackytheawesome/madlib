/** Типы контента и игровой комнаты — «Чепуха» */

export type TextKind = "monologue" | "dialogue" | "story";

export type GenreId =
  | "horror"
  | "romance"
  | "everyday"
  | "adventure"
  | "fairy";

export type BlankHint = {
  /** Часть речи и грамматика для игрока, напр. «существительное, им. п., ед. ч.» */
  prompt: string;
  /** Короткий пример, необязательно */
  example?: string;
};

export type TextBlank = {
  id: string;
  hint: BlankHint;
};

/** Фрагмент текста: обычная строка или слот {{blankId}} */
export type TextSegment =
  | { type: "text"; value: string }
  | { type: "blank"; blankId: string };

export type DialogueLine = {
  id: string;
  /** Индекс роли 0..playerCount-1 */
  speakerRole: number;
  /** К кому обращается (индекс роли), если важно для подсказки */
  addressRole?: number;
  segments: TextSegment[];
};

export type TemplateBase = {
  id: string;
  title: string;
  kind: TextKind;
  genre: GenreId;
  /** Для диалогов — ровно столько игроков нужно в комнате */
  playerCount: number | null;
  blanks: TextBlank[];
};

export type MonologueTemplate = TemplateBase & {
  kind: "monologue" | "story";
  playerCount: null;
  segments: TextSegment[];
};

export type DialogueTemplate = TemplateBase & {
  kind: "dialogue";
  playerCount: 2 | 3 | 4;
  /** Имена ролей для подсказок («Катя», «Официант») — не ники игроков */
  roles: string[];
  lines: DialogueLine[];
};

export type Template = MonologueTemplate | DialogueTemplate;

export type GenreMeta = {
  id: GenreId;
  label: string;
};

export const GENRES: GenreMeta[] = [
  { id: "horror", label: "Страшилка" },
  { id: "romance", label: "Романтика" },
  { id: "everyday", label: "Бытовуха" },
  { id: "adventure", label: "Приключение" },
  { id: "fairy", label: "Сказка" },
];

export const KIND_LABELS: Record<TextKind, string> = {
  monologue: "Монолог",
  dialogue: "Диалог",
  story: "Рассказ",
};

export const MAX_PLAYERS = 4;

export type RoomPhase =
  | "lobby"
  | "picking"
  | "filling"
  | "reveal"
  | "reading";

export type Player = {
  id: string;
  nickname: string;
  isHost: boolean;
};
