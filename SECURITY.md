# Security policy

## Supported versions

Security and privacy fixes are applied to the latest released version. Historical files under `downloaded-site/` are preserved references and are not supported production software.

## Reporting a vulnerability

Please do not open a public issue for a vulnerability that could execute code, expose user data, bypass import validation, create an unexpected network request, or corrupt a workspace.

After the GitHub repository is created, use **Security → Report a vulnerability** to open a private security advisory. Include:

- the affected version or commit;
- a minimal reproduction;
- the expected and actual behaviour;
- the security or privacy impact;
- any suggested mitigation, if known.

You should receive an acknowledgement within seven days. Please allow time for investigation and a coordinated fix before public disclosure.

## Security model

Subnet Studio is a client-side application with no server, authentication, telemetry, or background network requests. Its primary security boundaries are untrusted imported JSON/share data, user-provided labels, generated reports and images, browser-local autosave, and the standalone build artifact.

User-controlled text must never be inserted through `innerHTML`. Imported state must pass complete schema and domain validation before application. Generated reports and exports must remain inert when labels contain markup-like input.

Calculation errors are important, but normally not security vulnerabilities. Report them with the dedicated CIDR correctness issue form unless they also cross one of the boundaries above.

## Operational disclaimer

Always verify plans against current provider and organisational requirements before changing production networks. Provider profiles model documented prefix bounds and reservation counts, not all service-specific restrictions.
