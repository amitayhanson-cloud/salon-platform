import { Assistant, Inter, Playfair_Display } from "next/font/google";

import "./landing-v2.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-landing-v2-sans",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-landing-v2-serif",
});

const assistant = Assistant({
  subsets: ["latin", "hebrew"],
  variable: "--font-landing-v2-assistant",
});

export default function LandingV2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  /* Font variables only — `.landing-v2-root` lives on page.tsx so theme + scopes apply correctly */
  return (
    <div className={`${inter.variable} ${playfair.variable} ${assistant.variable}`}>{children}</div>
  );
}
