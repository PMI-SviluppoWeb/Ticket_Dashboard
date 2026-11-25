import type { Metadata } from "next";

// Il link del questionario non deve finire nei referrer (contiene il token)
// ne' essere indicizzato dai motori di ricerca.
export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function QuestionarioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
