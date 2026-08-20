import { registerLocale, LocaleCode } from './index.js';
import { en } from './en.js';
import { pt } from './pt.js';
import { es } from './es.js';

registerLocale(en);
registerLocale(pt);
registerLocale(es);

export const ALL_LOCALES: LocaleCode[] = ['en', 'pt', 'es'];
export { en, pt, es };
