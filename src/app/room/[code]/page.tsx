import { BrandMark } from "@/components/BrandMark";
import { RoomClient } from "@/components/RoomClient";

type Props = {
  params: Promise<{ code: string }>;
};

export default async function RoomPage({ params }: Props) {
  const { code } = await params;

  return (
    <div className="relative flex flex-1 flex-col">
      <div className="pointer-events-none absolute inset-0 bg-atmosphere opacity-60" aria-hidden />
      <header className="relative z-10 border-b border-[var(--line)] px-6 py-4">
        <BrandMark size="sm" />
      </header>
      <main className="relative z-10 flex-1 px-6 py-8">
        <RoomClient code={code.toUpperCase()} />
      </main>
    </div>
  );
}
