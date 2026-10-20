// Regression test for the event validators, run with `node lib/__tests__/events-def.mjs`.
//
// It imports the REAL validators from lib/workroom/events-def.ts (Node strips the types
// itself, 22.18+). The cases are the ones a review on 20 Oct 2026 found the shape tests let
// through: "99:99" passed as a time and lib/content.ts then threw while rendering the
// homepage for every visitor; "2026-02-31" passed as a date and rolled forward to March 3;
// and an end before the start was refused when it meant after midnight.
//
// No test runner: this repo has none, and one script that exits non-zero is enough.
import { blankEvent, eventErrors, validDate, validTime } from "../workroom/events-def.ts";

let failed = 0;
const check = (name, got, want) => {
  const pass = JSON.stringify(got) === JSON.stringify(want);
  if (!pass) failed++;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${pass ? "" : `  got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

check("00:00 is a time", validTime("00:00"), true);
check("23:59 is a time", validTime("23:59"), true);
check("24:00 is not", validTime("24:00"), false);
check("99:99 is not", validTime("99:99"), false);
check("7:00 (one digit) is not", validTime("7:00"), false);
check("19:60 is not", validTime("19:60"), false);

check("2026-02-28 is a date", validDate("2026-02-28"), true);
check("2028-02-29 (leap) is a date", validDate("2028-02-29"), true);
check("2026-02-29 is not", validDate("2026-02-29"), false);
check("2026-02-31 is not", validDate("2026-02-31"), false);
check("2026-13-01 is not", validDate("2026-13-01"), false);
check("2026-00-10 is not", validDate("2026-00-10"), false);
check("26-02-28 is not", validDate("26-02-28"), false);

const base = { ...blankEvent(), title: "Trivia", date: "2026-11-05", startTime: "19:00" };
check("a sound draft has no errors", eventErrors(base), {});
check("after midnight is allowed", eventErrors({ ...base, startTime: "21:00", endTime: "01:00" }), {});
check("same minute is refused", Object.keys(eventErrors({ ...base, endTime: "19:00" })), ["endTime"]);
check("bad end time is marked", Object.keys(eventErrors({ ...base, endTime: "99:99" })), ["endTime"]);
check("bad start time is marked", Object.keys(eventErrors({ ...base, startTime: "99:99" })), ["startTime"]);
check("rolled date is marked", Object.keys(eventErrors({ ...base, date: "2026-02-31" })), ["date"]);
check("http ticket link is refused", Object.keys(eventErrors({ ...base, ticketUrl: "http://x.com" })), ["ticketUrl"]);
check("photo without alt is marked", Object.keys(eventErrors({ ...base, imageId: "img_1" })), ["imageAlt"]);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log(`\nall ${21} passed`);
