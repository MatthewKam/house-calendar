// The stages of growing up (server/stages.ts works out each person's from their birthdate), shared by
// the server and the web app. The web app imports the type only, so zod stays out of its bundle.

import { z } from 'zod';

/** Little gets instant cheers, Early saves stars in jars, and so on (docs/product-plan.md, "Growing up"). */
export const Stage = z.enum(['little', 'early', 'middle', 'tween', 'teen', 'adult']);
export type Stage = z.infer<typeof Stage>;
