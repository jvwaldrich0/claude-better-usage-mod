import { duration, resumesAt, SAME_WINDOW_MS, windowName, WINDOWS } from './forecast';
import { fmt } from './i18n';
/** the alerts after these readings (the same object when nothing changed) and what to say */
export function stepAlerts(prev, limits, now, alertAt, t) {
    let alerts = prev;
    const messages = [];
    const set = (kind, w) => {
        alerts = { ...alerts, [kind]: w };
    };
    for (const kind of Object.keys(WINDOWS)) {
        const label = windowName(kind, t);
        let w = alerts[kind];
        // the window ran out: say so for a 5 hour one that had warned, then never again
        if (w && !w.isResetSaid && now >= w.resetsAt) {
            if (kind === 'five_hour' && w.sent.length > 0)
                messages.push(fmt(t.alertReset, { label }));
            w = { ...w, isResetSaid: true };
            set(kind, w);
        }
        const l = limits.find(x => x.kind === kind);
        const resetsAt = l?.resetsAt ? Date.parse(l.resetsAt) : NaN;
        if (!l || !Number.isFinite(resetsAt) || resetsAt <= now)
            continue;
        if (!w || Math.abs(w.resetsAt - resetsAt) > SAME_WINDOW_MS) {
            w = { resetsAt, sent: [], isResetSaid: false };
            set(kind, w);
        }
        const levels = [...new Set([alertAt, 100])];
        const crossed = levels.filter(level => l.percentUsed >= level && !w.sent.includes(level));
        if (crossed.length === 0)
            continue;
        // a jump past both says only the larger
        const top = Math.max(...crossed);
        messages.push(top >= 100
            ? fmt(t.alertReached, { label, when: resumesAt(resetsAt, now, t) })
            : fmt(t.alertAt, { label, percent: Math.round(l.percentUsed), time: duration(resetsAt - now) }));
        set(kind, { ...w, sent: [...w.sent, ...crossed] });
    }
    return { alerts, messages };
}
