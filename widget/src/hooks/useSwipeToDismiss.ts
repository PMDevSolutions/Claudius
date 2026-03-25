import { RefObject, useEffect, useRef, useState } from "react";

export function useSwipeToDismiss(
  sheetRef: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  enabled: boolean
): { offsetY: number } {
  const [offsetY, setOffsetY] = useState(0);
  const offsetYRef = useRef(0);
  const startYRef = useRef(0);
  const startTimeRef = useRef(0);
  const trackingRef = useRef(false);

  useEffect(() => {
    const el = sheetRef.current;
    if (!enabled || !el) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (el.scrollTop > 0) {
        trackingRef.current = false;
        return;
      }
      trackingRef.current = true;
      startYRef.current = e.touches[0].clientY;
      startTimeRef.current = Date.now();
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!trackingRef.current) return;

      let deltaY = e.touches[0].clientY - startYRef.current;

      // Dampen upward drag
      if (deltaY < 0) {
        deltaY = deltaY * 0.3;
      }

      offsetYRef.current = deltaY;
      setOffsetY(deltaY);
    };

    const handleTouchEnd = () => {
      if (!trackingRef.current) return;
      trackingRef.current = false;

      const currentOffsetY = offsetYRef.current;
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const height = el.getBoundingClientRect().height;
      const isFastFlick =
        elapsed > 0.05 && currentOffsetY > 0 && currentOffsetY / elapsed > 500;
      const isLongDrag = currentOffsetY > height * 0.3;

      if (isFastFlick || isLongDrag) {
        onDismiss();
      } else {
        offsetYRef.current = 0;
        setOffsetY(0);
      }
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });
    el.addEventListener("touchend", handleTouchEnd);

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [sheetRef, onDismiss, enabled]);

  return { offsetY };
}
