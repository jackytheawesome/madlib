"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createRoomCode } from "@/lib/game";
import { RANDOM_NICKNAMES, randomNickname } from "@/lib/nicknames";

export function HomeActions() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

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
    setCreateError(null);
  }

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const nick = nickname.trim();
    if (!nick) {
      setCreateError("Напиши ник");
      return;
    }
    const code = createRoomCode();
    savePlayer(nick, true, code);
    router.push(`/room/${code}`);
  }

  function onJoin(e: React.FormEvent) {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) {
      setJoinError("Введи код комнаты");
      return;
    }
    setJoinError(null);
    router.push(`/room/${code}`);
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-24">
      <div className="flex flex-col gap-6">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-[var(--ink-soft)]">Твой ник</span>
          <div className="flex gap-2">
            <input
              value={nickname}
              onChange={(e) => {
                setNickname(e.target.value);
                setCreateError(null);
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
              <span aria-hidden>🎲</span>
            </button>
          </div>
        </label>

        {createError && (
          <p className="text-sm text-[var(--accent)]" role="alert">
            {createError}
          </p>
        )}

        <form onSubmit={onCreate} className="flex flex-col gap-3">
          <button type="submit" className="btn btn-primary">
            Создать комнату
          </button>
        </form>
      </div>

      <form onSubmit={onJoin} className="flex flex-col gap-3">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-[var(--ink-soft)]">Код комнаты</span>
          <input
            value={joinCode}
            onChange={(e) => {
              setJoinCode(e.target.value.toUpperCase());
              setJoinError(null);
            }}
            maxLength={6}
            placeholder="например, K7M2P"
            className="input font-mono tracking-widest uppercase"
            autoCapitalize="characters"
          />
        </label>
        {joinError && (
          <p className="text-sm text-[var(--accent)]" role="alert">
            {joinError}
          </p>
        )}
        <button type="submit" className="btn btn-secondary">
          Войти в комнату
        </button>
      </form>
    </div>
  );
}
