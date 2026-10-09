// Touch screens (the iPad, phones, the wall): buttons should press, every time, however a child
// taps them. Safari turns a long or slow press into selecting text or its long-press menu, and
// often drops the tap altogether; this stops the first two and puts the dropped tap back. Typing
// fields keep their usual behavior. Computers with a mouse aren't touched (right-click still works).

const editable = (t: EventTarget | null) =>
  t instanceof Element && !!t.closest('input, textarea, select, [contenteditable="true"]');

/** A finger that moves further than this was dragging or scrolling, not pressing. */
const MOVE_PX = 10;

export function guardTouch() {
  if (!matchMedia('(pointer: coarse)').matches) return;

  // No text selection or long-press menu outside typing fields, and no pinch-zoom (Safari ignores
  // the page's "no zooming" setting).
  for (const type of ['selectstart', 'contextmenu'] as const) {
    document.addEventListener(type, (e) => !editable(e.target) && e.preventDefault());
  }
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // A press held a little long: Safari may never send the tap. If one finger went down and came up
  // on the same button without moving, and no tap arrived, press it. Touch events, not pointer
  // events: Safari can cancel the pointer during a long press, but the touch still ends.
  let press: { button: HTMLElement; x: number; y: number; at: number } | null = null;
  let clicked = false;
  document.addEventListener('touchstart', (e) => {
    const t = e.touches.length === 1 ? e.touches[0] : null;
    const button = t && (e.target as Element).closest?.<HTMLElement>('button:not(:disabled)');
    press = t && button ? { button, x: t.clientX, y: t.clientY, at: e.timeStamp } : null;
    clicked = false;
  }, { capture: true, passive: true });
  document.addEventListener('click', () => (clicked = true), true);
  document.addEventListener('touchend', (e) => {
    const p = press;
    press = null;
    const t = e.changedTouches[0];
    if (!p || !t) return;
    const still = Math.hypot(t.clientX - p.x, t.clientY - p.y) < MOVE_PX;
    const same = document.elementFromPoint(t.clientX, t.clientY)?.closest('button') === p.button;
    // Quick taps arrive on their own; only a longer press needs help, once Safari has had its chance.
    if (!still || !same || e.timeStamp - p.at < 350) return;
    setTimeout(() => !clicked && p.button.isConnected && p.button.click(), 80);
  }, { capture: true, passive: true });
}
