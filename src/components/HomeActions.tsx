"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createRoomCode } from "@/lib/game";
import { RANDOM_NICKNAMES, randomNickname } from "@/lib/nicknames";

export function HomeActions() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function savePlayer(nick: string, isHost: boolean, code: string) {
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `p-${Date.now()}`;
    sessionStorage.setItem(
      "chepuha-player",
      JSON.stringify({ id, nickname: nick, isHost, roomCode: code }),
    );
  }

  function rollNickname() {
    let next = randomNickname();
    if (next === nickname.trim() && RANDOM_NICKNAMES.length > 1) {
      next = randomNickname();
    }
    setNickname(next);
    setError(null);
  }

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const nick = nickname.trim();
    if (!nick) {
      setError("Напиши ник");
      return;
    }
    const code = createRoomCode();
    savePlayer(nick, true, code);
    router.push(`/room/${code}`);
  }

  function onJoin(e: React.FormEvent) {
    e.preventDefault();
    const nick = nickname.trim();
    const code = joinCode.trim().toUpperCase();
    if (!nick) {
      setError("Напиши ник");
      return;
    }
    if (code.length < 4) {
      setError("Введи код комнаты");
      return;
    }
    savePlayer(nick, false, code);
    router.push(`/room/${code}`);
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-[var(--ink-soft)]">Твой ник</span>
        <div className="flex gap-2">
          <input
            value={nickname}
            onChange={(e) => {
              setNickname(e.target.value);
              setError(null);
            }}
            maxLength={24}
            placeholder="например, Кефир"
            className="input min-w-0 flex-1"
            autoComplete="nickname"
          />
          <button
            type="button"
            className="btn btn-secondary shrink-0 px-3 sm:px-4"
            onClick={rollNickname}
            title="Случайный ник"
            aria-label="Сгенерировать случайный ник"
          >
            <span className="sm:hidden" aria-hidden>
              ∗
            </span>
            <span className="hidden sm:inline">Случ.</span>
          </button>
        </div>
      </label>

      {error && (
        <p className="text-sm text-[var(--accent)]" role="alert">
          {error}
        </p>
      )}

      <form onSubmit={onCreate} className="flex flex-col gap-3">
        <button type="submit" className="btn btn-primary">
          Создать комнату
        </button>
      </form>

      <form onSubmit={onJoin} className="flex flex-col gap-3">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-[var(--ink-soft)]">Код комнаты</span>
          <input
            value={joinCode}
            onChange={(e) => {
              setJoinCode(e.target.value.toUpperCase());
              setError(null);
            }}
            maxLength={6}
            placeholder="например, K7M2P"
            className="input font-mono tracking-widest uppercase"
            autoCapitalize="characters"
          />
        </label>
        <button type="submit" className="btn btn-secondary">
          Войти в комнату
        </button>
      </form>
    </div>
  );
}
