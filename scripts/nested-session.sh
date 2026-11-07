#!/usr/bin/env bash
# Start a clean nested GNOME Shell without restarting the real desktop.
set -euo pipefail

major="$(gnome-shell --version | grep -o -E '[0-9]+' | head -n 1)"

# IDEs packaged as Snap can export private, outdated schemas and libraries.
# A nested system GNOME Shell must use the host distribution environment.
unset GSETTINGS_SCHEMA_DIR GTK_PATH GTK_EXE_PREFIX GTK_IM_MODULE_FILE
unset GDK_PIXBUF_MODULEDIR GDK_PIXBUF_MODULE_FILE GIO_MODULE_DIR GIO_EXTRA_MODULES
unset LD_LIBRARY_PATH
while IFS='=' read -r name _; do
  [[ "$name" == SNAP* ]] && unset "$name"
done < <(env)
export XDG_DATA_DIRS="${XDG_DATA_DIRS_VSCODE_SNAP_ORIG:-/usr/local/share:/usr/share:/var/lib/snapd/desktop}"
unset XDG_DATA_DIRS_VSCODE_SNAP_ORIG GIO_LAUNCHED_DESKTOP_FILE GIO_LAUNCHED_DESKTOP_FILE_PID

if (( major >= 49 )); then
  if [[ ! -x /usr/libexec/mutter-devkit && ! -x /usr/lib/mutter-devkit ]]; then
    echo "GNOME $major nested development requires mutter-dev-bin on Ubuntu." >&2
    echo "Install it once with: sudo apt install mutter-dev-bin" >&2
    exit 1
  fi
  exec dbus-run-session -- env \
    MUTTER_DEBUG_NUM_DUMMY_MONITORS=1 \
    MUTTER_DEBUG_DUMMY_MODE_SPECS=1920x1080 \
    gnome-shell --devkit --wayland
fi

exec dbus-run-session -- env \
  MUTTER_DEBUG_NUM_DUMMY_MONITORS=1 \
  MUTTER_DEBUG_DUMMY_MODE_SPECS=1920x1080 \
  gnome-shell --nested --wayland