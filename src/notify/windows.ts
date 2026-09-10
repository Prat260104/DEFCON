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
           $player = New-Object System.Media.SoundPlayer '${soundFilePath.replace(/'/g, "''")}'
           $player.Play()
         } else {
           [System.Media.SystemSounds]::Exclamation.Play()
         }`
      : `[System.Media.SystemSounds]::Exclamation.Play()`
  }
} catch {
  # Audio fallback non-fatal
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
