import { Button } from "@/components/ui";

export function NoProjects() {
  return (
    <div className="flex flex-col items-start gap-4 rounded-hatch border border-dashed border-line-strong px-6 py-12">
      <p className="text-xl font-semibold tracking-tight">No projects yet</p>
      <p className="max-w-md leading-relaxed text-muted">
        Add a project, then pick the GitHub repository it comes from. It needs a Dockerfile. Hatch
        builds it, runs it and gives it a URL.
      </p>
      <Button href="/new" variant="primary" className="h-10">
        Add your first project
      </Button>
    </div>
  );
}

export function NoMatches({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-hatch border border-dashed border-line-strong px-6 py-10">
      <p className="text-lg font-semibold tracking-tight">
        {query.trim() ? <>No projects match &ldquo;{query.trim()}&rdquo;</> : "No projects in this state"}
      </p>
      <p className="text-sm text-muted">Try a different word, or clear the search and the filter.</p>
      <Button variant="secondary" onClick={onClear}>
        Clear search and filter
      </Button>
    </div>
  );
}
