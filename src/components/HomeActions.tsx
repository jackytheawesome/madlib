"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createRoomCode } from "@/lib/game";

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

  function onSolo(e: React.FormEvent) {
    e.preventDefault();
    const nick = nickname.trim() || "Одиночка";
    const code = createRoomCode();
    savePlayer(nick, true, code);
    router.push(`/room/${code}?solo=1`);
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-[var(--ink-soft)]">Твой ник</span>
        <input
          value={nickname}
          onChange={(e) => {
            setNickname(e.target.value);
            setError(null);
          }}
          maxLength={24}
          placeholder="например, Кефир"
          className="input"
          autoComplete="nickname"
        />
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

      <form onSubmit={onSolo}>
        <button type="submit" className="btn btn-ghost w-full">
          Играть одному
        </button>
      </form>
    </div>
  );
}
