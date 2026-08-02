/** Короткие ники для кнопки «случайный» (≤ 8 букв) */
export const RANDOM_NICKNAMES = [
  "Кефир",
  "Бублик",
  "Пончик",
  "Ёжик",
  "Лосось",
  "Вареник",
  "Чибис",
  "Пельмень",
  "Крокус",
  "Тыква",
  "Мопс",
  "Батон",
  "Фикус",
  "Чайник",
  "Зефир",
  "Комок",
  "Редиска",
  "Плюш",
  "Сухарь",
  "Карась",
] as const;

export function randomNickname(rng: () => number = Math.random): string {
  const list = RANDOM_NICKNAMES;
  return list[Math.floor(rng() * list.length)]!;
}
