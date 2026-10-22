import { Button } from "@/components/ui";
import { SectionLayout, SettingRow, SettingsCard } from "./primitives";

/** What Hatch keeps in this browser. */
export default function BrowserSection({ onClear }: { onClear: () => void }) {
  return (
    <SectionLayout
      main={
        <SettingsCard
          title="This browser"
          description="Hatch keeps a little data in your browser so pages open quickly."
        >
          <SettingRow
            label="Cached data"
            description="Clears what Hatch stored here and loads everything fresh from the server. Your projects and your account are not affected."
          >
            <Button onClick={onClear} className="h-9">
              Clear cached data
            </Button>
          </SettingRow>
        </SettingsCard>
      }
      aside={
        <SettingsCard
          title="What is stored here"
          description="All of it is recreated the next time you use Hatch."
        >
          <SettingRow
            label="Sign-in session"
            description="A cookie Hatch sets when you sign in. Page scripts cannot read it, and signing out removes it."
          />
          <SettingRow
            label="Theme"
            description="Whether you picked light or dark, so the page opens in it without a flash."
          />
          <SettingRow
            label="Page title"
            description="The title of the page you last had open, so the tab does not flicker on reload."
          />
        </SettingsCard>
      }
    />
  );
}
