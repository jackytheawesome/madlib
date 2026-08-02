/**
 * Генератор демо-текстов «Чепуха».
 * Запуск: node scripts/generate-templates.mjs
 */
import { writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "content", "templates");

const GENRES = ["horror", "romance", "everyday", "adventure", "fairy"];
const KINDS = ["story", "monologue", "dialogue"];
const SIZES = ["small", "small", "medium", "medium", "long"]; // 5 слотов на комбо
const DIALOGUE_PLAYERS = [2, 2, 3, 3, 4];

const HINTS = [
  { prompt: "существительное, именительный падеж, единственное число", example: "утюг" },
  { prompt: "существительное, винительный падеж", example: "кабачок" },
  { prompt: "существительное, творительный падеж", example: "вареньем" },
  { prompt: "существительное, родительный падеж, множественное число", example: "носков" },
  { prompt: "прилагательное, именительный падеж", example: "липкий" },
  { prompt: "прилагательное, творительный падеж", example: "бархатным" },
  { prompt: "глагол, прошедшее время", example: "зашипел" },
  { prompt: "глагол, инфинитив", example: "танцевать" },
  { prompt: "наречие", example: "внезапно" },
  { prompt: "междометие или возглас", example: "ой" },
  { prompt: "имя собственное", example: "Вася" },
  { prompt: "профессия или род занятий", example: "бариста" },
  { prompt: "место, предложный падеж", example: "в подвале" },
  { prompt: "часть тела, именительный падеж", example: "локоть" },
  { prompt: "звук или шум", example: "бульк" },
  { prompt: "чувство или эмоция", example: "тоска" },
];

const TITLES = {
  story: {
    horror: ["Кто звонит в дверь", "Шёпот в лифте", "Последний автобус", "Зеркало в коридоре", "Гость без лица"],
    romance: ["Письмо на рассвете", "Случай в парке", "Билет на двоих", "Дождь и обещание", "Секрет на кухне"],
    everyday: ["Утро понедельника", "Очередь в поликлинике", "Соседи сверху", "Сломанный принтер", "Поход в магазин"],
    adventure: ["Карта на чердаке", "Поезд в никуда", "Пещера обещаний", "Шторм на переправе", "Ключ от маяка"],
    fairy: ["Говорящий котёл", "Лес без тропинок", "Корона из хлеба", "Три желания подряд", "Дворец из тумана"],
  },
  monologue: {
    horror: ["Исповедь сторожа", "Голос из розетки", "Запись на диктофон", "Письмо из больницы", "Монолог маньяка-любителя"],
    romance: ["Признание у окна", "Сообщение, которое не отправил", "Тост на свадьбе", "Голос из наушников", "Письмо бывшей"],
    everyday: ["Письмо начальнику", "Жалоба в ТСЖ", "Голос голосового помощника", "Отзыв на маркетплейсе", "Речь на планёрке"],
    adventure: ["Доклад исследователя", "Запись капитана", "Инструктаж перед прыжком", "Дневник кладоискателя", "Рация на горе"],
    fairy: ["Речь короля лягушек", "Монолог феи быта", "Жалоба дракона", "Исповедь заколдованного принца", "Тост лесного духа"],
  },
  dialogue: {
    horror: ["Лифт застрял", "Ночной звонок", "Экскурсия в музей", "Соседи за стеной", "Камера наблюдения"],
    romance: ["Свидание в кафе", "Переписка в такси", "Репетиция танца", "Разговор под зонтом", "Кухня вдвоём"],
    everyday: ["У кассы", "Созвон с поддержкой", "Родители на связи", "Офисный перекур", "Спор из-за пульта"],
    adventure: ["Лагерь у костра", "Спуск в шахту", "Переправа", "Поиск компаса", "Перед прыжком"],
    fairy: ["Торг с джинном", "Совет фей", "Допрос дракона", "Разговор с зеркалом", "Пир гоблинов"],
  },
};

const ROLES = {
  2: [
    ["Алекс", "Мила"],
    ["Кира", "Олег"],
    ["Хост", "Гость"],
    ["Слева", "Справа"],
  ],
  3: [
    ["Анна", "Боря", "Вика"],
    ["Гид", "Турист", "Охранник"],
    ["Мама", "Папа", "Ребёнок"],
    ["Капитан", "Штурман", "Юнга"],
  ],
  4: [
    ["Аня", "Боря", "Вика", "Гена"],
    ["Король", "Шут", "Рыцарь", "Дракон"],
    ["Водитель", "Навигатор", "Пассажир", "Призрак"],
    ["Шеф", "Су-шеф", "Официант", "Клиент"],
  ],
};

function blanks(n, seed) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const h = HINTS[(seed + i * 3) % HINTS.length];
    out.push({ id: `b${i + 1}`, hint: { ...h } });
  }
  return out;
}

function blankCount(size) {
  if (size === "small") return 5;
  if (size === "medium") return 9;
  return 14;
}

function segs(parts) {
  /** parts: string | {b:id} */
  return parts.map((p) =>
    typeof p === "string" ? { type: "text", value: p } : { type: "blank", blankId: p.b },
  );
}

function B(i) {
  return { b: `b${i}` };
}

/** Тексты-заготовки: функции (size) => segments или lines */
function storyBody(genre, idx, size, n) {
  const hooks = {
    horror: [
      ["Ночью я услышал ", B(1), ". За дверью стоял ", B(2), " с ", B(3), " улыбкой. Я ", B(4), " и крикнул «", B(5), "!»"],
      ["В лифте погас свет. Кто-то шепнул ", B(1), ". Я потрогал ", B(2), " и понял: это был ", B(3), ". Двери открылись в ", B(4), ", пахло ", B(5), "."],
    ],
    romance: [
      ["Утром я нашёл записку: «Встретимся у ", B(1), "». Там ждал ", B(2), " с букетом из ", B(3), ". Мы ", B(4), " под ", B(5), "."],
      ["В парке шёл дождь и ", B(1), ". Я протянул ", B(2), " и сказал про ", B(3), ". Ответ был ", B(4), ", как ", B(5), "."],
    ],
    everyday: [
      ["Будильник орал как ", B(1), ". Я надел ", B(2), " и споткнулся о ", B(3), ". В метро кто-то ", B(4), " с криком «", B(5), "!»"],
      ["В очереди стоял ", B(1), ". Он обсуждал ", B(2), " и ел ", B(3), ". Кассир ", B(4), " и выдал ", B(5), "."],
    ],
    adventure: [
      ["На карте было пятно в форме ", B(1), ". Мы взяли ", B(2), " и пошли к ", B(3), ". Там нас ждал ", B(4), ", который ", B(5), "."],
      ["Шторм бил в борт. Капитан крикнул: «Держите ", B(1), "!» Юнга нёс ", B(2), ", а штурман ", B(3), ". Горизонт стал ", B(4), ", как ", B(5), "."],
    ],
    fairy: [
      ["В чаще жил ", B(1), ", который варил ", B(2), ". Путник попросил ", B(3), ", а взамен получил ", B(4), " и совет: «Не ", B(5), "!»"],
      ["Король объявил: «Кто принесёт ", B(1), ", получит ", B(2), "!» Герой взял ", B(3), ", подружился с ", B(4), " и ", B(5), "."],
    ],
  };
  let base = hooks[genre][idx % hooks[genre].length];
  if (size === "medium" || size === "long") {
    base = [
      ...base,
      " Потом появился ",
      B(6),
      ", который предложил ",
      B(7),
      ". Все ",
      B(8),
      " от ",
      B(9),
      ".",
    ];
  }
  if (size === "long") {
    base = [
      ...base,
      " В финале герой достал ",
      B(10),
      ", произнёс ",
      B(11),
      " и увидел ",
      B(12),
      ". Мораль: береги ",
      B(13),
      " и не доверяй ",
      B(14),
      ".",
    ];
  }
  // trim blanks to n
  return segs(base).filter((s) => {
    if (s.type === "blank") {
      const num = Number(s.blankId.slice(1));
      return num <= n;
    }
    return true;
  });
}

function monologueBody(genre, idx, size, n) {
  const hooks = {
    horror: [
      ["Друзья, я сторож уже ", B(1), " лет. Ночью коридор пахнет ", B(2), ". Вчера розетка сказала «", B(3), "». Я ", B(4), " и схватил ", B(5), "."],
      ["Это запись. Если слышите ", B(1), " — бегите. Я видел ", B(2), " в ", B(3), ". Он ", B(4), " мою ", B(5), "."],
    ],
    romance: [
      ["Слушай. Я стоял у ", B(1), " и думал о ", B(2), ". Хотел сказать, что ты — мой ", B(3), ". Вместо этого ", B(4), " и купил ", B(5), "."],
      ["Тост! За ", B(1), ", за ", B(2), " и за то, что мы когда-то ", B(3), ". Пусть ваша любовь будет ", B(4), ", как ", B(5), "!"],
    ],
    everyday: [
      ["Уважаемый ", B(1), "! Пишу про ", B(2), ". Вчера всё ", B(3), ", поэтому я решаю вопрос ", B(4), ". Обещаю ", B(5), " настроение."],
      ["Отзыв: товар как ", B(1), ". Курьер был ", B(2), ", упаковка пахла ", B(3), ". Ставлю ", B(4), " из пяти и слово «", B(5), "»."],
    ],
    adventure: [
      ["День ", B(1), ". Мы у ", B(2), ". Запас ", B(3), " на исходе. Если услышите ", B(4), " — это я, а не ", B(5), "."],
      ["Инструктаж: прыгаем с ", B(1), ". Держите ", B(2), ", не смотрите на ", B(3), ". Крикните «", B(4), "» и думайте о ", B(5), "."],
    ],
    fairy: [
      ["Я — король ", B(1), ". Мой дворец из ", B(2), ". Враги боятся моего ", B(3), ". Сегодня я ", B(4), " и объявляю праздник ", B(5), "!"],
      ["Жалоба: местные герои воруют ", B(1), ". Мой хвост теперь ", B(2), ". Прошу выдать ", B(3), " и запретить ", B(4), " без ", B(5), "."],
    ],
  };
  let base = hooks[genre][idx % hooks[genre].length];
  if (size !== "small") {
    base = [...base, " Кроме того, напоминаю про ", B(6), ": это ", B(7), ", а не ", B(8), ". Иначе будет ", B(9), "."];
  }
  if (size === "long") {
    base = [
      ...base,
      " В заключение: берегите ",
      B(10),
      ", слушайте ",
      B(11),
      ", не трогайте ",
      B(12),
      ". Подпись: ",
      B(13),
      ", хранитель ",
      B(14),
      ".",
    ];
  }
  return segs(base).filter((s) => {
    if (s.type === "blank") return Number(s.blankId.slice(1)) <= n;
    return true;
  });
}

function dialogueBody(genre, idx, size, playerCount, n) {
  const roles = ROLES[playerCount][idx % ROLES[playerCount].length];
  const lines = [];
  let bi = 1;
  const take = () => {
    if (bi > n) return null;
    return B(bi++);
  };

  const push = (speaker, address, parts) => {
    const filtered = [];
    for (const p of parts) {
      if (typeof p === "string") filtered.push(p);
      else if (p) filtered.push(p);
    }
    lines.push({
      id: `l${lines.length + 1}`,
      speakerRole: speaker,
      ...(address != null ? { addressRole: address } : {}),
      segments: segs(filtered),
    });
  };

  // opening
  push(0, 1, ["Слушай, тут пахнет ", take(), ". Ты тоже слышишь ", take(), "?"]);
  push(1, 0, ["Да. И ещё вижу ", take(), ". Давай не будем ", take(), "."]);

  if (playerCount >= 3) {
    push(2, 0, ["Стойте. Я нашёл ", take(), ". На бирке написано «", take(), "»."]);
  }
  if (playerCount >= 4) {
    push(3, 2, ["Отлично. Теперь всем раздаём ", take(), " и шепчем ", take(), "."]);
  }

  if (size !== "small") {
    push(0, playerCount > 1 ? 1 : undefined, [
      "План такой: берём ",
      take(),
      ", идём к ",
      take(),
      " и ",
      take(),
      ".",
    ]);
    push(1, 0, ["Только без ", take(), ". В прошлый раз всё кончилось ", take(), "."]);
  }

  if (size === "long") {
    push(0, undefined, [
      "Итог: если появится ",
      take(),
      " — кричите «",
      take(),
      "» и держите ",
      take(),
      ".",
    ]);
    push(1, 0, ["Договорились. За ", take(), " и за то, что мы ещё ", take(), "!"]);
    if (playerCount >= 3) {
      push(2, undefined, ["Я всё записываю в ", take(), ". Заголовок: «", take(), "»."]);
    }
  }

  // Ensure we used up to n blanks - pad last line if needed
  while (bi <= n) {
    const speaker = (lines.length) % playerCount;
    push(speaker, (speaker + 1) % playerCount, ["И ещё одно: не забудьте ", take(), "."]);
  }

  return { roles, lines };
}

function buildTemplate(kind, genre, slot) {
  const size = SIZES[slot];
  const n = blankCount(size);
  const title = TITLES[kind][genre][slot];
  const id = `${kind}-${genre}-${size}-${slot + 1}`;

  const base = {
    id,
    title,
    kind,
    genre,
    size,
    blanks: blanks(n, slot * 17 + GENRES.indexOf(genre) * 5 + KINDS.indexOf(kind)),
  };

  if (kind === "dialogue") {
    const playerCount = DIALOGUE_PLAYERS[slot];
    const { roles, lines } = dialogueBody(genre, slot, size, playerCount, n);
    return { ...base, playerCount, roles, lines };
  }

  const body = kind === "story" ? storyBody(genre, slot, size, n) : monologueBody(genre, slot, size, n);
  return { ...base, playerCount: null, segments: body };
}

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) {
  if (f.endsWith(".json")) unlinkSync(path.join(OUT, f));
}

let count = 0;
for (const kind of KINDS) {
  for (const genre of GENRES) {
    for (let slot = 0; slot < 5; slot++) {
      const tpl = buildTemplate(kind, genre, slot);
      const file = path.join(OUT, `${tpl.id}.json`);
      writeFileSync(file, JSON.stringify(tpl, null, 2) + "\n");
      count++;
    }
  }
}

console.log(`Generated ${count} templates in ${OUT}`);
