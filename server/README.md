# Room server logging change

`yuzu_room_standalone.cpp` starts the existing Eden room server with stdout and stderr unbuffered. The server protocol is unchanged. KartLink can therefore receive the room server's join and departure logs while the process runs.

On Windows, `python server/build_server.py --build-dir <matching-cmake-build>` compiles this entry point and links it against the existing Eden room libraries. A matching configured Eden build, Ninja, and Visual Studio C++ build tools are required; `--vsdevcmd` can select the Visual Studio environment. The output goes into `server/build`, leaving the source tree and original server executable intact.

For a corresponding GPL source archive, download the original room-server source ZIP from the 1.0.2 release and run `python server/package_source.py --upstream <archive> --output <new-archive>`. This substitutes the changed entry point into a new archive without changing the original.
