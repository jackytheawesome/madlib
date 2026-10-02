import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Чепуха — игра для компании",
  description:
    "Заполняйте пропуски вслепую и читайте получившуюся чепуху вместе с друзьями.",
};

export default function ChepuhaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
