import type { Feature } from '../core/types';
import { ask } from './ask';

// ponytail: step 5 lands the intent router of section 4.6; the stub keeps Ask Anchor working from this position
export const intents: Feature = { name: 'intents', handle: (event, family, ctx) => ask.handle!(event, family, ctx) };
