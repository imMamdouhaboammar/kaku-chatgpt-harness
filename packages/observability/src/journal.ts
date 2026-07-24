import { appendFileSync, readFileSync, existsSync } from "node:fs";
import { redactValue } from "./redactor.ts";

export interface HarnessEvent {
  eventId: string;
  timestamp: string;
  eventType: string;
  sessionId: string;
  payload: Record<string, unknown>;
}

export class EventJournal {
  private readonly journalPath: string;

  constructor(journalPath: string) {
    this.journalPath = journalPath;
  }

  public record(eventType: string, sessionId: string, payload: Record<string, unknown>): HarnessEvent {
    const event: HarnessEvent = {
      eventId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      eventType,
      sessionId,
      payload: redactValue(payload) as Record<string, unknown>
    };
    appendFileSync(this.journalPath, JSON.stringify(event) + "\n", "utf8");
    return event;
  }

  public getEventsForSession(sessionId: string): HarnessEvent[] {
    if (!existsSync(this.journalPath)) return [];
    const content = readFileSync(this.journalPath, "utf8");
    const lines = content.split("\n").filter((line) => line.trim().length > 0);
    const events: HarnessEvent[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as HarnessEvent;
        if (parsed.sessionId === sessionId) {
          events.push(parsed);
        }
      } catch {
        // Skip corrupted line
      }
    }
    return events;
  }
}
