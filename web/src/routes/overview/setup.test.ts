import { describe, expect, it } from "vitest";
import { isSetupFinished, setupSteps } from "./setup";

const none = { appInstalled: false, awsAvailable: true, awsConnected: false, hasProjects: false };
const ids = (state = none) => setupSteps(state).map((step) => step.id);

describe("setupSteps", () => {
  it("follows the journey: GitHub, then AWS, then a project", () => {
    expect(ids()).toEqual(["signin", "app", "aws", "deploy"]);
  });

  it("leaves the AWS step out where the server cannot connect an account", () => {
    expect(ids({ ...none, awsAvailable: false })).toEqual(["signin", "app", "deploy"]);
  });

  it("marks each step by what is true", () => {
    const done = (state: typeof none) =>
      Object.fromEntries(setupSteps(state).map((step) => [step.id, step.done]));
    expect(done(none)).toEqual({ signin: true, app: false, aws: false, deploy: false });
    expect(done({ ...none, appInstalled: true, awsConnected: true })).toEqual({
      signin: true,
      app: true,
      aws: true,
      deploy: false,
    });
  });

  it("is finished when the required steps are, whether or not AWS is connected", () => {
    const finished = (state: typeof none) => isSetupFinished(setupSteps(state));
    const base = { appInstalled: true, hasProjects: true };
    expect(finished({ ...base, awsAvailable: false, awsConnected: false })).toBe(true);
    expect(finished({ ...base, awsAvailable: true, awsConnected: false })).toBe(true);
    expect(finished({ ...base, awsAvailable: true, awsConnected: true })).toBe(true);
    expect(finished({ appInstalled: false, hasProjects: true, awsAvailable: true, awsConnected: true })).toBe(false);
    expect(finished({ appInstalled: true, hasProjects: false, awsAvailable: true, awsConnected: true })).toBe(false);
  });

  it("makes AWS the only optional step", () => {
    expect(setupSteps(none).filter((step) => step.optional).map((step) => step.id)).toEqual(["aws"]);
  });

  it("sends the AWS step to the AWS page of Settings, inside the app", () => {
    const aws = setupSteps(none).find((step) => step.id === "aws");
    expect(aws?.action.href).toBe("/settings?section=aws");
    expect(aws?.action.external).toBeUndefined();
  });

  it("does not promise AWS deploys that do not exist yet", () => {
    const aws = setupSteps(none).find((step) => step.id === "aws");
    expect(aws?.detail).toMatch(/Optional for now/);
    expect(aws?.detail).toMatch(/arrives in the next phase/);
    expect(aws?.detail).toMatch(/local Docker/);
  });
});
