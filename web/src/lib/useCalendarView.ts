import { useMemo, useState } from "react";
import { addDays, addMonths, dayKey, fromDayKey, monthGridDays, startOfWeek } from "./dates";
import { useSetSetting, useSettings } from "./queries";

export type View = "month" | "week";

/**
 * The calendar on screen: Month or Week (saved with the display's settings, so a refresh reopens it),
 * any day inside it (the cursor), its days, the day open in the side panel, and moving between them.
 * At midnight it moves to the new day if the old one was on screen.
 */
export function useCalendarView(today: string) {
	const settings = useSettings();
	const setSetting = useSetSetting();
	const view: View = settings.data?.view === "month" ? "month" : "week";
	// Any day inside the month or week on screen.
	const [cursor, setCursor] = useState(() => new Date());
	// The day shown in the side panel; null when it's closed.
	const [selected, setSelected] = useState<string | null>(null);
	const days = useMemo(
		() => (view === "month" ? monthGridDays(cursor) : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i))),
		[view, cursor],
	);

	// At midnight, move to the new day if the old one was on screen.
	const [shownToday, setShownToday] = useState(today);
	if (today !== shownToday) {
		setShownToday(today);
		if (days.some((d) => dayKey(d) === shownToday)) setCursor(fromDayKey(today));
		if (selected === shownToday) setSelected(today);
	}

	return {
		view, cursor, setCursor, selected, setSelected, days,
		/** A month or week forward (1) or back (-1). */
		step: (n: number) => setCursor(view === "month" ? addMonths(cursor, n) : addDays(cursor, 7 * n)),
		goToday: () => {
			setCursor(new Date());
			if (selected) setSelected(today);
		},
		changeView: (next: View) => {
			// Keep the selected day in view when switching between month and week.
			if (selected) setCursor(fromDayKey(selected));
			setSetting.mutate({ key: "view", value: next });
		},
		/**
		 * The day a new event starts on: the day open in the panel, else today if it's on screen, else
		 * the first day shown (the 1st, in Month view).
		 */
		newEventDay: () => {
			if (selected) return selected;
			const shownDays = view === "month" ? days.filter((d) => d.getMonth() === cursor.getMonth()) : days;
			return shownDays.some((d) => dayKey(d) === today) ? today : dayKey(shownDays[0]);
		},
	};
}
