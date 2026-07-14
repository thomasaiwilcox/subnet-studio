import { describe, expect, it } from "vitest";
import {
  blockSize,
  canonicalNetwork,
  endAddress,
  intToIp,
  ipToInt,
  maskInt,
  parseCidr,
  subnetDetails,
} from "../src/cidr";
import { profileFor } from "../src/profiles";

describe("IPv4 CIDR calculations", () => {
  it("round-trips unsigned IPv4 boundaries", () => {
    for (const ip of ["0.0.0.0", "10.0.0.1", "192.168.255.254", "255.255.255.255"]) {
      expect(intToIp(ipToInt(ip))).toBe(ip);
    }
  });

  it("calculates every prefix without signed-shift errors", () => {
    for (let prefix = 0; prefix <= 32; prefix += 1) {
      const size = blockSize(prefix);
      expect(size).toBe(2 ** (32 - prefix));
      expect(canonicalNetwork(2 ** 32 - 1, prefix) % size).toBe(0);
      expect(maskInt(prefix)).toBe(2 ** 32 - size);
    }
  });

  it("handles /0, /31 and /32 explicitly", () => {
    const none = profileFor("none");
    const zero = subnetDetails(parseCidr("0.0.0.0/0"), none);
    expect(zero.mask).toBe("0.0.0.0");
    expect(zero.broadcast).toBe("255.255.255.255");
    expect(endAddress(parseCidr("0.0.0.0/0"))).toBe(2 ** 32 - 1);

    const pointToPoint = subnetDetails(parseCidr("192.0.2.0/31"), none);
    expect(pointToPoint.usable).toBe(2);
    expect(pointToPoint.broadcast).toBeNull();
    expect(pointToPoint.usableStart).toBe("192.0.2.0");

    const host = subnetDetails(parseCidr("192.0.2.1/32"), none);
    expect(host.usable).toBe(1);
    expect(host.broadcast).toBeNull();
    expect(host.usableStart).toBe("192.0.2.1");
    expect(host.usableEnd).toBe("192.0.2.1");
  });

  it("rejects non-canonical and malformed CIDRs", () => {
    expect(() => parseCidr("192.168.1.1/24")).toThrow("use 192.168.1.0/24");
    expect(() => parseCidr("999.1.1.1/24")).toThrow();
    expect(() => parseCidr("192.168.1.0/33")).toThrow();
  });
});
