# Roadmap

This roadmap communicates direction, not a promise of dates or scope. Proposals should preserve Subnet Studio's explainable, offline-first identity and avoid turning it into a hosted IPAM service by default.

## Near-term publication quality

- Gather feedback from learners, instructors, and working network engineers.
- Expand cross-platform accessibility testing with screen readers and keyboard-only workflows.
- Add more correctness fixtures from real network-planning edge cases.
- Improve embedded help where first-time users hesitate or misinterpret joins.
- Document classroom and workshop use with ready-made exercises.

## Strong candidate capabilities

- Route summarisation and overlap analysis with visual explanations.
- Import/export formats that interoperate with common network documentation workflows.
- More guided challenges, including intentionally fragmented address spaces.
- Optional installable PWA packaging while preserving the standalone HTML artifact.
- Local-only comparison of alternative VLSM placement heuristics.

## Research topics

- IPv6 visualisation and prefix planning as a separately designed experience, not a mechanical extension of the IPv4 UI.
- Reproducible lesson authoring without allowing untrusted scripts or weakening offline guarantees.
- A documented library boundary for consumers that want the tested CIDR engine without the application UI.

## Deliberately outside the current product

- Live network scanning or discovery.
- Credential storage, cloud-account integration, or automatic infrastructure changes.
- Multi-user hosted workspaces, authentication, and organisational IPAM workflows.
- Runtime telemetry or required network services.
- Legacy-browser support.

These exclusions can be revisited, but each would materially change the security, privacy, maintenance, and product model.

## Proposal criteria

A strong proposal explains:

1. the learner or practitioner problem;
2. why the capability belongs in Subnet Studio instead of a separate IPAM tool;
3. how it remains understandable on mobile and with keyboard navigation;
4. the domain invariants and tests it introduces;
5. its impact on schema-v1 compatibility and the offline artifact contract.
