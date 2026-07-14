import { describe, expect, it } from "vitest";
import { parsePlan } from "../src/planner";
import { customProfile, profileFor } from "../src/profiles";

describe("plan request parsing", () => {
  it("supports prefixes, counts and host requirements", () => {
    const result = parsePlan("Web: /26 x2\nDatabase: hosts=50\nprefix=28", profileFor("none"));
    expect(result.errors).toEqual([]);
    expect(result.requests).toMatchObject([
      { label: "Web", prefix: 26, count: 2 },
      { label: "Database", prefix: 26, count: 1, requestedHosts: 50 },
      { label: "", prefix: 28, count: 1 },
    ]);
  });

  it("accounts for custom reservations when sizing hosts", () => {
    const result = parsePlan("Service: hosts=12", customProfile(2, 2));
    expect(result.requests[0]?.prefix).toBe(28);
  });

  it("reports every invalid line", () => {
    const result = parsePlan("nonsense\n/99\n/26 x0", profileFor("none"));
    expect(result.requests).toEqual([]);
    expect(result.errors).toHaveLength(3);
  });
});
