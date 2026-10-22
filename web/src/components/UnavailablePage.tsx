import PageHeading from "./PageHeading";
import { AppShell, Button } from "./ui";

/**
 * A page whose content arrives with the AWS connection, laid out like the
 * Deployments page: the title, then what will live here. It is deliberately
 * empty: it says plainly what will appear and when, shows no made-up numbers,
 * and offers no button that does nothing.
 */
export default function UnavailablePage({
  title,
  description,
  emptyTitle,
  emptyDescription,
}: {
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <AppShell contentClassName="py-8">
      <div className="space-y-6">
        <PageHeading title={title} description={description} />

        <div className="flex flex-col items-start gap-4 rounded-hatch border border-dashed border-line-strong px-6 py-12">
          <p className="text-xl font-semibold tracking-tight">{emptyTitle}</p>
          <p className="max-w-md leading-relaxed text-muted">{emptyDescription}</p>
          <Button href="/settings?section=aws" variant="secondary" className="h-10">
            How connecting works
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
