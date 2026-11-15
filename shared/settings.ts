// Display settings (server/app.ts): a value for each key, for things like UI scale. What the routes take
// and give back, written once. The server checks requests against these and the web app imports their
// types (types only, so zod stays out of its bundle).

import { z } from 'zod';

/** Which setting (PUT /api/settings/:key): a name such as uiScale or screensaver, or one of a person's own
 * such as quoteThemesOff.<their id>. */
export const SettingKey = z.object({ key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/) });
/** Its new value, anything JSON can hold (unchecked: z.json() would let the checker turn false into null). */
export const SettingValue = z.object({ value: z.unknown() });

/** Every setting kept, by key (GET /api/settings); a PUT gives back the one it set. */
export const Settings = z.record(z.string(), z.unknown());

export type SettingValue = z.infer<typeof SettingValue>;
export type Settings = z.infer<typeof Settings>;
