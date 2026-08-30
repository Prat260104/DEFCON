import { execFile, exec } from "node:child_process";
import { existsSync } from "node:fs";
import type { AgentEvent } from "../core/types.js";
import { formatNotification } from "./macos.js";

/**
 * Play audio on Linux using paplay (PulseAudio), pw-play (PipeWire), or aplay (ALSA).
 * Never throws — failures log and resolve safely.
 */
function playLinuxSound(soundFilePath: string | null): void {
  // If custom or built-in file is specified and exists, play it
  if (soundFilePath && existsSync(soundFilePath)) {
    const playCmd = `(paplay "${soundFilePath}" || pw-play "${soundFilePath}" || aplay "${soundFilePath}") 2>/dev/null &`;
    exec(playCmd, () => {});
    return;
  }

  // Fallback to standard freedesktop system sound or terminal bell
  const systemSoundPaths = [
    "/usr/share/sounds/freedesktop/stereo/dialog-warning.oga",
    "/usr/share/sounds/freedesktop/stereo/bell.oga",
    "/usr/share/sounds/sound-icons/prompt.wav",
  ];

  for (const path of systemSoundPaths) {
    if (existsSync(path)) {
      const playCmd = `(paplay "${path}" || pw-play "${path}" || aplay "${path}") 2>/dev/null &`;
      exec(playCmd, () => {});
      return;
    }
  }

  // Terminal bell fallback
  process.stdout.write("\x07");
}

/**
 * Linux desktop notification using `notify-send` + audio playback.
 * Uses critical urgency for high-risk commands.
 */
export async function sendLinuxNotification(event: AgentEvent): Promise<boolean> {
  return new Promise((resolve) => {
    const { title, subtitle, body, soundFilePath } = formatNotification(event);
    const urgency = event.riskLevel === "high" ? "critical" : event.riskLevel === "medium" ? "normal" : "low";

    // Trigger audible audio playback
    playLinuxSound(soundFilePath);

    const args = [
      "-a", "Agent Permission Layer",
      "-u", urgency,
      title,
      `${subtitle}\n${body}`,
    ];

    execFile("notify-send", args, (error) => {
      if (error) {
        console.warn("[notify:linux] notify-send not available or failed:", error.message);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}
