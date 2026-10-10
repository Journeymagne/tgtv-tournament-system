import React from 'react';
import { Container } from 'react-bootstrap';
import { Link } from 'react-router-dom';

import Seo from 'src/components/Seo';

const tdRight: React.CSSProperties = { textAlign: 'right', padding: '2px 10px' };
const tdLeft: React.CSSProperties = { textAlign: 'left', padding: '2px 10px' };
const th: React.CSSProperties = { textAlign: 'left', padding: '4px 10px', borderBottom: '1px solid #ccc' };
const captionStyle: React.CSSProperties = {
  captionSide: 'top',
  textAlign: 'left',
  fontWeight: 'bold',
  padding: '4px 0',
  fontSize: '13px',
};

const MysticScryBuffNote: React.FC = () => (
  <Container style={{ maxWidth: '760px', padding: '24px 16px', fontSize: '14px', lineHeight: 1.55 }}>
    <Seo
      title="Mystic Scry Buff + Rending: Best Retain | ktcalc"
      description="The Kill Team 2024 'retain a fail as a norm, or a norm as a crit' decision isn't fixed. When each choice wins with Rending, and how ktcalc models it."
      path="/notes/mystic-scry-buff/"
    />
    <p><Link to="/">&larr; Back to calculator</Link></p>

    <h1>Mystic Scry Buff + Rending: why the best choice depends on what you already rolled</h1>

    <p>
      <strong>Mystic Scry Buff</strong> is the calculator&apos;s name for an attack-dice ability that, in the
      Roll Attack Dice step of a shoot, fight, or retaliation, lets you either <em>retain one of your
      fails as a normal success</em>, <em>or</em> retain one of your normal successes as a critical
      success. You pick one, each time you attack. In-game it&apos;s the &quot;Mystic Scry&quot; ability.
    </p>

    <p>
      A single &quot;or&quot; hides a real decision. The two options do different things, and which one
      is better is not fixed &mdash; it depends on the weapon&apos;s damage <em>and</em> on the rest of
      the dice you rolled. This note walks through why, and how the calculator resolves it.
    </p>

    <h2 className="h3">The basic choice: one more hit, or one better hit</h2>

    <p>
      Ignore other abilities for a moment. Relative to the dice you rolled:
    </p>

    <ul>
      <li><strong>Fail &rarr; norm</strong> adds a brand-new hit, worth <code>normDmg</code>.</li>
      <li>
        <strong>Norm &rarr; crit</strong> upgrades a hit you already had, turning
        <code> normDmg</code> into <code>critDmg + Devastating</code> &mdash; a gain of
        <code> critDmg + Devastating &minus; normDmg</code>.
      </li>
    </ul>

    <p>
      So the crit upgrade beats the extra hit exactly when
      <code> critDmg + Devastating &gt; 2 &times; normDmg</code>. Most KT2024 weapons sit just below
      that line, so adding a hit usually wins &mdash; until Devastating or a big crit-damage spike tips
      it over:
    </p>

    <table style={{ borderCollapse: 'collapse', margin: '8px 0 16px' }}>
      <caption style={captionStyle}>Better option in isolation (no other abilities)</caption>
      <thead>
        <tr>
          <th style={th}>Norm dmg</th>
          <th style={th}>Crit dmg</th>
          <th style={th}>Devastating</th>
          <th style={th}>Crit value</th>
          <th style={th}>2 &times; norm</th>
          <th style={th}>Take</th>
        </tr>
      </thead>
      <tbody>
        <tr><td style={tdLeft}>3</td><td style={tdRight}>4</td><td style={tdRight}>0</td><td style={tdRight}>4</td><td style={tdRight}>6</td><td style={tdRight}>fail &rarr; norm</td></tr>
        <tr><td style={tdLeft}>3</td><td style={tdRight}>4</td><td style={tdRight}>2</td><td style={tdRight}>6</td><td style={tdRight}>6</td><td style={tdRight}>tie &rarr; crit</td></tr>
        <tr><td style={tdLeft}>3</td><td style={tdRight}>4</td><td style={tdRight}>3</td><td style={tdRight}>7</td><td style={tdRight}>6</td><td style={tdRight}>norm &rarr; crit</td></tr>
        <tr><td style={tdLeft}>2</td><td style={tdRight}>5</td><td style={tdRight}>0</td><td style={tdRight}>5</td><td style={tdRight}>4</td><td style={tdRight}>norm &rarr; crit</td></tr>
      </tbody>
    </table>

    <p>
      (On an exact tie the calculator takes the crit. A crit and an equal-value pile of norms are not
      really interchangeable: the crit&apos;s Devastating portion ignores saves, a crit triggers
      Piercing, and one big hit loses less to Feel No Pain than two small ones. More on that below.)
    </p>

    <h2 className="h3">Rending changes the answer &mdash; in both directions</h2>

    <p>
      <strong>Rending</strong> lets you upgrade one rolled norm to a crit <em>if you already have at
      least one crit</em>. That conditional is what makes Mystic Scry Buff interesting: the option you pick
      changes what Rending can do <em>afterward</em>, so the right pick flips depending on whether you
      already rolled a crit. Both of the following use the same weapon (norm 3, crit 4, no Devastating),
      where the isolated rule from the table above says &quot;add a hit.&quot;
    </p>

    <h3 className="h4">Case A &mdash; no crit yet: seed one so Rending can fire</h3>

    <p>You rolled <code>{'{0 crit, 2 norm}'}</code> with Rending. There is no fail to convert, so the
      choice is &quot;upgrade a norm&quot; vs &quot;do nothing&quot;:</p>

    <table style={{ borderCollapse: 'collapse', margin: '8px 0 16px' }}>
      <caption style={captionStyle}>{'{0c, 2n}'}, Rending, norm 3 / crit 4</caption>
      <thead>
        <tr><th style={th}>Option</th><th style={th}>After the buff</th><th style={th}>After Rending</th><th style={th}>Damage</th></tr>
      </thead>
      <tbody>
        <tr><td style={tdLeft}>Norm &rarr; crit</td><td style={tdRight}>1 crit, 1 norm</td><td style={tdRight}>2 crit, 0 norm</td><td style={tdRight}><strong>8</strong></td></tr>
        <tr><td style={tdLeft}>Decline</td><td style={tdRight}>0 crit, 2 norm</td><td style={tdRight}>0 crit, 2 norm (Rending can&apos;t fire)</td><td style={tdRight}>6</td></tr>
      </tbody>
    </table>

    <p>
      Taking the crit looks weak in isolation (crit value 4 &lt; 2 &times; 3), but it <em>seeds</em> the
      first crit, which then lets Rending promote the remaining norm for free. One buff becomes two
      upgrades: <code>{'{2c, 0n}'}</code> = 8, versus 6 for leaving the dice alone.
    </p>

    <h3 className="h4">Case B &mdash; already have a crit: feed Rending a norm instead</h3>

    <p>You rolled <code>{'{1 crit, 1 norm, 1 fail}'}</code> with Rending. Now all three matter:</p>

    <table style={{ borderCollapse: 'collapse', margin: '8px 0 16px' }}>
      <caption style={captionStyle}>{'{1c, 1n, 1f}'}, Rending, norm 3 / crit 4</caption>
      <thead>
        <tr><th style={th}>Option</th><th style={th}>After the buff</th><th style={th}>After Rending</th><th style={th}>Damage</th></tr>
      </thead>
      <tbody>
        <tr><td style={tdLeft}>Norm &rarr; crit</td><td style={tdRight}>2 crit, 0 norm</td><td style={tdRight}>2 crit, 0 norm (no norm to promote)</td><td style={tdRight}>8</td></tr>
        <tr><td style={tdLeft}>Fail &rarr; norm</td><td style={tdRight}>1 crit, 2 norm</td><td style={tdRight}>2 crit, 1 norm</td><td style={tdRight}><strong>11</strong></td></tr>
      </tbody>
    </table>

    <p>
      Here you should <em>not</em> take the crit. You already have one, so Rending will hand you a crit
      regardless &mdash; provided a norm survives for it to promote. Spending the buff to <em>add</em> a
      norm gives Rending something to work on, ending at <code>{'{2c, 1n}'}</code> = 11. Spending it on
      a crit consumes the very norm Rending wanted, stalling at <code>{'{2c, 0n}'}</code> = 8.
    </p>

    <p>
      Same weapon, opposite decision &mdash; driven entirely by whether you had already rolled a crit. A
      fixed rule (&quot;always take the crit&quot; or &quot;always add a hit&quot;) gets one of these two
      cases wrong.
    </p>

    <h2 className="h3">How the calculator decides</h2>

    <p>
      Rather than a fixed rule, the calculator treats Mystic Scry Buff as the per-roll choice it actually is.
      For every possible dice result it:
    </p>

    <ol>
      <li>builds the candidate outcomes &mdash; fail&rarr;norm, norm&rarr;crit, and declining;</li>
      <li>
        runs each candidate through the rest of the Roll Attack Dice step &mdash; notably Rending, then
        a defender&apos;s Obscured if present;
      </li>
      <li>
        on a shoot, scores each finished outcome by its expected damage against that defender&apos;s
        saves, cover, and Piercing, and keeps the highest. With no defender profile to score against
        (and in a fight, which resolves by strikes and parries), it falls back to pre-save damage
        (<code>crits &times; (critDmg + Devastating) + norms &times; normDmg</code>). Ties break toward
        the crit.
      </li>
    </ol>

    <p>
      Because the score is taken <em>after</em> Rending resolves, the seed-vs-feed reasoning above falls
      out automatically &mdash; the calculator does not need to special-case it. The same mechanism
      handles Obscured: when the defender turns your crits into norms, a norm&rarr;crit upgrade gains
      nothing, so the comparison naturally prefers adding a hit.
    </p>

    <p>
      Saves can flip the isolated table. Norm 3 / crit 4, one rolled normal and one fail: fail&rarr;norm
      is 6 raw and norm&rarr;crit is 4, so raw damage keeps two normals. Against one cover save and
      Piercing Crits 1, the cover blocks one of those normals (3 gets through). The crit line turns
      Piercing Crits on, the cover die is removed with the defence dice, and 4 gets through. The
      calculator takes the crit.
    </p>

    <h2 className="h3">What the choice does <em>not</em> weigh</h2>

    <p>
      Feel No Pain is still left out. Concentrating damage into one crit loses less to FNP than
      spreading it across two norms. The calculator does not account for that, beyond breaking an
      exact pre-FNP tie toward the crit.
    </p>

    <p>
      <strong>Devastating (mwx) is</strong> counted &mdash; it is folded into the crit&apos;s value, so a
      weapon with meaningful Devastating will favor the crit upgrade, as the first table shows.
    </p>

    <h2 className="h3">Take-aways</h2>

    <ol>
      <li>
        On its own, the crit upgrade beats the extra hit only when
        <code> critDmg + Devastating &gt; 2 &times; normDmg</code>; otherwise add a hit.
      </li>
      <li>
        With Rending, that rule can invert. With <em>no</em> crit yet, seeding a crit can unlock a second
        upgrade from Rending. With a crit already in hand, Rending will promote a norm for you, so the
        buff is better spent keeping a norm alive for it.
      </li>
      <li>
        The calculator resolves the choice by trying every option through the remaining steps and keeping
        the most damage, so Rending and Obscured interactions are handled without a fixed rule.
      </li>
      <li>
        On a shoot, that damage is the expected total after the defender&apos;s saves, cover, and
        Piercing. Feel No Pain is not weighed, beyond breaking exact ties toward the crit.
      </li>
    </ol>

    <p><Link to="/">&larr; Back to calculator</Link></p>
  </Container>
);

export default MysticScryBuffNote;
