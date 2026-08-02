/**
 * Генератор текстов «Чепуха».
 * Каждый пропуск получает подсказку под грамматику слота.
 * Запуск: node scripts/generate-templates.mjs
 *
 * Не перезаписывает шаблоны из PROTECTED_IDS (правки из админки).
 */
import { writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "content", "templates");

/** ID, которые написала/правила пользовательница — не трогаем. */
const PROTECTED_IDS = new Set(["story-horror-small-2"]);

const GENRES = ["horror", "romance", "everyday", "adventure", "fairy"];
const KINDS = ["story", "monologue", "dialogue"];
const SIZES = ["small", "small", "medium", "medium", "long"];
const DIALOGUE_PLAYERS = [2, 2, 3, 3, 4];

/** Подсказки: ключ = роль в предложении */
const H = {
  nom: { prompt: "существительное, именительный падеж", example: "утюг" },
  acc: { prompt: "существительное, винительный падеж", example: "кабачок" },
  gen: { prompt: "существительное, родительный падеж", example: "варенья" },
  genPl: { prompt: "существительное, родительный падеж, множественное число", example: "носков" },
  dat: { prompt: "существительное, дательный падеж", example: "соседу" },
  ins: { prompt: "существительное, творительный падеж", example: "вареньем" },
  prepPlace: { prompt: "место в предложном падеже (без предлога)", example: "подвале" },
  placeU: { prompt: "место после «у» (родительный падеж)", example: "фонтана" },
  placeK: { prompt: "место после «к» (дательный падеж)", example: "маяку" },
  placeV: { prompt: "место после «в/на» (куда?)", example: "подвал" },
  adj: { prompt: "прилагательное", example: "липкий" },
  adjIns: { prompt: "прилагательное, творительный падеж, женский род", example: "бархатной" },
  adjShort: { prompt: "краткое прилагательное или оценка", example: "странный" },
  verbPast: { prompt: "глагол, прошедшее время", example: "зашипел" },
  verbPastPl: { prompt: "глагол, прошедшее время, множественное число", example: "танцевали" },
  verbInf: { prompt: "глагол, инфинитив", example: "танцевать" },
  verbImp: { prompt: "глагол, повелительное наклонение", example: "беги" },
  adv: { prompt: "наречие", example: "внезапно" },
  interj: { prompt: "междометие или возглас", example: "ой" },
  name: { prompt: "имя собственное", example: "Вася" },
  job: { prompt: "профессия или род занятий", example: "бариста" },
  body: { prompt: "часть тела", example: "локоть" },
  sound: { prompt: "звук или шум", example: "бульк" },
  feeling: { prompt: "чувство или эмоция, родительный падеж", example: "тоски" },
  number: { prompt: "число", example: "семь" },
  phrase: { prompt: "короткая фраза или слово", example: "всё пропало" },
};

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

function blankCount(size) {
  if (size === "small") return 5;
  if (size === "medium") return 9;
  return 14;
}

function segs(parts) {
  return parts.map((p) =>
    typeof p === "string" ? { type: "text", value: p } : { type: "blank", blankId: p.b },
  );
}

/** @param {number} i @param {{prompt:string, example:string}} hint */
function B(i, hint) {
  return { b: `b${i}`, hint };
}

function collectBlanks(parts) {
  const map = new Map();
  for (const p of parts) {
    if (typeof p === "object" && p.b && p.hint) {
      map.set(p.b, { id: p.b, hint: { ...p.hint } });
    }
  }
  return [...map.values()].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
}

function storyParts(genre, idx, size) {
  const cores = {
    horror: [
      [
        "Ночью я услышал ",
        B(1, H.sound),
        ". За дверью стоял ",
        B(2, H.nom),
        " с ",
        B(3, H.adjIns),
        " улыбкой. Я ",
        B(4, H.verbPast),
        " и крикнул: ",
        B(5, H.interj),
        "!",
      ],
      [
        "В лифте погас свет. Кто-то шепнул: ",
        B(1, H.phrase),
        ". Я потрогал ",
        B(2, H.acc),
        " и понял: это был ",
        B(3, H.nom),
        ". Двери открылись в ",
        B(4, H.placeV),
        ", пахло ",
        B(5, H.ins),
        ".",
      ],
    ],
    romance: [
      [
        "Утром я нашёл записку: «Встретимся у ",
        B(1, H.placeU),
        "». Там ждал ",
        B(2, H.name),
        " с букетом из ",
        B(3, H.genPl),
        ". Мы ",
        B(4, H.verbPastPl),
        " под ",
        B(5, H.ins),
        ".",
      ],
      [
        "В парке шёл дождь, и рядом ",
        B(1, H.verbPast),
        " ",
        B(2, H.nom),
        ". Я протянул ",
        B(3, H.acc),
        " и сказал про ",
        B(4, H.acc),
        ". Ответ был ",
        B(5, H.adjShort),
        ".",
      ],
    ],
    everyday: [
      [
        "Будильник орал как ",
        B(1, H.nom),
        ". Я надел ",
        B(2, H.acc),
        " и споткнулся о ",
        B(3, H.acc),
        ". В метро кто-то ",
        B(4, H.verbPast),
        " с криком: ",
        B(5, H.interj),
        "!",
      ],
      [
        "В очереди стоял ",
        B(1, H.job),
        ". Он обсуждал ",
        B(2, H.acc),
        " и ел ",
        B(3, H.acc),
        ". Кассир ",
        B(4, H.verbPast),
        " и выдал ",
        B(5, H.acc),
        ".",
      ],
    ],
    adventure: [
      [
        "На карте было пятно в форме ",
        B(1, H.gen),
        ". Мы взяли ",
        B(2, H.acc),
        " и пошли к ",
        B(3, H.placeK),
        ". Там нас ждал ",
        B(4, H.nom),
        ", который ",
        B(5, H.verbPast),
        ".",
      ],
      [
        "Шторм бил в борт. Капитан крикнул: «Держите ",
        B(1, H.acc),
        "!» Юнга нёс ",
        B(2, H.acc),
        ", а штурман ",
        B(3, H.verbPast),
        ". Горизонт стал ",
        B(4, H.adjShort),
        ", как ",
        B(5, H.nom),
        ".",
      ],
    ],
    fairy: [
      [
        "В чаще жил ",
        B(1, H.nom),
        ", который варил ",
        B(2, H.acc),
        ". Путник попросил ",
        B(3, H.acc),
        ", а взамен получил ",
        B(4, H.acc),
        " и совет: «Не ",
        B(5, H.verbImp),
        "!»",
      ],
      [
        "Король объявил: «Кто принесёт ",
        B(1, H.acc),
        ", получит ",
        B(2, H.acc),
        "!» Герой взял ",
        B(3, H.acc),
        ", подружился с ",
        B(4, H.ins),
        " и ",
        B(5, H.verbPast),
        ".",
      ],
    ],
  };

  let parts = [...cores[genre][idx % cores[genre].length]];

  if (size === "medium" || size === "long") {
    parts = [
      ...parts,
      " Потом появился ",
      B(6, H.nom),
      ", который предложил ",
      B(7, H.verbInf),
      ". Все ",
      B(8, H.verbPastPl),
      " от ",
      B(9, H.feeling),
      ".",
    ];
  }

  if (size === "long") {
    parts = [
      ...parts,
      " В финале герой достал ",
      B(10, H.acc),
      ", произнёс: ",
      B(11, H.interj),
      "! — и увидел ",
      B(12, H.acc),
      ". Мораль: береги ",
      B(13, H.acc),
      " и не доверяй ",
      B(14, H.dat),
      ".",
    ];
  }

  return parts;
}

function monologueParts(genre, idx, size) {
  const cores = {
    horror: [
      [
        "Друзья, я сторож уже ",
        B(1, H.number),
        " лет. Ночью коридор пахнет ",
        B(2, H.ins),
        ". Вчера розетка сказала: ",
        B(3, H.phrase),
        ". Я ",
        B(4, H.verbPast),
        " и схватил ",
        B(5, H.acc),
        ".",
      ],
      [
        "Это запись. Если слышите ",
        B(1, H.acc),
        " — бегите. Я видел ",
        B(2, H.acc),
        " в ",
        B(3, H.prepPlace),
        ". Он ",
        B(4, H.verbPast),
        " мою ",
        B(5, H.acc),
        ".",
      ],
    ],
    romance: [
      [
        "Слушай. Я стоял у ",
        B(1, H.placeU),
        " и думал о ",
        B(2, H.prepPlace),
        ". Хотел сказать, что ты — мой ",
        B(3, H.nom),
        ". Вместо этого ",
        B(4, H.verbPast),
        " и купил ",
        B(5, H.acc),
        ".",
      ],
      [
        "Тост! За ",
        B(1, H.acc),
        ", за ",
        B(2, H.acc),
        " и за то, что мы когда-то ",
        B(3, H.verbPastPl),
        ". Пусть ваша любовь будет ",
        B(4, H.adjShort),
        ", как ",
        B(5, H.nom),
        "!",
      ],
    ],
    everyday: [
      [
        "Уважаемый ",
        B(1, H.job),
        "! Пишу про ",
        B(2, H.acc),
        ". Вчера всё ",
        B(3, H.verbPast),
        ", поэтому я решаю вопрос ",
        B(4, H.adv),
        ". Обещаю ",
        B(5, H.verbInf),
        " настроение.",
      ],
      [
        "Отзыв: товар как ",
        B(1, H.nom),
        ". Курьер был ",
        B(2, H.adjShort),
        ", упаковка пахла ",
        B(3, H.ins),
        ". Ставлю ",
        B(4, H.number),
        " из пяти и слово: ",
        B(5, H.interj),
        ".",
      ],
    ],
    adventure: [
      [
        "День ",
        B(1, H.number),
        ". Мы у ",
        B(2, H.placeU),
        ". Запас ",
        B(3, H.gen),
        " на исходе. Если услышите ",
        B(4, H.acc),
        " — это я, а не ",
        B(5, H.nom),
        ".",
      ],
      [
        "Инструктаж: прыгаем с ",
        B(1, H.gen),
        ". Держите ",
        B(2, H.acc),
        ", не смотрите на ",
        B(3, H.acc),
        ". Крикните: ",
        B(4, H.interj),
        "! — и думайте о ",
        B(5, H.prepPlace),
        ".",
      ],
    ],
    fairy: [
      [
        "Я — король ",
        B(1, H.genPl),
        ". Мой дворец из ",
        B(2, H.gen),
        ". Враги боятся моего ",
        B(3, H.gen),
        ". Сегодня я ",
        B(4, H.verbPast),
        " и объявляю праздник ",
        B(5, H.gen),
        "!",
      ],
      [
        "Жалоба: местные герои воруют ",
        B(1, H.acc),
        ". Мой хвост теперь ",
        B(2, H.adjShort),
        ". Прошу выдать ",
        B(3, H.acc),
        " и запретить ",
        B(4, H.verbInf),
        " без ",
        B(5, H.gen),
        ".",
      ],
    ],
  };

  let parts = [...cores[genre][idx % cores[genre].length]];

  if (size !== "small") {
    parts = [
      ...parts,
      " Кроме того, напоминаю про ",
      B(6, H.acc),
      ": это ",
      B(7, H.nom),
      ", а не ",
      B(8, H.nom),
      ". Иначе будет ",
      B(9, H.feeling),
      ".",
    ];
  }

  if (size === "long") {
    parts = [
      ...parts,
      " В заключение: берегите ",
      B(10, H.acc),
      ", слушайте ",
      B(11, H.acc),
      ", не трогайте ",
      B(12, H.acc),
      ". Подпись: ",
      B(13, H.name),
      ", хранитель ",
      B(14, H.gen),
      ".",
    ];
  }

  return parts;
}

function dialogueBuild(genre, idx, size, playerCount, n) {
  const roles = ROLES[playerCount][idx % ROLES[playerCount].length];
  const lines = [];
  const hintMap = new Map();
  let bi = 1;

  const take = (hint) => {
    if (bi > n) throw new Error(`dialogue ${genre} ran out of blanks at b${bi}/${n}`);
    const id = `b${bi}`;
    hintMap.set(id, { id, hint: { ...hint } });
    bi += 1;
    return { b: id, hint };
  };

  const push = (speaker, address, parts) => {
    lines.push({
      id: `l${lines.length + 1}`,
      speakerRole: speaker,
      ...(address != null ? { addressRole: address } : {}),
      segments: segs(parts),
    });
  };

  const openings = {
    horror: () => {
      push(0, 1, ["Слушай, тут пахнет ", take(H.ins), ". Ты тоже слышишь ", take(H.acc), "?"]);
      push(1, 0, ["Да. И ещё вижу ", take(H.acc), ". Давай не будем ", take(H.verbInf), "."]);
    },
    romance: () => {
      push(0, 1, ["У тебя на столе лежит ", take(H.nom), ". Это намёк на ", take(H.acc), "?"]);
      push(1, 0, ["Скорее на ", take(H.acc), ". Только не ", take(H.verbImp), " так громко."]);
    },
    everyday: () => {
      push(0, 1, ["Опять очередь как ", take(H.nom), ". Ты взял ", take(H.acc), "?"]);
      push(1, 0, ["Взял. Ещё и ", take(H.acc), ". Главное — не ", take(H.verbInf), " кассира."]);
    },
    adventure: () => {
      push(0, 1, ["Карта показывает ", take(H.acc), ". Слышишь ", take(H.acc), "?"]);
      push(1, 0, ["Слышу. Держи ", take(H.acc), " и не смей ", take(H.verbInf), "."]);
    },
    fairy: () => {
      push(0, 1, ["Джинн обещал ", take(H.acc), ". Ты загадал ", take(H.acc), "?"]);
      push(1, 0, ["Да, но получил ", take(H.acc), ". Теперь придётся ", take(H.verbInf), "."]);
    },
  };
  openings[genre](); // 4 blanks

  if (size === "small") {
    push(0, 1, ["И ещё: не забудь ", take(H.acc), "."]);
  } else if (size === "medium") {
    // medium + 3 players: 4 + 2 + 3 = 9
    if (playerCount >= 3) {
      push(2, 0, ["Стойте. Я нашёл ", take(H.acc), ". На бирке написано: ", take(H.phrase), "."]);
    }
    push(0, 1, [
      "План: берём ",
      take(H.acc),
      ", идём к ",
      take(H.placeK),
      " и ",
      take(H.verbInf),
      ".",
    ]);
    if (playerCount < 3) {
      push(1, 0, ["Только без ", take(H.gen), ". В прошлый раз всё кончилось ", take(H.ins), "."]);
    }
  } else {
    // long + 4 players: 4 + 2 + 2 + 3 + 2 + 1 = 14
    if (playerCount >= 3) {
      push(2, 0, ["Стойте. Я нашёл ", take(H.acc), ". На бирке написано: ", take(H.phrase), "."]);
    }
    if (playerCount >= 4) {
      push(3, 2, ["Раздаём всем ", take(H.acc), " и шепчем: ", take(H.interj), "."]);
    }
    push(0, 1, [
      "План: берём ",
      take(H.acc),
      ", идём к ",
      take(H.placeK),
      " и ",
      take(H.verbInf),
      ".",
    ]);
    push(1, 0, ["Только без ", take(H.gen), ". Иначе снова кончится ", take(H.ins), "."]);
    while (bi <= n) {
      const speaker = (bi - 1) % playerCount;
      push(speaker, (speaker + 1) % playerCount, ["И ещё: не забудьте ", take(H.verbInf), "."]);
    }
  }

  if (bi - 1 !== n) {
    throw new Error(`dialogue blank count ${bi - 1} !== ${n} (${genre}, ${size}, p${playerCount})`);
  }

  const blanks = [...hintMap.values()].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  return { roles, lines, blanks };
}

function buildTemplate(kind, genre, slot) {
  const size = SIZES[slot];
  const n = blankCount(size);
  const title = TITLES[kind][genre][slot];
  const id = `${kind}-${genre}-${size}-${slot + 1}`;

  if (kind === "dialogue") {
    const playerCount = DIALOGUE_PLAYERS[slot];
    const { roles, lines, blanks } = dialogueBuild(genre, slot, size, playerCount, n);
    return { id, title, kind, genre, size, blanks, playerCount, roles, lines };
  }

  const parts = kind === "story" ? storyParts(genre, slot, size) : monologueParts(genre, slot, size);
  const used = [];
  const filtered = [];
  for (const p of parts) {
    if (typeof p === "string") {
      filtered.push(p);
    } else {
      const num = Number(p.b.slice(1));
      if (num <= n) {
        filtered.push(p);
        used.push(p);
      }
    }
  }

  return {
    id,
    title,
    kind,
    genre,
    size,
    blanks: collectBlanks(used),
    playerCount: null,
    segments: segs(filtered),
  };
}

const preserved = new Map();
if (existsSync(OUT)) {
  for (const id of PROTECTED_IDS) {
    const file = path.join(OUT, `${id}.json`);
    if (existsSync(file)) {
      preserved.set(id, readFileSync(file, "utf8"));
    }
  }
}

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) {
  if (f.endsWith(".json")) unlinkSync(path.join(OUT, f));
}

let count = 0;
let skipped = 0;
for (const kind of KINDS) {
  for (const genre of GENRES) {
    for (let slot = 0; slot < 5; slot++) {
      const tpl = buildTemplate(kind, genre, slot);
      if (PROTECTED_IDS.has(tpl.id) && preserved.has(tpl.id)) {
        writeFileSync(path.join(OUT, `${tpl.id}.json`), preserved.get(tpl.id));
        skipped += 1;
        continue;
      }
      writeFileSync(path.join(OUT, `${tpl.id}.json`), JSON.stringify(tpl, null, 2) + "\n");
      count += 1;
    }
  }
}

console.log(`Generated ${count} templates, preserved ${skipped} protected in ${OUT}`);
