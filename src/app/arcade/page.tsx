import type { Metadata } from "next";
import ArcadeDemo from "./ArcadeDemo";
import ArcadeRoom from "./ArcadeRoom";

export const metadata: Metadata = {
  title: "Документы — репетиция на четверых",
  robots: { index: false, follow: false },
};

export default async function ArcadePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "development" && !process.env.NEXT_PUBLIC_ARCADE_HOST) return <ArcadeDemo />;
  return <ArcadeRoom hostMode={(await searchParams).host === "1"} />;
}
