import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Hatch | Universal Deployment Engine",
  description:
    "Self-hosted AWS deployment platform. Dockerfile in. Live URL out.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark scroll-smooth">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans min-h-screen flex flex-col relative`}
      >
        <div className="fixed inset-0 bg-grid-pattern [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)] pointer-events-none -z-10"></div>

        <div className="w-[95%] max-w-[2400px] mx-auto flex flex-col min-h-screen border-l border-r border-[#1f1f1f] bg-black/40 backdrop-blur-[2px]">
          <main className="flex-grow flex flex-col">{children}</main>
        </div>
      </body>
    </html>
  );
}
