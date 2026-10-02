"use client";

import { useRouter } from "next/navigation";
import { CHEPUHA_ADMIN_PATH, CHEPUHA_API_PATH } from "@/lib/chepuha-paths";

export function AdminLogoutButton() {
  const router = useRouter();

  async function logout() {
    await fetch(`${CHEPUHA_API_PATH}/admin/logout`, { method: "POST" });
    router.push(`${CHEPUHA_ADMIN_PATH}/login`);
    router.refresh();
  }

  return (
    <button type="button" className="btn btn-ghost" onClick={logout}>
      Выйти
    </button>
  );
}
