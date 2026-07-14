import { describe, expect, it } from "vitest";
import { validateCidrForProfile, validateProfileSelection } from "../src/profiles";
import { profileFor } from "../src/profiles";

describe("provider profile boundaries", () => {
  const cases = [
    ["azure", 2, 29, 1, 30],
    ["aws", 16, 28, 15, 29],
    ["gcp", 4, 29, 3, 30],
  ] as const;

  it.each(cases)("enforces %s prefix range", (id, minimum, maximum, tooLarge, tooSmall) => {
    const profile = profileFor(id);
    expect(validateCidrForProfile({ network: 0, prefix: minimum }, profile)).toBeNull();
    expect(validateCidrForProfile({ network: 0, prefix: maximum }, profile)).toBeNull();
    expect(validateCidrForProfile({ network: 0, prefix: tooLarge }, profile)).not.toBeNull();
    expect(validateCidrForProfile({ network: 0, prefix: tooSmall }, profile)).not.toBeNull();
  });

  it("models provider reservations correctly", () => {
    expect(profileFor("azure")).toMatchObject({ reservedHead: 4, reservedTail: 1 });
    expect(profileFor("aws")).toMatchObject({ reservedHead: 4, reservedTail: 1 });
    expect(profileFor("gcp")).toMatchObject({ reservedHead: 2, reservedTail: 2 });
  });

  it("rejects altered preset definitions", () => {
    expect(validateProfileSelection({ ...profileFor("aws"), reservedHead: 0 })).toContain("AWS");
    expect(validateProfileSelection({ ...profileFor("gcp"), minPrefixLength: 0 })).toContain("GCP");
  });
});
