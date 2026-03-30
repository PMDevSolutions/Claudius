# Mobile Bottom Sheet Design

## Overview

On mobile (<640px), the chat widget renders as a full-width bottom sheet instead of a floating card. Desktop behavior is unchanged.

## Behavior

- Slides up from bottom to ~90vh height
- Dark scrim backdrop behind sheet (tap scrim to close)
- Drag handle bar at top of sheet
- Swipe-to-close: velocity > 500px/s OR drag distance > 30% of sheet height
- `prefers-reduced-motion`: opacity fade instead of slide animation

## Implementation

### Files to change

1. **`widget/src/hooks/useSwipeToDismiss.ts`** (new) - vanilla JS touch handler
2. **`widget/src/components/ChatWindow.tsx`** - bottom sheet layout on mobile
3. **`widget/src/components/ChatWidget.tsx`** - render scrim backdrop on mobile
4. **`widget/src/styles.css`** - transitions, scrim, reduced-motion

### Hook: useSwipeToDismiss

```typescript
useSwipeToDismiss(ref: RefObject<HTMLElement>, onDismiss: () => void): { offsetY: number }
```

- `touchstart`: record Y position
- `touchmove`: calculate delta, apply `transform: translateY()` directly (no CSS transition during drag)
- `touchend`: if velocity > 500px/s OR distance > 30% of sheet height, call onDismiss. Otherwise snap back.
- Passive touch listeners for performance
- No-op when `window.innerWidth >= 640`

### ChatWindow changes

- Below 640px: `fixed inset-x-0 bottom-0 h-[90vh] w-full rounded-t-2xl`
- Add drag handle div (centered horizontal bar) at top
- Remove floating-card positioning classes on mobile
- Apply `translateY` offset from swipe hook

### ChatWidget changes

- Render scrim `<div>` behind ChatWindow when open on mobile
- Scrim: `fixed inset-0 bg-black/50` with fade transition
- Tap scrim calls `handleToggle`

### CSS transitions

```css
.claudius-bottom-sheet {
  transition: transform 300ms cubic-bezier(0.32, 0.72, 0, 1);
}

.claudius-scrim {
  transition: opacity 300ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .claudius-bottom-sheet {
    transition: opacity 200ms ease;
    transform: none !important;
  }
  .claudius-scrim {
    transition: opacity 150ms ease;
  }
}
```

### Gesture details

- Only vertical swipe (ignore horizontal movement > 10px)
- Resist upward drag (dampen by 0.3x when dragging above origin)
- No scroll interference: only activate swipe when sheet is scrolled to top
