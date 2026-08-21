import { registerTheme, Theme } from './index.js';
import { callboard } from './callboard.js';
import { record } from './record.js';
import { orchard } from './orchard.js';
import { plate19 } from './plate19.js';
import { coldopen } from './coldopen.js';
import { guestlist } from './guestlist.js';
import { gallery } from './gallery.js';

export const THEMES: Theme[] = [gallery, guestlist, orchard, coldopen, callboard, record, plate19];
for (const t of THEMES) registerTheme(t);
export { gallery, guestlist, callboard, record, orchard, plate19, coldopen };
