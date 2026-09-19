import { execFile } from "node:child_process";
import { normalize } from "node:path";
import type { AgentEvent } from "../core/types.js";
import { formatNotification } from "./macos.js";
import type { AplConfig } from "../cli/configManager.js";

/**
 * Escape PowerShell string for safe injection into single-quoted strings.
 * Handles: single quotes, dollar signs, backticks, backslashes
 */
function escapePowerShellPath(path: string): string {
  // Normalize to forward slashes (PowerShell accepts both)
  const normalized = normalize(path).replace(/\\/g, "/");
  // Escape single quotes by doubling them
  return normalized.replace(/'/g, "''");
}

/**
 * Windows toast notification implementation using PowerShell.
 */
export async function sendWindowsNotification(
  event: AgentEvent,
  configOverride?: AplConfig,
): Promise<boolean> {
  return new Promise((resolve) => {
    const { title, subtitle, body, soundFilePath } = formatNotification(event, configOverride);
    const fullMessage = `${subtitle}\n${body}`;

    // Escape all text for PowerShell injection
    const escapedTitle = title.replace(/'/g, "''");
    const escapedMessage = fullMessage.replace(/'/g, "''");

    // PowerShell script to trigger standard Windows toast + audible audio playback
    const psScript = `
try {
  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
  $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
  $textNodes = $template.GetElementsByTagName("text")
  $textNodes.Item(0).AppendChild($template.CreateTextNode('${escapedTitle}')) > $null
  $textNodes.Item(1).AppendChild($template.CreateTextNode('${escapedMessage}')) > $null
  $toast = [Windows.UI.Notifications.ToastNotification]::new($template)
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Agent Permission Layer").Show($toast)
} catch {
  # Toast notification fallback (silent)
}

# Audio playback: custom audio file or system sound
try {
  ${
    soundFilePath
      ? `if (Test-Path '${escapePowerShellPath(soundFilePath)}') {
           $ext = [System.IO.Path]::GetExtension('${escapePowerShellPath(soundFilePath)}').ToLower()
           
           if ($ext -eq '.wav') {
             # WAV files: Use SoundPlayer (synchronous, reliable)
             $player = New-Object System.Media.SoundPlayer '${escapePowerShellPath(soundFilePath)}'
             $player.PlaySync()
           } else {
             # MP3/WMA/other: Use WPF MediaPlayer (.NET Framework, modern)
             Add-Type -AssemblyName PresentationCore
             $player = New-Object System.Windows.Media.MediaPlayer
             $player.Open([System.Uri]::new('${escapePowerShellPath(soundFilePath)}'))
             $player.Play()
             
             # Wait for media to load and start playing
             Start-Sleep -Milliseconds 300
             
             # Poll playback state with timeout
             $timeout = 0
             while ($player.NaturalDuration.HasTimeSpan -eq $false -and $timeout -lt 15) {
               Start-Sleep -Milliseconds 100
               $timeout++
             }
             
             # If loaded successfully, wait for playback to actually start
             if ($player.NaturalDuration.HasTimeSpan) {
               Start-Sleep -Milliseconds 200
             }
           }
         } else {
           # File not found, use system sound
           [System.Media.SystemSounds]::Exclamation.Play()
         }`
      : `[System.Media.SystemSounds]::Exclamation.Play()`
  }
} catch {
  # Audio playback failed, fallback to system sound
  try {
    [System.Media.SystemSounds]::Exclamation.Play()
  } catch {
    # Complete silence if even system sound fails
  }
}
`;

    execFile(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psScript],
      (error, stdout, stderr) => {
        if (error) {
          console.warn("[notify:windows] PowerShell execution failed:", error.message);
          if (stderr) console.warn("[notify:windows] stderr:", stderr);
          resolve(false);
        } else {
          if (stdout && stdout.trim()) {
            console.log("[notify:windows] stdout:", stdout.trim());
          }
          resolve(true);
        }
      },
    );
  });
}
