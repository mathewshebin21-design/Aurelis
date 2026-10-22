import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Inter, JetBrains_Mono, Manrope, Newsreader } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader", style: ["normal", "italic"] });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: { default: "AURELIS — Design previews", template: "%s · AURELIS preview" },
  description: "AURELIS AI Investment Intelligence Terminal — Phase 1 interactive design previews using illustrative data.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={[inter, jetbrains, newsreader, manrope, plex, plexMono].map((f) => f.variable).join(" ")}>
      <body>
        <TooltipProvider delayDuration={150}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
