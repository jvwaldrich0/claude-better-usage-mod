// The person's settings, from the config menu (the manifest's userConfig), read once
// per load: a change there reloads the module. Anything out of range falls back.
import { CONTEXT_RAMP, LIMIT_RAMP } from './colors';
import { LANGUAGES } from './i18n';
const number = (value, fallback, min, max) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
/** three whole %s, rising, from text such as "50 75 95"; else the fallback */
export function parseRamp(value, fallback) {
    if (typeof value !== 'string')
        return fallback;
    const parts = value.trim().split(/[\s,/]+/).map(Number);
    const isRamp = parts.length === 3 && parts.every(p => Number.isInteger(p) && p >= 0 && p <= 100) && parts[0] < parts[1] && parts[1] < parts[2];
    return isRamp ? [parts[0], parts[1], parts[2]] : fallback;
}
export function readSettings(options = {}) {
    return {
        language: typeof options.language === 'string' && options.language in LANGUAGES ? options.language : 'auto',
        notify: options.notify !== false,
        alertAt: number(options.alertAt, 90, 50, 100),
        chatCost: options.chatCost !== false,
        statusLine: options.statusLine !== false,
        autoCompactAt: number(options.autoCompactAt, 30, 15, 99),
        limitRamp: parseRamp(options.limitColors, LIMIT_RAMP),
        contextRamp: parseRamp(options.contextColors, CONTEXT_RAMP),
    };
}
/** the /config rows a setting sits in: "<plugin>.<field>", or one "<plugin>@<source>.<field>" per
 *  copy when two enabled plugins share the name (the desktop app loads an inline copy beside the
 *  installed one) */
export const settingKeys = (keys, plugin, field) => keys.filter(k => k === `${plugin}.${field}` || (k.startsWith(`${plugin}@`) && k.endsWith(`.${field}`)));
