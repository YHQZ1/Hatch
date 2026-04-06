/* eslint-disable @next/next/no-img-element */
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
  title: {
    default: "Hatch — The Private PaaS for AWS",
    template: "%s | Hatch",
  },
  description:
    "Deploy Dockerized applications to your own AWS Fargate cluster in seconds. No YAML, no console, just your code.",
  keywords: [
    "PaaS",
    "AWS Fargate",
    "Docker deployment",
    "Self-hosted Heroku",
    "Infrastructure Automation",
    "Golang Orchestrator"
  ],
  authors: [{ name: "Uttkarsh Ruparel" }],
  icons: {
    icon: "/hatch.svg",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark scroll-smooth">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans min-h-screen flex flex-col relative bg-black text-white selection:bg-white selection:text-black`}
      >
        <div className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden">
          <div className="absolute inset-0 bg-grid-pattern [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)] opacity-20"></div>

          <div className="absolute -bottom-24 -right-24 opacity-[0.03] select-none">
            <img
              src="https://cdn.simpleicons.org/habr/FFFFFF"
              alt=""
              className="w-[600px] h-[600px] rotate-12"
            />
          </div>

          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-white opacity-[0.02] blur-[120px] rounded-full"></div>
        </div>

        <main className="flex-grow flex flex-col w-full relative z-0">
          {children}
        </main>
      </body>
    </html>
  );
}
