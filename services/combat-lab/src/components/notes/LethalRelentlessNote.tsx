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

const LethalRelentlessNote: React.FC = () => (
  <Container style={{ maxWidth: '760px', padding: '24px 16px', fontSize: '14px', lineHeight: 1.55 }}>
    <Seo
      title="Lethal + Relentless: Worse BS, Higher Kill Odds | ktcalc"
      description="A worked Kill Team 2024 example where reported kill chance is higher at BS 5+ than BS 2+ — not a bug. How Lethal and Relentless interact with tail probability."
      path="/notes/lethal-relentless/"
    />
    <p><Link to="/">&larr; Back to calculator</Link></p>

    <h1>Lethal + Relentless: why kill chance can rise as BS gets worse</h1>

    <p>
      It is possible to set up a Kill Team shooting scenario where the calculator reports a
      <em> higher</em> kill chance at BS 5+ than at BS 2+, even though every other input is identical.
      This is not a calculator bug. It is a real consequence of how Lethal and Relentless are defined
      in KT2024. This note walks through the math for the specific scenario that prompted it:
      4 attack dice, normal damage 3, crit damage 4, Lethal 5+, Reroll Relentless, Piercing 1,
      versus a 12-wound defender with a 3+ save and (optionally) Indomitus.
    </p>

    <h2 className="h3">The two rules</h2>

    <p>
      <strong>Lethal X+</strong> means an attack die scores a critical hit on an unmodified roll of X
      or higher, instead of the default 6+. Lethal cannot promote a die that would otherwise have
      failed: the calculator clamps the effective crit threshold up to the hit threshold, so for
      example Lethal 5+ at BS 6+ still only crits on a 6.
    </p>

    <p>
      <strong>Relentless</strong> lets you re-roll any number of your attack dice. The calculator
      models this as one re-roll per failed die, where each re-rolled die is statistically identical
      to the original.
    </p>

    <h2 className="h3">Per-die crit probability with Lethal 5+, Relentless</h2>

    <p>
      For BS 2+ through 5+, the effective crit threshold is 5 (so crit faces are <code>{'{5, 6}'}</code>,
      2 of 6) and BS only controls the norm/fail boundary. After one allowed re-roll per fail, per-die
      probabilities are:
    </p>

    <table style={{ borderCollapse: 'collapse', margin: '8px 0 16px' }}>
      <caption style={captionStyle}>
        Per-die probabilities for Lethal 5+ with Relentless, BS 2+ through 5+
      </caption>
      <thead>
        <tr>
          <th style={th}>BS</th>
          <th style={th}>Base crit</th>
          <th style={th}>Base norm</th>
          <th style={th}>Base fail</th>
          <th style={th}>Final crit</th>
          <th style={th}>Final norm</th>
          <th style={th}>Final fail</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style={tdLeft}>2+</td><td style={tdRight}>2/6</td><td style={tdRight}>3/6</td><td style={tdRight}>1/6</td>
          <td style={tdRight}><strong>14/36 &asymp; 0.389</strong></td><td style={tdRight}>21/36</td><td style={tdRight}>1/36</td>
        </tr>
        <tr>
          <td style={tdLeft}>3+</td><td style={tdRight}>2/6</td><td style={tdRight}>2/6</td><td style={tdRight}>2/6</td>
          <td style={tdRight}><strong>16/36 &asymp; 0.444</strong></td><td style={tdRight}>16/36</td><td style={tdRight}>4/36</td>
        </tr>
        <tr>
          <td style={tdLeft}>4+</td><td style={tdRight}>2/6</td><td style={tdRight}>1/6</td><td style={tdRight}>3/6</td>
          <td style={tdRight}><strong>18/36 = 0.500</strong></td><td style={tdRight}>9/36</td><td style={tdRight}>9/36</td>
        </tr>
        <tr>
          <td style={tdLeft}>5+</td><td style={tdRight}>2/6</td><td style={tdRight}>0</td><td style={tdRight}>4/6</td>
          <td style={tdRight}><strong>20/36 &asymp; 0.556</strong></td><td style={tdRight}>0</td><td style={tdRight}>16/36</td>
        </tr>
      </tbody>
    </table>

    <p>
      Across the BS 2+ to 5+ range shown, per-die crit probability <em>rises monotonically as BS
      degrades</em>. Each fail is a free re-roll, and every re-roll has the same 2/6 chance of
      landing in the fixed crit band. Worse BS just means more re-rolls feeding the same funnel.
      (At BS 6+ the clamp kicks in and Lethal 5+ collapses back to crit-on-6 only, so the monotonic
      claim does not extend past 5+.)
    </p>

    <h2 className="h3">Average damage falls, but that is not the same as kill chance</h2>

    <p>Expected damage per die (crit dmg 4, norm dmg 3, before saves):</p>

    <table style={{ borderCollapse: 'collapse', margin: '8px 0 16px' }}>
      <caption style={captionStyle}>
        Expected pre-save damage per attack die at Lethal 5+ Relentless
      </caption>
      <thead>
        <tr><th style={th}>BS</th><th style={th}>E[dmg per die]</th></tr>
      </thead>
      <tbody>
        <tr><td style={tdLeft}>2+</td><td style={tdRight}>14/36&middot;4 + 21/36&middot;3 &asymp; 3.31</td></tr>
        <tr><td style={tdLeft}>3+</td><td style={tdRight}>16/36&middot;4 + 16/36&middot;3 &asymp; 3.11</td></tr>
        <tr><td style={tdLeft}>4+</td><td style={tdRight}>18/36&middot;4 + 9/36&middot;3 &asymp; 2.75</td></tr>
        <tr><td style={tdLeft}>5+</td><td style={tdRight}>20/36&middot;4 &asymp; 2.22</td></tr>
      </tbody>
    </table>

    <p>
      Averages behave intuitively: better BS, more average damage. But <strong>kill chance is a tail
      probability</strong>, not an average. The shape of the distribution matters more than its mean.
    </p>

    <h2 className="h3">Why the tail flips</h2>

    <p>
      Against a 12-wound target with 4 attack dice and 2 defender dice (Piercing 1 strips one save
      die), the defender cancels roughly 1.3 hits on average, so about 2.7 hits leak. To reach 12
      leaked damage you essentially need 3+ crits to leak. Norms (3 damage each) get preferentially
      absorbed by the defender&apos;s norm saves and rarely close a 12-damage gap on their own in
      this two-save-dice setup.
    </p>

    <p>So kill probability is dominated by <code>P(&ge; 3 crits in 4 dice)</code>:</p>

    <table style={{ borderCollapse: 'collapse', margin: '8px 0 16px' }}>
      <caption style={captionStyle}>
        Probability of at least 3 crits in 4 attack dice, by BS
      </caption>
      <thead>
        <tr><th style={th}>BS</th><th style={th}>p (crit per die)</th><th style={th}>P(&ge; 3 crits in 4)</th></tr>
      </thead>
      <tbody>
        <tr><td style={tdLeft}>2+</td><td style={tdRight}>0.389</td><td style={tdRight}>&asymp; 0.169</td></tr>
        <tr><td style={tdLeft}>3+</td><td style={tdRight}>0.444</td><td style={tdRight}>&asymp; 0.234</td></tr>
        <tr><td style={tdLeft}>4+</td><td style={tdRight}>0.500</td><td style={tdRight}>&asymp; 0.313</td></tr>
        <tr><td style={tdLeft}>5+</td><td style={tdRight}>0.556</td><td style={tdRight}>&asymp; 0.404</td></tr>
      </tbody>
    </table>

    <p>
      That 2.4&times; rise from BS 2+ to BS 5+ matches the inversion the calculator reports.
      The BS 2+ attacker throws more total hits, but most of them are norms; the BS 5+ attacker
      throws fewer hits, but a far higher share of them are crits, and only crit-heavy rolls breach
      the kill line.
    </p>

    <h2 className="h3">Indomitus amplifies the inversion (in this setup)</h2>

    <p>
      Indomitus adds one defender norm save when the defender rolls two fails. A norm save can:
    </p>

    <ul>
      <li>cancel one norm hit, one-for-one; or</li>
      <li>pair with another norm save to cancel one crit hit, two-for-one.</li>
    </ul>

    <p>
      With only 2 defender dice (Piercing 1) and no cover saves, the chance of <em>also</em> having a
      second norm save available to pair off a crit is small, so most of Indomitus&apos; benefit
      lands on norm hits. In that specific setup:
    </p>

    <ul>
      <li>
        At BS 2+, the attacker generates many norm hits &mdash; Indomitus&apos; bonus save almost
        always finds a norm hit to cancel, damage drops noticeably, and kill chance drops a lot.
      </li>
      <li>
        At BS 5+, the attacker generates zero norm hits &mdash; the only way the bonus norm save
        helps is by pairing with another norm save to cancel a crit, which requires the defender to
        roll two pre-Indom norms (just 9/36) on top of two fails, an outcome that does not exist on
        2 dice. So in this scenario the bonus is a no-op.
      </li>
    </ul>

    <p>
      <strong>Important caveat:</strong> with 3 defender dice (no Piercing), or with auto-normal
      saves from cover, the extra norm save can more often pair with another norm save to cancel a
      crit. In those cases Indomitus is not a pure &quot;norm-hit eraser&quot; and the amplification
      pattern above will be different. The behaviour described here is specific to the
      Piercing 1 / no-cover scenario.
    </p>

    <h2 className="h3">Take-aways</h2>

    <ol>
      <li>
        Across BS 2+ to 5+ with Lethal 5+, per-die crit probability is independent of BS without
        re-rolls (the crit band is fixed). Adding Relentless makes per-die crit probability
        <em> increase</em> as BS worsens, because every extra fail becomes another shot at the same
        fixed crit band. At BS 6+ the clamp kicks in and this trend stops.
      </li>
      <li>
        Against a high wound threshold relative to attack volume, kill chance is driven by crit-spike
        probability, not by expected damage. The two can move in opposite directions.
      </li>
      <li>
        Indomitus and similar norm-promoting abilities compound the effect <em>in setups where extra
        norm saves rarely pair off into crit cancels</em> (e.g. the 2-defender-dice scenario above).
        With more defender dice or cover saves they can also help against crits.
      </li>
      <li>
        The rule of thumb &quot;better BS always means more kills&quot; can fail whenever Relentless
        is combined with Lethal: Relentless converts every failure into another chance at the fixed
        crit band, so worse BS feeds more dice into that band. Without Relentless, per-die crit
        probability does not depend on BS at all, so the inversion does not appear.
      </li>
    </ol>

    <p><Link to="/">&larr; Back to calculator</Link></p>
  </Container>
);

export default LethalRelentlessNote;
