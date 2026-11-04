<p align="center"><img src="assets/kartlink.jpg" alt="KartLink" width="320"></p>

<h1 align="center">KartLink P2P</h1>

<p align="center">Host an Eglantine room for friends using Playit.</p>

## Download

Download **KartLink-P2P-1.0.1.exe** from the [experimental Windows release](https://github.com/js664/KartLink-P2P/releases/tag/v1.0.1) and open it on Windows x64. No installer or Eglantine patch is required. The build is unsigned; Windows may show a warning.

## Play

1. **Host:** Open KartLink P2P, connect Playit, and create a room. Send your friends the address, port, and password, if set. Keep the app open.
2. **Everyone:** In Eglantine, open **Emulation → Configure → Network** and uncheck **Enable Airplane Mode**. Menu names may differ between forks.
3. **Everyone:** Select **Multiplayer → Direct Connect to Room** in Eglantine. The host uses `127.0.0.1` and port `6009`; friends use the address and port shown in KartLink.
4. **Everyone:** In Mario Kart World’s mode menu, hold **L + R** and click the **left stick** to switch Wireless Play to LAN Play. One player creates the game lobby; the others join it.

The app includes these instructions under **How to play**. Playit may require an account and impose tunnel limits or fees. Compatible game and emulator versions are required.

## Build

Install Node.js, then run `npm ci`, `npm test`, `npm run build`, and `npm start`. Run `npm run package` to build a portable Windows executable. The [release](https://github.com/js664/KartLink-P2P/releases/tag/v1.0.1) also contains the matching room-server source snapshot.

See [TESTING.md](TESTING.md) for test results and outstanding work, and [PRIVACY.md](PRIVACY.md) for how credentials and room access are handled. The app is GPL-3.0-or-later; the bundled Playit agent has its own [license](resources/LICENSE-Playit.txt).
