import { median, sameWindow, SAME_WINDOW_MS, TYPICAL_DEFAULT, WINDOWS } from './forecast';
// The usage service rate-limits per login, and the app's own Usage panel asks it on
// the same allowance, so ask it seldom: when a chat opens, then every 2 minutes with the
// exact context count, one ask for the whole app (when it was last asked, the answer and
// any back-off sit in the shared store). Between asks the figures every reply from
// Claude carries keep the band current.
const PLAN_EVERY_MS = 2 * 60000;
// timers drift: a 2-minute tick a moment early still counts as due
const PLAN_SLACK_MS = 10000;
// after a failed ask wait 2, then 5, then 15 minutes, or what the service says
const PLAN_BACKOFF_MS = [120000, 300000, 900000];
/** a refused ask, with how long the service said to wait */
export class AskError extends Error {
    retryAfterMs;
    constructor(message, retryAfterMs) {
        super(message);
        this.retryAfterMs = retryAfterMs;
    }
}
export const isPlanDue = (ask, now, askedAt, backoff) => now >= (backoff?.until ?? 0) && (ask === 'now' || (ask === 'due' && now - askedAt >= PLAN_EVERY_MS - PLAN_SLACK_MS));
/** the back-off after one more failed ask */
export function nextBackoff(prev, error, now) {
    const failures = (prev?.failures ?? 0) + 1;
    const wait = error instanceof AskError && error.retryAfterMs !== undefined
        ? error.retryAfterMs
        : PLAN_BACKOFF_MS[Math.min(failures - 1, PLAN_BACKOFF_MS.length - 1)];
    return { until: now + wait, failures, error: error instanceof Error ? error.message : String(error) };
}
/** the 5 Hour and Weekly limits in the usage service's answer; throws when it has neither */
export function parsePlan(text) {
    const body = JSON.parse(text);
    const limits = [];
    for (const kind of ['five_hour', 'seven_day']) {
        const w = body[kind];
        if (!w || typeof w.utilization !== 'number')
            continue;
        limits.push({ kind, percentUsed: Math.round(w.utilization * 10) / 10, resetsAt: w.resets_at ?? undefined });
    }
    if (limits.length === 0)
        throw new Error('answer had no limits');
    return limits;
}
// The context is shown as three groups: Messages, Tools (System + MCP tools) and Other
// (the system prompt, skills, memory files, agents, MCP server instructions).
const TOOL_NAMES = new Set(['System tools', 'MCP tools']);
const groupOf = (name) => (name === 'Messages' ? 'Messages' : TOOL_NAMES.has(name) ? 'Tools' : 'Other');
/** the tokens the context's used categories hold, by group */
export function sumGroups(categories) {
    const sums = { Messages: 0, Tools: 0, Other: 0 };
    for (const c of categories)
        if (c.kind === 'used')
            sums[groupOf(c.name)] += c.tokens;
    return sums;
}
/** the context as the band draws it: Messages, Tools and Other (the local estimate scaled
 *  by the exact count's ratios, or the exact count itself), the free space, the total and its % */
export function contextFigures(context, breakdown, all, calib, exact) {
    const rough = sumGroups(all);
    const tools = exact?.Tools ?? Math.round(rough.Tools * (calib.Tools ?? 1));
    const other = exact?.Other ?? Math.round(rough.Other * (calib.Other ?? 1));
    // Messages as /context counts it: the API's real input total less the other groups
    const messages = exact?.Messages ?? (context.tokens !== undefined && context.tokens - tools - other > 0 ? context.tokens - tools - other : rough.Messages);
    const used = context.tokens ?? (exact ? messages + tools + other : breakdown?.totalTokens ?? 0);
    const categories = [
        { name: 'Messages', tokens: messages, kind: 'used' },
        { name: 'Tools', tokens: tools, kind: 'used' },
        { name: 'Other', tokens: other, kind: 'used' },
        ...all.filter(c => c.kind === 'buffer' || c.kind === 'free').map(c => ({ name: c.name, tokens: c.tokens, kind: c.kind })),
    ].filter(c => c.tokens > 0);
    const percent = exact ? Math.round((used / context.window) * 100) : context.percent ?? breakdown?.percentage ?? Math.round((used / context.window) * 100);
    return { categories, used, percent };
}
/** a Retry-After header, in ms, when it gives a usable number of seconds */
export function retryAfterMs(headers) {
    const header = Object.entries(headers ?? {}).find(([k]) => k.toLowerCase() === 'retry-after')?.[1];
    const seconds = Number(Array.isArray(header) ? header[0] : header);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}
// The better of two readings of one window. A later window beats an earlier one,
// whatever was read last; within one window the later reading wins. A reading with no
// reset time (a reply may leave it out) cannot say which window it is: it only moves
// the known window's % up, as use only climbs within a window.
function better(best, r) {
    if (!best)
        return r;
    if (!r.resetsAt) {
        if (!best.resetsAt)
            return r.at > best.at ? r : best;
        return r.at > best.at && r.percentUsed >= best.percentUsed ? { ...best, percentUsed: r.percentUsed, at: r.at } : best;
    }
    if (!best.resetsAt)
        return r;
    const gap = Date.parse(r.resetsAt) - Date.parse(best.resetsAt);
    if (Math.abs(gap) > SAME_WINDOW_MS)
        return gap > 0 ? r : best;
    return r.at > best.at ? r : best;
}
// The two readings, the usage service's (saved, shared by every chat) and this chat's
// reply figures (live), merged window by window: a reply may carry one window alone,
// which must never wipe out the other's reading (a chat showed Weekly at 0 while the
// rest showed 58%). The reply figures also run behind the service, which the app's
// panel reads: whole percents, seen at 18 for an hour while the service said 19.0, so
// within a window the service's last answer (plan) is a floor. A window that has reset
// since stays, at 0: the forecast reads it as not running.
export function pickLimits(saved, live, plan, now) {
    const sources = [saved, live].filter((s) => s !== undefined);
    if (sources.length === 0)
        return { limits: [] };
    const byKind = new Map();
    for (const s of sources)
        for (const l of s.limits)
            byKind.set(l.kind, better(byKind.get(l.kind), { ...l, at: s.at }));
    const merged = {
        at: Math.max(...sources.map(s => s.at)),
        limits: [...byKind.values()].map(({ at: _at, ...l }) => l),
    };
    const finer = (l) => {
        const p = plan?.limits.find(x => x.kind === l.kind);
        return p && sameWindow(p.resetsAt, l.resetsAt) && p.percentUsed > l.percentUsed ? { ...l, percentUsed: p.percentUsed } : l;
    };
    const limits = merged.limits.map(l => l.resetsAt !== undefined && Date.parse(l.resetsAt) <= now ? { kind: l.kind, percentUsed: 0 } : finer(l));
    return { merged, limits };
}
const FINALS_KEPT = 8;
/** the jump a reopened chat's first reply made, once a reading after it has moved */
export function spikeOf(from, live) {
    if (!from || !live || live.at <= from.at)
        return undefined;
    const jump = {};
    for (const l of live.limits) {
        const before = from.limits.find(b => b.kind === l.kind);
        if (before && sameWindow(before.resetsAt, l.resetsAt) && l.percentUsed > before.percentUsed) {
            jump[l.kind] = l.percentUsed - before.percentUsed;
        }
    }
    return Object.keys(jump).length === 0 ? undefined : jump;
}
/** the pace store after these readings, whether it changed, each window's pace, and the windows that ended */
export function stepPace(saved, limits, now, spike) {
    let store = saved;
    let isChanged = false;
    const pace = {};
    const closed = [];
    for (const l of limits) {
        const resetsAt = l.resetsAt ? Date.parse(l.resetsAt) : NaN;
        if (!WINDOWS[l.kind] || !Number.isFinite(resetsAt) || resetsAt <= now)
            continue;
        const old = store.windows[l.kind];
        let w = old;
        let finals = store.finals[l.kind];
        if (!w || Math.abs(w.resetsAt - resetsAt) > SAME_WINDOW_MS) {
            // a new window: the last one's peak is how far it got
            if (w && w.peak > 0) {
                finals = [...(finals ?? []), w.peak].slice(-FINALS_KEPT);
                closed.push({ kind: l.kind, resetsAt: w.resetsAt, peak: w.peak });
            }
            w = { resetsAt, peak: l.percentUsed, skip: 0 };
        }
        else if (l.percentUsed > w.peak)
            w = { ...w, peak: l.percentUsed };
        const jump = spike?.[l.kind];
        if (jump)
            w = { ...w, skip: Math.min(w.peak, w.skip + jump) };
        if (w !== old) {
            store = { finals: { ...store.finals, ...(finals ? { [l.kind]: finals } : {}) }, windows: { ...store.windows, [l.kind]: w } };
            isChanged = true;
        }
        pace[l.kind] = { typical: median(finals) ?? TYPICAL_DEFAULT, skip: w.skip };
    }
    return { store, isChanged, pace, closed };
}
// the past windows the history pane lists: two days of 5 hour ones, two months of weeks
const HISTORY_KEPT = { five_hour: 10, seven_day: 8 };
/** the history with these ended windows added, newest first; one already there is not added twice */
export function addHistory(history, closed) {
    const fresh = closed.filter(c => !history.some(h => h.kind === c.kind && Math.abs(h.resetsAt - c.resetsAt) <= SAME_WINDOW_MS));
    if (fresh.length === 0)
        return history;
    const all = [...fresh, ...history].sort((a, b) => b.resetsAt - a.resetsAt);
    return Object.keys(HISTORY_KEPT).flatMap(kind => all.filter(p => p.kind === kind).slice(0, HISTORY_KEPT[kind]));
}
/** what a turn took of each window: how far each moved across it; one that reset mid-turn, all the new one's use */
export function turnCosts(from, after) {
    return after.flatMap(a => {
        const before = from.find(l => l.kind === a.kind);
        if (!before || !WINDOWS[a.kind])
            return [];
        // a reading with no reset time (the window just expired) is a new window, as the band counts it
        const resetsAt = a.resetsAt ? Date.parse(a.resetsAt) : NaN;
        const isSame = sameWindow(before.resetsAt, a.resetsAt);
        return [{ kind: a.kind, resetsAt, cost: isSame ? Math.max(0, a.percentUsed - before.percentUsed) : a.percentUsed, isSame }];
    });
}
/** a chat's stand-in name while its prompt could not be read: its id's start */
export const idName = (chat) => chat.slice(0, 8);
/** the chat list with these moves added: a chat's moves in one window summed under the name
 *  it was first recorded by (its id's start only until a real one comes), and only the
 *  running window and those the history keeps */
export function addChatUse(list, moves) {
    let next = list;
    for (const m of moves) {
        if (!(m.percent > 0))
            continue;
        // one window, one resetsAt: the first chat to record it sets it for the rest
        const resetsAt = next.find(u => u.kind === m.kind && Math.abs(u.resetsAt - m.resetsAt) <= SAME_WINDOW_MS)?.resetsAt ?? m.resetsAt;
        const name = next.find(u => u.chat === m.chat && u.name !== idName(m.chat))?.name ?? m.name;
        const i = next.findIndex(u => u.kind === m.kind && u.chat === m.chat && u.resetsAt === resetsAt);
        const named = next.map(u => (u.chat === m.chat && u.name !== name ? { ...u, name } : u));
        next = i < 0 ? [...named, { ...m, resetsAt, name }] : named.map((u, j) => (j === i ? { ...u, percent: u.percent + m.percent } : u));
    }
    if (next === list)
        return list;
    const kept = new Set(Object.keys(HISTORY_KEPT).flatMap(kind => [...new Set(next.filter(u => u.kind === kind).map(u => u.resetsAt))].sort((a, b) => b - a).slice(0, HISTORY_KEPT[kind] + 1).map(at => `${kind}:${at}`)));
    return next.filter(u => kept.has(`${u.kind}:${u.resetsAt}`));
}
// a chat's name: the first prompt typed in it, on one line, cut to fit a row. A compacted
// chat opens on its summary and a slash command on its tags: those are passed over
const NAME_MAX = 48;
const isTyped = (text) => text.trim() !== '' && !/^\s*(<|This session is being continued)/.test(text);
export function chatLabel(texts, fallback) {
    const pick = texts.find(isTyped) ?? texts.find(x => x.trim() !== '') ?? '';
    const line = pick.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (line === '')
        return fallback;
    return line.length > NAME_MAX ? `${line.slice(0, NAME_MAX - 1).trimEnd()}…` : line;
}
