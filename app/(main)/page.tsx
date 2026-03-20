import { Inter } from "next/font/google";
import { LandingPage } from "@/components/landing/LandingPage";

/** Load Inter on the server — avoids Turbopack/HMR getting stuck when next/font runs inside a client page. */
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-landing-inter",
});

export default function Home() {
  return (
    <div
      dir="ltr"
      className={`${inter.variable} ${inter.className} relative min-h-screen text-caleno-ink antialiased`}
    >
      <LandingPage />
    </div>
  );
}
