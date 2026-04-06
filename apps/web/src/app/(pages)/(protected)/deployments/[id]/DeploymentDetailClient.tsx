"use client";

import { useParams } from "next/navigation";

export default function DeploymentDetailClient() {
  const { id } = useParams();

  return (
    <div className="p-10 max-w-[1200px] space-y-16">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-[#1a1a1a] pb-10">
        <div className="space-y-2">
          <p className="text-[10px] font-mono text-neutral-600 uppercase tracking-widest">Deployment / {String(id).slice(0, 8)}</p>
          <h1 className="text-4xl font-bold text-white tracking-tighter uppercase">Build Summary</h1>
        </div>
        <div className="flex gap-4">
          <button className="px-6 py-2 bg-white text-black text-[10px] font-bold uppercase tracking-widest hover:invert transition-all">Redeploy</button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
        <section className="space-y-6">
          <h3 className="text-[11px] font-mono font-bold uppercase tracking-widest text-neutral-500 border-b border-[#1a1a1a] pb-2">Commit Details</h3>
          <div className="space-y-4">
             <InfoRow label="SHA" value="f47765..." />
             <InfoRow label="Message" value="Fix: Docker entrypoint permissions" />
             <InfoRow label="Author" value="Uttkarsh Ruparel" />
          </div>
        </section>

        <section className="space-y-6">
          <h3 className="text-[11px] font-mono font-bold uppercase tracking-widest text-neutral-500 border-b border-[#1a1a1a] pb-2">Artifacts</h3>
          <div className="space-y-4">
             <InfoRow label="Image URI" value="hatch.ecr.aws/bitlink:latest" />
             <InfoRow label="Cluster" value="hatch-compute-1" />
             <InfoRow label="Memory" value="1024 MB" />
          </div>
        </section>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string, value: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-[#0a0a0a]">
      <span className="text-[10px] font-mono text-neutral-600 uppercase tracking-widest">{label}</span>
      <span className="text-[13px] font-medium text-white tracking-tight">{value}</span>
    </div>
  );
}