import { execFile } from "node:child_process";
import type { AgentEvent } from "../core/types.js";
import { formatNotification } from "./macos.js";
import type { AplConfig } from "../cli/configManager.js";

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

    // PowerShell script to trigger standard Windows toast + audible audio playback
    const psScript = `
try {
  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
  $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
  $textNodes = $template.GetElementsByTagName("text")
  $textNodes.Item(0).AppendChild($template.CreateTextNode('${title.replace(/'/g, "''")}')) > $null
  $textNodes.Item(1).AppendChild($template.CreateTextNode('${fullMessage.replace(/'/g, "''")}')) > $null
  $toast = [Windows.UI.Notifications.ToastNotification]::new($template)
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Agent Permission Layer").Show($toast)
} catch {
  # Toast notification fallback
}

# Audio playback: custom audio file or system sound
try {
  ${
    soundFilePath
      ? `if (Test-Path '${soundFilePath.replace(/'/g, "''")}') {
           $ext = [System.IO.Path]::GetExtension('${soundFilePath.replace(/'/g, "''")}').ToLower()
           if ($ext -eq '.wav') {
             # Use SoundPlayer for WAV files
             $player = New-Object System.Media.SoundPlayer '${soundFilePath.replace(/'/g, "''")}'
             $player.PlaySync()
           } else {
             # Use Windows Media Player COM for MP3/other formats
             $player = New-Object -ComObject WMPlayer.OCX
             $player.URL = '${soundFilePath.replace(/'/g, "''")}'
             $player.controls.play()
             # Wait for audio to actually start playing before script exits
             Start-Sleep -Milliseconds 500
             # Poll until playback state indicates audio has started
             $timeout = 0
             while ($player.playState -ne 3 -and $timeout -lt 10) {
               Start-Sleep -Milliseconds 100
               $timeout++
             }
           }
         } else {
           [System.Media.SystemSounds]::Exclamation.Play()
         }`
      : `[System.Media.SystemSounds]::Exclamation.Play()`
  }
} catch {
  Write-Host "[APL] Audio playback failed: $_"
  [System.Media.SystemSounds]::Exclamation.Play()
}
`;

    execFile(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psScript],
      (error) => {
        if (error) {
          console.warn("[notify:windows] Failed to display toast or play audio:", error.message);
          resolve(false);
        } else {
          resolve(true);
        }
      },
    );
  });
}
