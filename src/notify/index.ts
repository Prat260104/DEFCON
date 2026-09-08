import type { AgentEvent } from "../core/types.js";
import { sendMacNotification } from "./macos.js";
import { sendWindowsNotification } from "./windows.js";
import { sendLinuxNotification } from "./linux.js";

/**
 * Cross-platform notification dispatcher.
 * Automatically delegates to the current operating system handler.
 * Never throws — guarantees failures are handled gracefully.
 */
export async function notify(event: AgentEvent): Promise<boolean> {
  try {
    const platform = process.platform;

    switch (platform) {
      case "darwin":
        return await sendMacNotification(event);
      case "win32":
        return await sendWindowsNotification(event);
      case "linux":
        return await sendLinuxNotification(event);
      default:
        console.warn(`[notify] Unsupported platform: ${platform}. Logging to terminal instead.`);
        console.log(
          `[APL Alert] [${event.riskLevel?.toUpperCase() ?? "UNKNOWN"}] ${event.agent}: ${event.command ?? event.type}`,
        );
        return false;
    }
  } catch (error) {
    console.warn("[notify] Unexpected notification dispatcher error:", error);
    return false;
  }
}
