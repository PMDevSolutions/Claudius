import { useEffect } from "react";

export type UrlPattern = string | RegExp;

export type TriggerAction = "open" | { greeting: string };

export type Trigger =
  | {
      on: "time";
      seconds: number;
      matchUrl?: UrlPattern;
      action: TriggerAction;
    }
  | {
      on: "scroll";
      percent: number;
      matchUrl?: UrlPattern;
      action: TriggerAction;
    }
  | {
      on: "exit-intent";
      matchUrl?: UrlPattern;
      action: TriggerAction;
    }
  | {
      on: "url";
      pattern: UrlPattern;
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
