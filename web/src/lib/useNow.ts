import { useEffect, useState } from 'react';

/** The time now, updated on the minute (so a clock never lags). */
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer = setTimeout(function tick() {
      setNow(new Date());
      timer = setTimeout(tick, 60_000 - (Date.now() % 60_000));
    }, 60_000 - (Date.now() % 60_000));
    return () => clearTimeout(timer);
  }, []);
  return now;
}
