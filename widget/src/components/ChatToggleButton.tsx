import { forwardRef } from "react";
import type { WidgetPosition } from "./ChatWidget";
import type { ClaudiusTranslations } from "../i18n";

interface ChatToggleButtonProps {
  isOpen: boolean;
  onClick: () => void;
  position?: WidgetPosition;
  translations?: ClaudiusTranslations;
}

const positionClasses: Record<WidgetPosition, string> = {
  "bottom-right": "bottom-6 right-6",
  "bottom-left": "bottom-6 left-6",
  "top-right": "top-6 right-6",
  "top-left": "top-6 left-6",
};

export const ChatToggleButton = forwardRef<
  HTMLButtonElement,
  ChatToggleButtonProps
>(function ChatToggleButton(
  { isOpen, onClick, position = "bottom-right", translations },
  ref
) {
  const label = isOpen
    ? translations?.closeChat ?? "Close chat"
    : translations?.openChat ?? "Open chat";

  return (
    <button
      ref={ref}
      onClick={onClick}
      aria-label={label}
      className={`fixed ${positionClasses[position]} z-50 flex h-14 w-14 items-center justify-center rounded-full bg-claudius-primary text-white shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-claudius-primary focus:ring-offset-2`}
    >
      {isOpen ? (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      ) : (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      )}
    </button>
  );
});
