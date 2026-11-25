import { DARK, LIGHT } from './colors';
import { LANGUAGES } from './i18n';
const ALERT_AT = [50, 60, 70, 75, 80, 85, 90, 95, 100];
const AUTO_AT = [15, 20, 25, 30, 35, 40, 50, 60, 70, 80, 90];
// the name column: as wide as the longest setting's name reads in most languages
const NAME_CELLS = 30;
export function settingsTree(table, surface, view, set) {
    const { Box, Text, Select, Input } = table;
    const { settings: s, t } = view;
    const c = surface === 'desktop' && view.isLight ? LIGHT : DARK;
    const onOff = [{ value: 'true', label: t.on }, { value: 'false', label: t.off }];
    // a value set by hand outside the list still shows, as one more choice
    const percents = (list, value) => [...new Set([...list, value])].sort((a, b) => a - b).map(n => ({ value: String(n), label: `${n}%` }));
    const row = (name, control) => (<Box flexDirection="row" alignItems="center">
      <Box width={NAME_CELLS} flexShrink={0}>
        <Text>{name}</Text>
      </Box>
      {control}
    </Box>);
    const toggle = (field) => (<Select key={field} options={onOff} value={String(s[field])} onSelect={value => set(field, value === 'true')}/>);
    const colors = (field, value) => (<Box width={14}>
      <Input key={field} value={value.join(' ')} onSubmit={text => set(field, text.trim())}/>
    </Box>);
    return (<Box flexDirection="column" rowGap={surface === 'desktop' ? 0.5 : 0}>
      {row(t.language, (<Select key="language" options={[{ value: 'auto', label: t.sameAsApp }, ...Object.entries(LANGUAGES).map(([code, l]) => ({ value: code, label: l.name }))]} value={s.language} onSelect={value => set('language', value)}/>))}
      {row(t.setAlerts, toggle('notify'))}
      {row(t.setAlertAt, <Select key="alertAt" options={percents(ALERT_AT, s.alertAt)} value={String(s.alertAt)} onSelect={value => set('alertAt', Number(value))}/>)}
      {row(t.setChatCost, toggle('chatCost'))}
      {row(t.setStatusLine, toggle('statusLine'))}
      {row(t.setAutoCompact, <Select key="autoCompactAt" options={percents(AUTO_AT, s.autoCompactAt)} value={String(s.autoCompactAt)} onSelect={value => set('autoCompactAt', Number(value))}/>)}
      {row(t.setLimitColors, colors('limitColors', s.limitRamp))}
      {row(t.setContextColors, colors('contextColors', s.contextRamp))}
      <Text color={c.muted} wrap="wrap">{t.colorsHint}</Text>
    </Box>);
}
