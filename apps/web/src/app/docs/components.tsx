"use client";

import React, { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-[#444] hover:text-[#888] transition-colors"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function CodeBlock({
  code,
  language = "bash",
  filename,
}: {
  code: string;
  language?: string;
  filename?: string;
}) {
  return (
    <div className="rounded-[2px] border border-[#1a1a1a] bg-[#0a0a0a] overflow-hidden my-5">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1a1a1a]">
        <span className="font-mono text-[10px] uppercase tracking-widest text-[#444]">
          {filename || language}
        </span>
        <CopyButton text={code} />
      </div>
      <pre className="p-5 overflow-x-auto">
        <code className="font-mono text-[13px] text-[#8a8a8a] leading-6 whitespace-pre">
          {code}
        </code>
      </pre>
    </div>
  );
}

export function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-[#111] text-[#ccc] px-1.5 py-0.5 rounded-[1px] text-[13px] font-mono border border-[#222]">
      {children}
    </code>
  );
}

export function StatusPill({
  children,
  color = "green",
}: {
  children: React.ReactNode;
  color?: "green" | "amber" | "blue" | "purple" | "red";
}) {
  const colors = {
    green: "bg-[#10b981]",
    amber: "bg-[#f59e0b]",
    blue: "bg-[#3b82f6]",
    purple: "bg-[#a855f7]",
    red: "bg-[#ef4444]",
  };

  return (
    <span className="flex items-center gap-2 text-[11px] font-mono text-[#555] border border-[#1a1a1a] bg-[#050505] rounded-[2px] px-4 py-1.5 font-bold uppercase tracking-wider">
      <span className={`w-1.5 h-1.5 rounded-full ${colors[color]}`} />
      {children}
    </span>
  );
}

export function SimpleNote({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "warning" | "success";
}) {
  const border =
    tone === "warning"
      ? "border-[#a16207]"
      : tone === "success"
        ? "border-[#047857]"
        : "border-zinc-700";

  return (
    <div className={`border-l ${border} pl-6 py-2 my-8`}>
      <div className="text-[#666] text-sm leading-relaxed font-light italic">
        {children}
      </div>
    </div>
  );
}

export function FeatureCard({
  title,
  body,
  tag,
}: {
  title: string;
  body: string;
  tag?: string;
}) {
  return (
    <div className="p-5 border border-[#131313] bg-[#050505] hover:border-[#333] transition-colors rounded-[2px]">
      <div className="flex items-center justify-between gap-4 mb-3">
        <h3 className="text-[#ccc] text-sm font-medium">{title}</h3>
        {tag && (
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#333] border border-[#1a1a1a] px-3 py-1 rounded-full font-bold shrink-0">
            {tag}
          </span>
        )}
      </div>
      <p className="text-[#555] text-[13px] leading-relaxed font-mono uppercase tracking-wide">
        {body}
      </p>
    </div>
  );
}

export function NumberedCard({
  index,
  title,
  body,
}: {
  index: number;
  title: string;
  body: string;
}) {
  return (
    <div className="grid grid-cols-[72px_1fr] border-b border-[#111] last:border-0">
      <div className="p-5 border-r border-[#111] font-mono text-[10px] text-[#555] uppercase tracking-widest">
        {String(index).padStart(2, "0")}
      </div>
      <div className="p-5">
        <h3 className="text-white font-medium mb-2">{title}</h3>
        <p className="text-[#777] text-sm leading-relaxed font-light">{body}</p>
      </div>
    </div>
  );
}

export function DataTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: string[][];
}) {
  return (
    <div className="rounded-[2px] border border-[#1a1a1a] bg-[#050505] overflow-hidden my-8 font-mono">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#131313] bg-[#0a0a0a]">
            {columns.map((column) => (
              <th
                key={column}
                className="text-left px-6 py-4 text-[10px] uppercase tracking-[0.2em] text-[#333] font-bold"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.join("-")}
              className="border-b border-[#0f0f0f] last:border-0 hover:bg-white/[0.01] transition-colors"
            >
              {row.map((cell, index) => (
                <td
                  key={`${cell}-${index}`}
                  className={`px-6 py-4 text-[12px] leading-relaxed ${
                    index === 0
                      ? "text-[#aaa] font-bold whitespace-nowrap"
                      : "text-[#555]"
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

