# Connection and privacy

Playit relays the room's network traffic. Anyone who has the public address can attempt to join, so use a room password when appropriate and share it privately.

KartLink stores the Playit credential using Windows-backed Electron safe storage. The Playit agent needs a plaintext copy while the room is running. KartLink stores it in the current user's application-data directory (or the portable `KartLink-data` folder) and removes it on normal shutdown or on the next startup after an abnormal exit. A local process may see the room password in the server's process arguments.

Disconnecting Playit removes KartLink's local credential. It does not remove the tunnel from the Playit account; manage old tunnels through Playit. Use only accounts and rooms you control.

KartLink checks the public GitHub releases API when it starts and when you request an update check. GitHub receives a standard network request, including your IP address; KartLink does not send your Playit credential or room details. The server log is kept in memory for the current app session and may contain player names, IP addresses, and chat.
