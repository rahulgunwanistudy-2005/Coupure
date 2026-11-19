# Draft: regtest chain-backend loss and observability

Status: maintainer-facing draft, not submitted. Reproduce against the exact current LND release before opening an issue. Confirm whether this is already documented or tracked.

The existing G1 notes record `getinfo` blocking during an intentional bitcoind-backend outage, while peer/channel queries remained responsive. Coupure therefore probes the uplink independently and disables the chain-backend shutdown health check for its isolated regtest demo.

Proposed report contents:

- Exact LND/Bitcoin image IDs and host architecture.
- Minimal two-network Compose reproduction with RPC/ZMQ disconnected, not a UI-only offline flag.
- Timed commands for getinfo, listpeers and listchannels before, during and after the cut.
- Sanitized logs without RPC credentials or macaroons.
- A question about a recommended bounded-time health signal while chain RPC is unavailable.

Do not describe a fix, upstream contribution or confirmed regression until the reproduction and maintainer response exist.
