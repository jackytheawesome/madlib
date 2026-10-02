import { notFound } from "next/navigation";
import ArcadeDemo from "../ArcadeDemo";

export default function LocalArcadePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ArcadeDemo />;
}
