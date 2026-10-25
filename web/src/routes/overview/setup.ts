import type { SetupStep } from "./SetupChecklist";

export interface SetupState {
  /** The Hatch GitHub App is installed on at least one account. */
  appInstalled: boolean;
  /** This server is set up to connect AWS accounts (GET /api/config). */
  awsAvailable: boolean;
  /** At least one AWS account is connected and checked. */
  awsConnected: boolean;
  hasProjects: boolean;
}

/**
 * What is left to do before the first deploy, in the order of the user journey
 * (docs/01-vision.md): GitHub, then AWS, then a project. The AWS step is listed
 * only where this server can connect an account, and it is optional: nothing
 * needs it until deploys to AWS exist (Phase 3), so it is offered, not required.
 */
export function setupSteps(state: SetupState): SetupStep[] {
  return [
    {
      id: "signin",
      title: "Sign in with GitHub",
      detail: "",
      done: true,
      action: { label: "", href: "/overview" },
    },
    {
      id: "app",
      title: "Install the Hatch App",
      detail: "Choose which repositories Hatch can read. It never gets write access.",
      done: state.appInstalled,
      action: { label: "Install on GitHub", href: "/auth/install", external: true },
    },
    ...(state.awsAvailable
      ? [
          {
            id: "aws",
            title: "Connect your AWS account",
            detail:
              "Hatch deploys into an AWS account you own, so the bill is yours. Optional for now: deploying to it arrives in the next phase, and until then projects run on local Docker. You create one stack in your own AWS console and paste a role into Hatch; it never asks for access keys.",
            done: state.awsConnected,
            optional: true,
            action: { label: "Connect AWS", href: "/settings?section=aws" },
          },
        ]
      : []),
    {
      id: "deploy",
      title: "Deploy your first service",
      detail: "Pick a repository with a Dockerfile and Hatch builds and runs it.",
      done: state.hasProjects,
      action: { label: "New service", href: "/new" },
    },
  ];
}

/** Setup is finished when every required step is done; an optional one may wait. */
export function isSetupFinished(steps: SetupStep[]): boolean {
  return steps.every((step) => step.done || step.optional === true);
}
