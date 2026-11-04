# Validation status

KartLink P2P is under development. On 2026-11-04:

- `npm test`: four checks passed; tunnel provisioning responses are mocked.
- `python tests/local-room.py`: passed two sessions with two real proxy processes, 20 packets and replies per client per session, through the bundled server and a local UDP forwarder. This requires the existing workspace test harness and probe.
- `npm run build`: passed.
- A live unauthenticated Playit `/claim/setup` request returned `WaitingForUserVisit`.
- The packaged Windows app opened and closed normally; the initial screen was rendered and inspected.

On 2026-11-04, the Windows computer-use tool failed to initialize. `npm run test:ui` instead passed six isolated Electron renderer tests covering disconnected, setup, progress, ready, and error screens, room controls, the guide, and minimum-size layout. The renderer tests use a mock backend. `npm test` passed twelve API, recovery and startup checks, and `python tests/local-room.py` passed two sessions with two clients.

The user authorized a Playit agent and reproduced `TunnelTypeRequiresDescription`, followed by `AgentVersionTooOld` and an address-allocation delay. After adding the description, starting the agent first, and waiting for allocation, Playit supplied a public IP and port. The existing `test_remote_room.py` harness then passed two sessions through that public Playit endpoint: two lightweight processes each exchanged 20 packets and replies per session. Both clients ran on the same physical PC as the host, through a local UDP forwarder; this is not a second-PC or game test. Those remain outstanding.
