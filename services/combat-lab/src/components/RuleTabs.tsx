import React from 'react';

export type RuleGroup = 'general' | 'faction';
const groups: readonly RuleGroup[] = ['general', 'faction'];
const names = {general: 'Advanced', faction: 'Фракционные правила'};

export default function RuleTabs({prefix, counts, children}: {
  prefix: string;
  counts?: Record<RuleGroup, number>;
  children: (group: RuleGroup) => React.ReactNode;
}) {
  const [active, setActive] = React.useState<RuleGroup>('general');
  const [expanded, setExpanded] = React.useState({general: false, faction: false});
  const [mobile, setMobile] = React.useState(false);
  React.useLayoutEffect(() => {
    if (!window.matchMedia) return;
    const viewport = window.matchMedia('(max-width: 680px)');
    const sync = () => setMobile(viewport.matches);
    sync();
    if (viewport.addEventListener) {
      viewport.addEventListener('change', sync);
      return () => viewport.removeEventListener('change', sync);
    }
    viewport.addListener(sync);
    return () => viewport.removeListener(sync);
  }, []);

  const tabId = (group: RuleGroup) => `${prefix}-tab-${group}`;
  const disclosureId = (group: RuleGroup) => `${prefix}-disclosure-${group}`;
  const panelId = (group: RuleGroup) => `${prefix}-panel-${group}`;
  const label = (group: RuleGroup) => <>
    {names[group]}{counts && <span className="Profile-tab-count" aria-hidden={counts[group] === 0}> {counts[group]}</span>}
  </>;

  return <div className="Profile-rule-sections">
    <div className="Profile-tabs" role="tablist" aria-label="Дополнительные правила" hidden={mobile}>
      {groups.map((group, index) => <button key={group} type="button" role="tab" id={tabId(group)}
        aria-selected={active === group} aria-controls={panelId(group)} tabIndex={active === group ? 0 : -1}
        onClick={() => setActive(group)} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? groups[0] : event.key === 'End' ? groups[1] : groups[1 - index];
          setActive(next);
          document.getElementById(tabId(next))?.focus();
        }}>
        {label(group)}
      </button>)}
    </div>
    {groups.map(group => <React.Fragment key={group}>
      <button className="Profile-disclosure" type="button" id={disclosureId(group)}
        aria-hidden={mobile ? undefined : true} tabIndex={mobile ? undefined : -1}
        aria-controls={panelId(group)} aria-expanded={expanded[group]}
        onClick={() => setExpanded(previous => ({...previous, [group]: !previous[group]}))}>
        {label(group)}
      </button>
      <div className="Profile-tab-panel" role={mobile ? 'region' : 'tabpanel'} id={panelId(group)}
        aria-labelledby={mobile ? disclosureId(group) : tabId(group)}
        hidden={mobile ? !expanded[group] : active !== group}>{children(group)}</div>
    </React.Fragment>)}
  </div>;
}
