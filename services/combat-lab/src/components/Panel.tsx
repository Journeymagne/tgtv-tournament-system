import React from 'react';
import * as T from 'src/theme';

// The one container vocabulary for the whole app: a dark title bar over a
// bordered body. Replaces the old mix of Bootstrap `.border rounded` boxes,
// the matrix's local ThemedCard, and the footer's gradient card.
//
// Note: no colored side-stripe border. A thick `border-left` accent is the
// single most recognizable AI-UI tell; the dark title bar carries the accent.

export interface PanelProps {
  title?: React.ReactNode;
  right?: React.ReactNode;            // content pinned to the right of the title bar
  variant?: 'primary' | 'muted';
  titleFontSize?: string;
  fullWidth?: boolean;                // block + 100% width vs inline-block
  noPadding?: boolean;                // drop body padding (for flush tables)
  bodyScrollX?: boolean;              // allow horizontal scroll for wide content (mobile)
  className?: string;
  style?: React.CSSProperties;
  titleStyle?: React.CSSProperties;   // merged over the title bar defaults
  bodyStyle?: React.CSSProperties;    // merged over the body defaults
  children: React.ReactNode;
}

const Panel: React.FC<PanelProps> = ({
  title,
  right,
  variant = 'primary',
  titleFontSize = '13px',
  fullWidth = false,
  noPadding = false,
  bodyScrollX = false,
  className,
  style,
  titleStyle: titleStyleOverride,
  bodyStyle: bodyStyleOverride,
  children,
}) => {
  const muted = variant === 'muted';

  const wrapStyle: React.CSSProperties = {
    border: `1px solid ${muted ? T.borderMuted : T.borderStrong}`,
    borderRadius: '10px',
    overflow: 'hidden',
    background: T.panelBg,
    display: fullWidth ? 'block' : 'inline-block',
    width: fullWidth ? '100%' : undefined,
    verticalAlign: 'top',
    ...style,
  };

  const titleStyle: React.CSSProperties = {
    fontWeight: 'bold',
    fontSize: titleFontSize,
    color: 'var(--ink)',
    background: 'var(--surface)',
    // Flex-centered with a min-height so a title bar's height doesn't depend on
    // whether it hosts a `right` action (e.g. a button) — bars stay uniform.
    padding: '15px 20px',
    minHeight: '48px',
    display: 'flex',
    alignItems: 'center',
    ...titleStyleOverride,
  };

  const bodyStyle: React.CSSProperties = {
    padding: noPadding ? 0 : '4px 8px',
    overflowX: bodyScrollX ? 'auto' : undefined,
    ...bodyStyleOverride,
  };

  // Truthiness, not `!== undefined`: a falsy node (e.g. `right={cond && <X/>}`
  // when `cond` is false) must not render an empty title bar.
  const hasTitleBar = Boolean(title) || Boolean(right);

  return (
    <div className={['lab-panel',className].filter(Boolean).join(' ')} style={wrapStyle}>
      {hasTitleBar && (
        <div className="lab-panel-heading" style={titleStyle}>
          {right ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flex: 1 }}>
              <span>{title}</span>
              {right}
            </div>
          ) : (
            title
          )}
        </div>
      )}
      <div style={bodyStyle}>{children}</div>
    </div>
  );
};

export default Panel;
