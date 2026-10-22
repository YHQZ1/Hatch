import { useState } from "react";
import { Button } from "@/components/ui";
import type { Session } from "@/lib/types";
import { ExternalLink, SectionLayout, SettingRow, SettingsCard } from "./primitives";

/** Who is signed in, and signing out. */
export default function AccountSection({
  user,
  onSignOut,
}: {
  user: Session;
  onSignOut: () => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function copyId() {
    try {
      await navigator.clipboard.writeText(user.user_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be denied; the ID is selectable on screen.
    }
  }

  return (
    <SectionLayout
      main={
        <SettingsCard title="Profile" description="Hatch signs you in with GitHub, so your identity comes from there.">
          <div className="flex items-center gap-4 border-b border-line px-5 py-5">
            <img
              src={`https://github.com/${encodeURIComponent(user.username)}.png?size=128`}
              alt=""
              className="h-16 w-16 rounded-hatch border border-line"
            />
            <div className="min-w-0">
              <p className="truncate text-xl font-semibold tracking-tight">@{user.username}</p>
              <ExternalLink href={`https://github.com/${encodeURIComponent(user.username)}`}>
                View GitHub profile
              </ExternalLink>
            </div>
          </div>
          <SettingRow
            label="Hatch user ID"
            description="Useful if you ever need to report a problem."
          >
            <code className="max-w-[16rem] truncate font-mono text-xs text-muted">{user.user_id}</code>
            <Button onClick={() => void copyId()} className="h-8">
              {copied ? "Copied" : "Copy"}
            </Button>
          </SettingRow>
        </SettingsCard>
      }
      aside={
        <SettingsCard title="Session">
          <SettingRow
            label="Sign out"
            description="Ends your session in this browser. Your projects keep running."
          >
            <Button
              variant="danger"
              disabled={signingOut}
              onClick={() => {
                setSigningOut(true);
                void onSignOut();
              }}
              className="h-9"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </Button>
          </SettingRow>
        </SettingsCard>
      }
    />
  );
}
