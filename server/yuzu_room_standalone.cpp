// SPDX-FileCopyrightText: Copyright 2025 Eden Emulator Project
// SPDX-License-Identifier: GPL-3.0-or-later
// KartLink keeps the room server's stdout unbuffered so player events reach the UI immediately.
#include <cstdio>
#include "dedicated_room/yuzu_room.h"
int main(int argc, char* argv[]) {
    std::setvbuf(stdout, nullptr, _IONBF, 0);
    std::setvbuf(stderr, nullptr, _IONBF, 0);
    LaunchRoom(argc, argv, false);
}
