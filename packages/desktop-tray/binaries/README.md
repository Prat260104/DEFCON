# Desktop Tray Binaries

This directory contains pre-compiled desktop tray binaries for different platforms.

## Directory Structure

```
binaries/
├── macos/
│   └── defcon-tray          (macOS binary)
├── windows/
│   └── defcon-tray.exe      (Windows binary)
└── linux/
    └── defcon-tray          (Linux binary)
```

## Building Binaries

Binaries are automatically built via GitHub Actions on each release.

To build manually:

```bash
# macOS
cd packages/desktop-tray/src-tauri
cargo build --release --target x86_64-apple-darwin
cp target/x86_64-apple-darwin/release/defcon-tray ../binaries/macos/

# Windows (requires Windows or cross-compile)
cargo build --release --target x86_64-pc-windows-msvc
cp target/x86_64-pc-windows-msvc/release/defcon-tray.exe ../binaries/windows/

# Linux
cargo build --release --target x86_64-unknown-linux-gnu
cp target/x86_64-unknown-linux-gnu/release/defcon-tray ../binaries/linux/
```

## Platform Support

- **macOS**: x86_64 (Intel) and arm64 (Apple Silicon) via Rosetta
- **Windows**: x86_64 (64-bit)
- **Linux**: x86_64 (most distributions)

## Note

If binaries are not present, DEFCON will run in terminal-only mode with full CLI functionality.
