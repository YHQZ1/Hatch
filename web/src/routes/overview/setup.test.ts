import { describe, expect, it } from "vitest";
import { setupSteps } from "./setup";

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

  it("is finished only when every listed step is, so a server without AWS can finish", () => {
    const finished = (state: typeof none) => setupSteps(state).every((step) => step.done);
    expect(finished({ appInstalled: true, awsAvailable: false, awsConnected: false, hasProjects: true })).toBe(true);
    expect(finished({ appInstalled: true, awsAvailable: true, awsConnected: false, hasProjects: true })).toBe(false);
    expect(finished({ appInstalled: true, awsAvailable: true, awsConnected: true, hasProjects: true })).toBe(true);
  });

  it("sends the AWS step to the AWS page of Settings, inside the app", () => {
    const aws = setupSteps(none).find((step) => step.id === "aws");
    expect(aws?.action.href).toBe("/settings?section=aws");
    expect(aws?.action.external).toBeUndefined();
  });

  it("does not promise AWS deploys that do not exist yet", () => {
    const aws = setupSteps(none).find((step) => step.id === "aws");
    expect(aws?.detail).toMatch(/arrives in the next phase/);
    expect(aws?.detail).toMatch(/local Docker/);
  });
});
