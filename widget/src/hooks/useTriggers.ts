import { useEffect } from "react";

/** A URL match: a case-insensitive substring, or a regular expression. */
export type UrlPattern = string | RegExp;

/**
 * What a {@link Trigger} does when it fires: open the chat, or show a greeting
 * bubble with the given message.
 */
export type TriggerAction =
  | "open"
  | {
      /** Greeting bubble message to display. */
      greeting: string;
    };

/**
 * A proactive engagement rule. Each variant fires at most once per page on a
 * different signal: elapsed time, scroll depth, exit intent, or URL match.
 */
export type Trigger =
  | {
      /** Fire after a fixed dwell time. */
      on: "time";
      /** Seconds to wait before firing. */
      seconds: number;
      /** Only fire when the current URL matches this pattern. */
      matchUrl?: UrlPattern;
      /** Action to run when the trigger fires. */
      action: TriggerAction;
    }
  | {
      /** Fire once the user scrolls past a depth threshold. */
      on: "scroll";
      /** Scroll depth (0-100) that fires the trigger. */
      percent: number;
      /** Only fire when the current URL matches this pattern. */
      matchUrl?: UrlPattern;
      /** Action to run when the trigger fires. */
      action: TriggerAction;
    }
  | {
      /** Fire when the pointer leaves the top of the viewport (exit intent). */
      on: "exit-intent";
      /** Only fire when the current URL matches this pattern. */
      matchUrl?: UrlPattern;
      /** Action to run when the trigger fires. */
      action: TriggerAction;
    }
  | {
      /** Fire immediately when the current URL matches. */
      on: "url";
      /** URL pattern that must match for the trigger to fire. */
      pattern: UrlPattern;
      /** Action to run when the trigger fires. */
      action: TriggerAction;
    };

interface UseTriggersOptions {
  triggers?: Trigger[];
  enabled: boolean;
  onOpen: () => void;
  onGreeting: (message: string) => void;
}

export function matchesUrl(pattern: UrlPattern, url: string): boolean {
  if (pattern instanceof RegExp) return pattern.test(url);
  return url.toLowerCase().includes(pattern.toLowerCase());
}

function scrollPercent(): number {
  const doc = document.documentElement;
  const body = document.body;
  const scrollTop = doc.scrollTop || body.scrollTop || 0;
  const scrollHeight = Math.max(doc.scrollHeight, body.scrollHeight);
  const clientHeight = doc.clientHeight || window.innerHeight;
  const max = scrollHeight - clientHeight;
  if (max <= 0) return 100;
  return (scrollTop / max) * 100;
}

export function useTriggers({
  triggers,
  enabled,
  onOpen,
  onGreeting,
}: UseTriggersOptions): void {
  useEffect(() => {
    if (!enabled || !triggers || triggers.length === 0) return;

    const fired = new Set<number>();
    const cleanups: Array<() => void> = [];
    const currentUrl =
      typeof window !== "undefined" ? window.location.href : "";

    const fireFor = (index: number, action: TriggerAction) => {
      if (fired.has(index)) return;
      fired.add(index);
      if (action === "open") {
        onOpen();
      } else {
        onGreeting(action.greeting);
      }
    };

    triggers.forEach((trigger, index) => {
      switch (trigger.on) {
        case "url": {
          if (matchesUrl(trigger.pattern, currentUrl)) {
            fireFor(index, trigger.action);
          }
          break;
        }
        case "time": {
          if (trigger.matchUrl && !matchesUrl(trigger.matchUrl, currentUrl)) {
            return;
          }
          const id = window.setTimeout(
            () => fireFor(index, trigger.action),
            Math.max(0, trigger.seconds * 1000),
          );
          cleanups.push(() => window.clearTimeout(id));
          break;
        }
        case "scroll": {
          if (trigger.matchUrl && !matchesUrl(trigger.matchUrl, currentUrl)) {
            return;
          }
          const handler = () => {
            if (scrollPercent() >= trigger.percent) {
              fireFor(index, trigger.action);
            }
          };
          handler();
          window.addEventListener("scroll", handler, { passive: true });
          cleanups.push(() => window.removeEventListener("scroll", handler));
          break;
        }
        case "exit-intent": {
          if (trigger.matchUrl && !matchesUrl(trigger.matchUrl, currentUrl)) {
            return;
          }
          const handler = (e: MouseEvent) => {
            if (e.clientY <= 0) {
              fireFor(index, trigger.action);
            }
          };
          document.addEventListener("mouseleave", handler);
          cleanups.push(() =>
            document.removeEventListener("mouseleave", handler),
          );
          break;
        }
      }
    });

    return () => {
      cleanups.forEach((c) => c());
    };
  }, [triggers, enabled, onOpen, onGreeting]);
}
