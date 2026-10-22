export type ActivityKind = "create" | "delete" | "deploy" | "system";

export function activityKind(type: string): ActivityKind {
  const normalized = type.toLowerCase();
  if (normalized.includes("delete") || normalized.includes("destroy")) {
    return "delete";
  }
  if (normalized.includes("create") || normalized.includes("init")) {
    return "create";
  }
  if (normalized.includes("deploy")) {
    return "deploy";
  }
  return "system";
}

export function activityMeta(kind: ActivityKind) {
  const map = {
    create: { dot: "bg-success", text: "text-success" },
    delete: { dot: "bg-danger", text: "text-danger" },
    deploy: { dot: "bg-warning", text: "text-warning" },
    system: { dot: "bg-faint", text: "text-muted" },
  } satisfies Record<ActivityKind, { dot: string; text: string }>;

  return map[kind];
}
