import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { upsertTemplateToDb } from "@/lib/db/templates";
import type { Template } from "@/lib/types";

function isTemplate(value: unknown): value is Template {
  if (!value || typeof value !== "object") return false;
  const t = value as Template;
  return (
    typeof t.id === "string" &&
    typeof t.title === "string" &&
    typeof t.kind === "string" &&
    typeof t.genre === "string" &&
    typeof t.size === "string" &&
    Array.isArray(t.blanks)
  );
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (
    !process.env.DATABASE_URL &&
    !process.env.POSTGRES_URL &&
    !process.env.POSTGRES_PRISMA_URL
  ) {
    return NextResponse.json(
      { error: "База не подключена (нет DATABASE_URL)" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  if (!isTemplate(body)) {
    return NextResponse.json({ error: "Некорректный шаблон" }, { status: 400 });
  }

  try {
    await upsertTemplateToDb(body);
    return NextResponse.json({ ok: true, id: body.id });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Не удалось сохранить" }, { status: 500 });
  }
}
