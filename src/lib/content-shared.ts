import type { GenreId } from "./types";
import { GENRES } from "./types";

export function genreLabel(id: GenreId): string {
  return GENRES.find((g) => g.id === id)?.label ?? id;
}
