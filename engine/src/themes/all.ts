import { registerTheme, Theme } from './index.js';
import { callboard } from './callboard.js';
import { wall } from './wall.js';
import { record } from './record.js';
import { orchard } from './orchard.js';
import { plate19 } from './plate19.js';
import { coldopen } from './coldopen.js';
import { guestlist } from './guestlist.js';
import { gallery } from './gallery.js';

export const THEMES: Theme[] = [guestlist, gallery, orchard, coldopen, callboard, wall, record, plate19];
for (const t of THEMES) registerTheme(t);
export { guestlist, gallery, callboard, wall, record, orchard, plate19, coldopen };
