# Three-minute demo and shot list

Record only after `make g0`, `make partition`, `make e2e` and the measured workload pass on the revision being filmed. Use real stack output, not animated success screens. Never film `.env`, the operator code, seed words or macaroons.

| Time | Picture and action | French narration / English subtitle |
|---|---|---|
| 0:00–0:20 | Original title over the market-board screen; optionally show a properly attributed, licensed news headline | « Quand les données mobiles sont coupées, payer devient difficile. » / “When mobile data is shut down, paying becomes difficult.” |
| 0:20–0:40 | Show the box and its Wi-Fi; top up the buyer from the labelled simulated sender | « La mint est ici, dans le marché. » / “The mint is here, inside the market.” |
| 0:40–1:05 | Buyer pays stall A-01; show the real PAYÉ receipt and the buyer's claimed status | « La vendeuse reçoit de nouvelles pièces vérifiées. » / “The seller receives newly verified coins.” |
| 1:05–1:20 | Operator cuts WAN; hold on ÎLOT, inactive Lightning channels and a working local wallet | « Ce relais est vraiment coupé. Le réseau local reste vivant. » / “The uplink really is cut. The local network stays alive.” |
| 1:20–1:40 | Buyer makes another payment to A-01, then pastes the exact same token to B-07; linger on DÉJÀ DÉPENSÉ | « Même sans internet, ces pièces ne paient pas deux étals. » / “Even without internet, these coins cannot pay two stalls.” |
| 1:40–2:05 | Queue a regtest Lightning withdrawal, restore WAN, show QUEUED → SETTLED and the board | « Au retour du lien, la boîte règle le retrait en Lightning. » / “When the link returns, the box settles the withdrawal over Lightning.” |
| 2:05–2:25 | Show a provisional T2 receipt beside its distinct spendable balance; return to Wi-Fi and confirm | « Hors de portée, le risque est explicite et plafonné au total. » / “Out of range, the risk is explicit and capped in aggregate.” |
| 2:25–2:45 | Real generated metrics and a compact security boundary diagram | Read the measured replay and latency numbers only if generated on this revision. Explain custody, the T2 risk, and the channel-only reserve display. |
| 2:45–3:00 | Public repository and pilot ask | « Un marché. Une boîte. Le commerce continue. Nous cherchons un pilote à Dakar. » / “One market. One box. Commerce continues. We are looking for a Dakar pilot.” |

Use a desktop screen capture for readable balances and physical phone footage for the cable moment. Keep mobile data disabled during the island shot. The world sender, world receiver and miner are regtest demo helpers and must be labelled SIMULATED. Do not substitute a browser offline switch for the T1 WAN cut; the browser switch demonstrates only the separate T2 out-of-range case.

No physical Pi, measured battery life, public deployment or video was available during this implementation pass. Add the real recording and live URL before submitting.
