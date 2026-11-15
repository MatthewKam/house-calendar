import { useEffect, useState } from 'react';
import { dayKey } from './dates';

/** Today's date key, updated when the clock passes midnight. */
export function useToday() {
	const [today, setToday] = useState(() => dayKey(new Date()));
	useEffect(() => {
		const timer = setInterval(() => setToday(dayKey(new Date())), 60_000);
		return () => clearInterval(timer);
	}, []);
	return today;
}
