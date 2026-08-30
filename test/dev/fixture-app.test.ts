import request from "supertest";
import { describe, expect, it } from "vitest";

import { createFixtureApp } from "../../src/dev/fixture-app.js";

describe("fixture development app", () => {
  const app = createFixtureApp(3_600_000);

  it("starts without GitHub credentials", async () => {
    await request(app).get("/healthz").expect(200).expect({ ok: true });
  });

  it("evaluates badges through deterministic GitHub fixtures", async () => {
    const response = await request(app).get("/github/example/project/info.json").expect(200);

    expect(response.body.badges).toHaveLength(12);
    expect(response.body.badges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ badgeId: "immutable-releases", result: "enabled" }),
        expect.objectContaining({ badgeId: "secret-push-protection-enabled", result: "disabled" }),
        expect.objectContaining({ badgeId: "community-health", result: "75/100" })
      ])
    );
  });

  it("renders fixture badge SVGs", async () => {
    const response = await request(app)
      .get("/github/example/project/sha-pinning-required.svg")
      .expect(200)
      .expect("Content-Type", /image\/svg\+xml/);

    const svg = response.text ?? response.body.toString("utf8");
    expect(svg).toContain("SHA pinning");
    expect(svg).toContain("enabled");
  });

  it("does not expose the authenticated webhook route", async () => {
    await request(app)
      .post("/github/webhook")
      .send({ zen: "Keep it logically awesome." })
      .expect(404);
  });
});
