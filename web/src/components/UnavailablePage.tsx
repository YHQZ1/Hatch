import { AppShell, Button, EmptyStateBlock, PageTitle, Panel } from "./ui";

/**
 * A page whose content arrives with the AWS connection. It is deliberately
 * empty: it says what will live here and where to read how connecting works.
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
    <AppShell>
      <PageTitle title={title} description={description} />
      <Panel>
        <EmptyStateBlock
          title={emptyTitle}
          description={emptyDescription}
          action={<Button href="/settings?section=aws">How connecting works</Button>}
        />
      </Panel>
    </AppShell>
  );
}
