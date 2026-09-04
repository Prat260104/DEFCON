import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, unlinkSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { execFile, exec } from "node:child_process";
import type { AgentEvent, RiskLevel } from "../core/types.js";
import { getDefaultSoundsDir, type AplConfig, type SoundTier } from "../cli/configManager.js";

export const SUPPORTED_AUDIO_EXTENSIONS = [".mp3", ".wav", ".aiff", ".aif", ".ogg", ".m4a"] as const;

export const BUILT_IN_MACOS_SOUNDS = [
  "Pop",
  "Ping",
  "Sosumi",
  "Basso",
  "Hero",
  "Purr",
  "Funk",
  "Blow",
  "Bottle",
  "Frog",
  "Glass",
  "Morse",
  "Tink",
] as const;

export const DEFAULT_RISK_SOUND_MAP: Record<RiskLevel, string> = {
  low: "Pop",
  medium: "Ping",
  high: "Sosumi",
};

export const MAX_AUDIO_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Validate whether a file exists, has a supported audio extension, and is within size limits.
 */
export function validateAudioFile(filePath: string): { valid: boolean; error?: string } {
  if (!filePath || typeof filePath !== "string") {
    return { valid: false, error: "File path must be a non-empty string" };
  }

  if (!existsSync(filePath)) {
    return { valid: false, error: `File does not exist: ${filePath}` };
  }

  const ext = extname(filePath).toLowerCase();
  if (!SUPPORTED_AUDIO_EXTENSIONS.includes(ext as any)) {
    return {
      valid: false,
      error: `Unsupported audio format "${ext}". Supported formats: ${SUPPORTED_AUDIO_EXTENSIONS.join(", ")}`,
    };
  }

  try {
    const stats = statSync(filePath);
    if (!stats.isFile()) {
      return { valid: false, error: `Path is not a regular file: ${filePath}` };
    }
    if (stats.size > MAX_AUDIO_FILE_SIZE_BYTES) {
      return {
        valid: false,
        error: `Audio file exceeds maximum size limit (25MB): ${(stats.size / (1024 * 1024)).toFixed(1)}MB`,
      };
    }
  } catch (err) {
    return { valid: false, error: `Failed to inspect file stats: ${(err as Error).message}` };
  }

  return { valid: true };
}

/**
 * Sanitize a sound asset name (strip unsafe filesystem characters).
 */
export function sanitizeSoundName(rawName: string): string {
  return rawName
    .replace(/[^a-zA-Z0-9_\-\.]/g, "_")
    .replace(/^_+|_+$/g, "")
    .trim();
}

/**
 * Import an audio file into the local APL sounds repository (~/.apl/sounds/).
 */
export function importSoundFile(
  sourcePath: string,
  customName?: string,
  soundsDir: string = getDefaultSoundsDir()
): { success: boolean; destPath?: string; soundName?: string; error?: string } {
  const validation = validateAudioFile(sourcePath);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    if (!existsSync(soundsDir)) {
      mkdirSync(soundsDir, { recursive: true });
    }

    const sourceExt = extname(sourcePath).toLowerCase();
    let base = customName ? customName.trim() : basename(sourcePath, extname(sourcePath));
    if (extname(base).toLowerCase() === sourceExt) {
      base = basename(base, sourceExt);
    }
    const cleanBase = sanitizeSoundName(base) || "custom_alert";
    const finalFilename = `${cleanBase}${sourceExt}`;
    const destPath = join(soundsDir, finalFilename);

    copyFileSync(sourcePath, destPath);

    return {
      success: true,
      destPath,
      soundName: cleanBase,
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to copy sound file into ${soundsDir}: ${(err as Error).message}`,
    };
  }
}

export interface CustomSoundAsset {
  name: string;
  filename: string;
  path: string;
  sizeBytes: number;
  extension: string;
}

/**
 * List all available built-in system sounds and imported custom sound assets.
 */
export function listSoundAssets(soundsDir: string = getDefaultSoundsDir()): {
  builtIn: readonly string[];
  custom: CustomSoundAsset[];
} {
  const custom: CustomSoundAsset[] = [];

  if (existsSync(soundsDir)) {
    try {
      const files = readdirSync(soundsDir);
      for (const file of files) {
        const ext = extname(file).toLowerCase();
        if (SUPPORTED_AUDIO_EXTENSIONS.includes(ext as any)) {
          const fullPath = join(soundsDir, file);
          try {
            const stats = statSync(fullPath);
            if (stats.isFile()) {
              custom.push({
                name: basename(file, ext),
                filename: file,
                path: fullPath,
                sizeBytes: stats.size,
                extension: ext,
              });
            }
          } catch {
            // Ignore unreadable entries
          }
        }
      }
    } catch {
      // Ignore unreadable dir
    }
  }

  return {
    builtIn: BUILT_IN_MACOS_SOUNDS,
    custom,
  };
}

/**
 * Remove a custom sound asset from the sounds directory.
 */
export function removeSoundAsset(
  soundNameOrFilename: string,
  soundsDir: string = getDefaultSoundsDir()
): { success: boolean; error?: string } {
  if (!existsSync(soundsDir)) {
    return { success: false, error: "Sounds directory does not exist" };
  }

  const { custom } = listSoundAssets(soundsDir);
  const target = custom.find(
    (item) =>
      item.name.toLowerCase() === soundNameOrFilename.toLowerCase() ||
      item.filename.toLowerCase() === soundNameOrFilename.toLowerCase()
  );

  if (!target) {
    return { success: false, error: `Sound asset not found: ${soundNameOrFilename}` };
  }

  try {
    unlinkSync(target.path);
    return { success: true };
  } catch (err) {
    return { success: false, error: `Failed to delete sound asset: ${(err as Error).message}` };
  }
}

/**
 * Resolve the appropriate sound file path and sound name for an event according to priority:
 *
 * For stall alerts:
 * 1. Optional per-level custom sound (e.g. customSounds["stall-level-2"])
 * 2. Universal custom stall sound (customSounds.stall) — plays consistently at EVERY escalation level (1, 2, 3+) by default
 * 3. Fall back to built-in escalating acoustic sequence (only when NO custom stall sound is configured):
 *    - Alert 3+ (escalationLevel >= 3): Basso (maximum urgency)
 *    - Alert 2 (escalationLevel == 2): Sosumi (high urgency)
 *    - Alert 1 (escalationLevel == 1): Tier-specific sound (tier custom -> global custom -> Pop/Ping/Sosumi)
 *
 * For non-stall events:
 * 1. Tier-specific custom sound (customSounds[riskLevel])
 * 2. Global custom sound (customSoundPath)
 * 3. Tier-configured built-in sound (sounds[riskLevel])
 * 4. System risk-level default (Pop/Ping/Sosumi)
 */
export function resolveSoundForEvent(
  event: AgentEvent,
  config: AplConfig
): { soundName: string; soundFilePath: string | null } {
  const risk = event.riskLevel ?? "medium";
  const isStall = Boolean(event.metadata?.["isStallAlert"]) || Boolean(event.metadata?.["isWhitelistDrift"]);
  const escalationLevel = event.metadata?.["escalationLevel"] as number | undefined;

  const customSounds = config.notifications?.customSounds;
  const globalCustom = config.notifications?.customSoundPath;

  if (isStall) {
    // 1. Optional per-level custom sound override (e.g. stall-level-2, stall-level-3)
    if (escalationLevel !== undefined) {
      const levelKey = `stall-level-${escalationLevel}` as SoundTier;
      const levelCustomSound = customSounds?.[levelKey];
      if (typeof levelCustomSound === "string" && existsSync(levelCustomSound)) {
        return {
          soundName: basename(levelCustomSound, extname(levelCustomSound)),
          soundFilePath: levelCustomSound,
        };
      }
    }

    // 2. Custom stall sound configured via sound manager:
    // Plays at EVERY escalation level (1, 2, and 3+) by default — consistency is expected
    if (customSounds?.stall && existsSync(customSounds.stall)) {
      return {
        soundName: basename(customSounds.stall, extname(customSounds.stall)),
        soundFilePath: customSounds.stall,
      };
    }

    // 3. Fall back to built-in escalating sound sequence only when NO custom stall sound is set:
    if (escalationLevel !== undefined) {
      // Alert 3+: Maximum-urgency acoustic tone (Basso)
      if (escalationLevel >= 3) {
        const soundFilePath = existsSync("/System/Library/Sounds/Basso.aiff") ? "/System/Library/Sounds/Basso.aiff" : null;
        return { soundName: "Basso", soundFilePath };
      }

      // Alert 2: High-urgency alert (Sosumi)
      if (escalationLevel === 2) {
        const soundFilePath = existsSync("/System/Library/Sounds/Sosumi.aiff") ? "/System/Library/Sounds/Sosumi.aiff" : null;
        return { soundName: "Sosumi", soundFilePath };
      }
    }

    // Alert 1 (or unescalated stall): Standard tier sound (tier custom -> global custom -> built-in tier default)
    if (customSounds?.[risk] && existsSync(customSounds[risk]!)) {
      return {
        soundName: basename(customSounds[risk]!, extname(customSounds[risk]!)),
        soundFilePath: customSounds[risk]!,
      };
    }
    if (globalCustom && existsSync(globalCustom)) {
      return {
        soundName: basename(globalCustom, extname(globalCustom)),
        soundFilePath: globalCustom,
      };
    }
    const soundName = config.notifications?.sounds?.[risk] || DEFAULT_RISK_SOUND_MAP[risk] || "Pop";
    const soundFilePath = existsSync(`/System/Library/Sounds/${soundName}.aiff`) ? `/System/Library/Sounds/${soundName}.aiff` : null;
    return { soundName, soundFilePath };
  }

  // Non-stall normal event:
  // 1. Tier-specific custom sound
  if (customSounds?.[risk] && existsSync(customSounds[risk]!)) {
    return {
      soundName: basename(customSounds[risk]!, extname(customSounds[risk]!)),
      soundFilePath: customSounds[risk]!,
    };
  }

  // 2. Global custom sound
  if (globalCustom && existsSync(globalCustom)) {
    return {
      soundName: basename(globalCustom, extname(globalCustom)),
      soundFilePath: globalCustom,
    };
  }

  // 3. Built-in sounds
  let soundName = config.notifications?.sounds?.[risk] || DEFAULT_RISK_SOUND_MAP[risk] || "Sosumi";
  let soundFilePath: string | null = `/System/Library/Sounds/${soundName}.aiff`;
  if (!existsSync(soundFilePath)) {
    soundFilePath = null;
  }

  return { soundName, soundFilePath };
}

/**
 * Play an audio file or built-in system sound across macOS, Windows, and Linux.
 * Resolves safely; errors are caught and logged without throwing.
 */
export async function playAudio(filePathOrBuiltin: string): Promise<boolean> {
  return new Promise((resolve) => {
    let targetPath = filePathOrBuiltin;

    // Check if it's a macOS built-in sound name
    if (!existsSync(targetPath)) {
      const systemSoundPath = `/System/Library/Sounds/${filePathOrBuiltin}.aiff`;
      if (existsSync(systemSoundPath)) {
        targetPath = systemSoundPath;
      }
    }

    const platform = process.platform;

    if (platform === "darwin") {
      if (!existsSync(targetPath)) {
        console.warn(`[soundManager] Sound target not found: ${filePathOrBuiltin}`);
        resolve(false);
        return;
      }
      execFile("afplay", [targetPath], (error) => {
        if (error) {
          console.warn(`[soundManager] afplay playback failed: ${error.message}`);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    } else if (platform === "win32") {
      // Windows audio playback using PowerShell SoundPlayer / MediaPlayer
      const escapedPath = targetPath.replace(/'/g, "''");
      const psScript = existsSync(targetPath)
        ? `try {
             Add-Type -AssemblyName PresentationCore
             $player = New-Object System.Windows.Media.MediaPlayer
             $player.Open([System.Uri]::new('${escapedPath}'))
             $player.Play()
             Start-Sleep -Milliseconds 1500
           } catch {
             try {
               $sp = New-Object System.Media.SoundPlayer '${escapedPath}'
               $sp.PlaySync()
             } catch {
               [System.Media.SystemSounds]::Exclamation.Play()
             }
           }`
        : `[System.Media.SystemSounds]::Exclamation.Play()`;

      execFile("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psScript], (error) => {
        if (error) {
          console.warn(`[soundManager] Windows audio playback failed: ${error.message}`);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    } else if (platform === "linux") {
      // Linux audio playback using PulseAudio, PipeWire, ALSA, mpv, or ffplay
      if (existsSync(targetPath)) {
        const playCmd = `(paplay "${targetPath}" || pw-play "${targetPath}" || aplay "${targetPath}" || mpv --no-video "${targetPath}" || ffplay -nodisp -autoexit "${targetPath}") 2>/dev/null &`;
        exec(playCmd, (error) => {
          if (error) {
            process.stdout.write("\x07");
          }
          resolve(true);
        });
      } else {
        // Fallback Linux system sounds or terminal bell
        const systemSoundPaths = [
          "/usr/share/sounds/freedesktop/stereo/dialog-warning.oga",
          "/usr/share/sounds/freedesktop/stereo/bell.oga",
          "/usr/share/sounds/sound-icons/prompt.wav",
        ];
        let played = false;
        for (const p of systemSoundPaths) {
          if (existsSync(p)) {
            exec(`(paplay "${p}" || pw-play "${p}" || aplay "${p}") 2>/dev/null &`, () => {});
            played = true;
            break;
          }
        }
        if (!played) {
          process.stdout.write("\x07");
        }
        resolve(true);
      }
    } else {
      process.stdout.write("\x07");
      resolve(true);
    }
  });
}
