import { execSync } from "node:child_process";
import { redactText } from "./redactor.ts";

export interface NotificationPayload {
  title: string;
  subtitle?: string;
  message: string;
}

export class DesktopNotifier {
  public notify(payload: NotificationPayload): boolean {
    const safeTitle = redactText(payload.title).replace(/"/g, '\\"');
    const safeSubtitle = payload.subtitle ? redactText(payload.subtitle).replace(/"/g, '\\"') : "";
    const safeMessage = redactText(payload.message).replace(/"/g, '\\"');

    const script = safeSubtitle
      ? `display notification "${safeMessage}" with title "${safeTitle}" subtitle "${safeSubtitle}"`
      : `display notification "${safeMessage}" with title "${safeTitle}"`;

    try {
      execSync(`osascript -e '${script}' 2>/dev/null`, { encoding: "utf8" });
      return true;
    } catch {
      return false;
    }
  }

  public notifyTaskCompletion(taskId: string, goal: string, success: boolean): boolean {
    const title = success ? "Harness Task Succeeded" : "Harness Task Failed";
    const subtitle = `Task: ${taskId}`;
    const message = `Goal '${goal}' finished with status: ${success ? "SUCCESS" : "FAILED"}`;

    return this.notify({ title, subtitle, message });
  }
}
