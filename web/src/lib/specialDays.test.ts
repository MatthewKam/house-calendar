import { describe, expect, it } from "vitest";
import { addedDays, birthdays, holidays, sleepsUntil, specialDaysFor } from "./specialDays";

const on = (year: number, name: string) => holidays(year).find((h) => h.name === name)?.day;

describe("special days", () => {
	it("works out the holidays that move each year", () => {
		expect(on(2026, "Thanksgiving")).toBe("2026-11-26");
		expect(on(2027, "Thanksgiving")).toBe("2027-11-25");
		expect(on(2026, "Easter")).toBe("2026-04-05");
		expect(on(2027, "Easter")).toBe("2027-03-28");
		expect(on(2026, "Mother's Day")).toBe("2026-05-10");
		expect(on(2026, "Father's Day")).toBe("2026-06-21");
		expect(on(2026, "Memorial Day")).toBe("2026-05-25");
		expect(on(2026, "Labor Day")).toBe("2026-09-07");
		expect(on(2026, "Martin Luther King Jr. Day")).toBe("2026-01-19");
	});

	it("puts birthdays in the year asked for (a 29 February one on the 28th)", () => {
		expect(birthdays([{ name: "Tayen Kam", birthdate: "2022-11-18" }, { name: "Nolan", birthdate: null }], 2026))
			.toEqual([{ day: "2026-11-18", name: "Tayen's birthday", picture: "🎂" }]);
		expect(birthdays([{ name: "Leap", birthdate: "2024-02-29" }], 2026)[0].day).toBe("2026-02-28");
	});

	it("shows the month's days, and in its last week the next month's first ones", () => {
		const nov = specialDaysFor("2026-11-09").map((d) => d.name);
		expect(nov).toEqual(["Veterans Day", "Thanksgiving"]);
		const late = specialDaysFor("2026-11-27").map((d) => d.name);
		expect(late).toEqual(["Veterans Day", "Thanksgiving"]);
		const dec = specialDaysFor("2026-12-28").map((d) => d.day);
		expect(dec).toContain("2027-01-01");
		// Past the next month's first two weeks: not yet.
		expect(dec).not.toContain("2027-01-18");
	});

	it("puts the grown-ups' days in their year: once-only ones in theirs, yearly ones in every one", () => {
		const added = [
			{ day: "2026-11-21", name: "School play", picture: "🎭", yearly: false },
			{ day: "2025-11-14", name: "Cousins visit", picture: "🚗", yearly: true },
		];
		expect(addedDays(added, 2026).map((d) => d.day)).toEqual(["2026-11-21", "2026-11-14"]);
		expect(addedDays(added, 2027).map((d) => d.day)).toEqual(["2027-11-14"]);
	});

	it("counts sleeps", () => {
		expect(sleepsUntil("2026-11-09", "2026-11-26")).toBe(17);
		expect(sleepsUntil("2026-11-09", "2026-11-09")).toBe(0);
		expect(sleepsUntil("2026-11-09", "2026-11-01")).toBe(-8);
	});
});
