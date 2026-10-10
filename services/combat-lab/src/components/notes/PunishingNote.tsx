import React from 'react';
import { Container } from 'react-bootstrap';
import { Link } from 'react-router-dom';

import Seo from 'src/components/Seo';

const tdRight: React.CSSProperties = { textAlign: 'right', padding: '2px 10px' };
const tdLeft: React.CSSProperties = { textAlign: 'left', padding: '2px 10px' };
const th: React.CSSProperties = { textAlign: 'left', padding: '4px 10px', borderBottom: '1px solid #ccc' };
const thRight: React.CSSProperties = { ...th, textAlign: 'right' };
const captionStyle: React.CSSProperties = {
  captionSide: 'top',
  textAlign: 'left',
  fontWeight: 'bold',
  padding: '4px 0',
  fontSize: '13px',
};

const PunishingNote: React.FC = () => (
  <Container style={{ maxWidth: '760px', padding: '24px 16px', fontSize: '14px', lineHeight: 1.55 }}>
    <Seo
      title="Why Punishing Can Lower Your Damage | ktcalc"
      description="Turning on Kill Team 2024's Punishing can lower reported damage. Not a bug: a retained dice is locked, and Punishing competes for the same fail."
      path="/notes/punishing/"
    />
    <p><Link to="/">&larr; Back to calculator</Link></p>

    <h1>Why Punishing can lower your damage</h1>

    <p>
      Here is a result that looks like a bug and isn&apos;t: switching <strong>on</strong> an ability
      that only ever <em>adds</em> a hit can make the calculator report <em>less</em> damage.
    </p>

    <p>
      <strong>Punishing</strong> reads: <em>if you retain any critical successes, you can retain one of
      your fails as a normal success instead of discarding it.</em> A fail becomes a hit. Free damage,
      surely. Yet with the right supporting rules it costs you damage, and the reason is worth
      understanding because it generalises well beyond this one ability.
    </p>

    <h2 className="h3">The setup</h2>

    <p>
      You roll <strong>1 critical, 0 normals, 1 fail</strong>. Your weapon is 3 damage on a normal,
      4 on a critical. You have <strong>Rending</strong> (&quot;if you retain any critical successes,
      you can retain one of your normal successes as a critical success instead&quot;) and one
      <strong> FailsToNorms</strong> conversion — some rule that modifies a fail into a normal success.
    </p>

    <table style={{ margin: '10px 0', borderCollapse: 'collapse' }}>
      <caption style={captionStyle}>One critical, one fail — what happens to that single fail</caption>
      <thead>
        <tr>
          <th style={th}>Line</th>
          <th style={th}>How it resolves</th>
          <th style={thRight}>Result</th>
          <th style={thRight}>Damage</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style={tdLeft}><strong>Take Punishing</strong></td>
          <td style={tdLeft}>
            Punishing <em>retains</em> the fail as a normal. That dice is now retained, so Rending
            can&apos;t promote it, and FailsToNorms has no fail left to work on.
          </td>
          <td style={tdRight}>1 crit, 1 norm</td>
          <td style={tdRight}>7</td>
        </tr>
        <tr>
          <td style={tdLeft}><strong>Decline it</strong></td>
          <td style={tdLeft}>
            FailsToNorms <em>modifies</em> the fail into a normal, which stays promotable. Rending
            then upgrades it to a critical.
          </td>
          <td style={tdRight}>2 crits, 0 norms</td>
          <td style={tdRight}><strong>8</strong></td>
        </tr>
      </tbody>
    </table>

    <p>
      Same dice, same rules, one damage apart — and the line that <em>uses</em> the optional ability is
      the worse one.
    </p>

    <h2 className="h3">Why: a dice can only be retained once</h2>

    <p>
      Kill Team distinguishes <em>retaining</em> a dice from <em>changing</em> one, and a dice can only
      be retained once. Punishing says &quot;retain one of your fails as a normal success&quot; — so the
      moment you take it, that dice is spent in the retention sense. Rending asks to
      &quot;retain one of your normal successes as a critical success <em>instead</em>&quot;, and there
      is nothing left to retain. The full breakdown of which rules lock a dice and which don&apos;t is
      on the <Link to="/rules/retained-vs-modified">Retained vs Modified Dice</Link> page.
    </p>

    <p>
      That alone would make Punishing merely <em>weaker</em> than it looks. What makes it actively
      harmful is the second ingredient.
    </p>

    <h2 className="h3">The real cause: two effects, one fail</h2>

    <p>
      Punishing and FailsToNorms both want the same resource — a fail — and they produce different
      goods from it:
    </p>

    <ul>
      <li><strong>Punishing</strong> yields a <em>retained</em> normal. Locked. Nothing can promote it.</li>
      <li><strong>FailsToNorms</strong> yields a <em>modified</em> normal. Still promotable.</li>
    </ul>

    <p>
      With one fail on the table, they are rivals, and Punishing gets there first. It converts your
      only fail into the <em>lesser</em> of the two possible normals — and in doing so strands the
      promotion, which had no other target. You didn&apos;t lose a hit; you lost the upgrade on one.
    </p>

    <p>
      Which means the paradox needs all three of these at once:
    </p>

    <ol>
      <li>exactly one fail (a contested, scarce resource);</li>
      <li>another effect that would turn that fail into a <em>promotable</em> normal;</li>
      <li>a promotion — Rending or NormsToCrits — with no other normal to work on.</li>
    </ol>

    <h2 className="h3">Where it does and doesn&apos;t bite</h2>

    <table style={{ margin: '10px 0', borderCollapse: 'collapse' }}>
      <caption style={captionStyle}>Take vs decline, 3/4 damage weapon</caption>
      <thead>
        <tr>
          <th style={th}>Roll and rules</th>
          <th style={thRight}>Take</th>
          <th style={thRight}>Decline</th>
          <th style={th}>Better</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style={tdLeft}>1c, 1f — Rending + FailsToNorms 1</td>
          <td style={tdRight}>7</td>
          <td style={tdRight}>8</td>
          <td style={tdLeft}><strong>decline</strong></td>
        </tr>
        <tr>
          <td style={tdLeft}>1c, 1f — NormsToCrits 1 + FailsToNorms 1</td>
          <td style={tdRight}>7</td>
          <td style={tdRight}>8</td>
          <td style={tdLeft}><strong>decline</strong></td>
        </tr>
        <tr>
          <td style={tdLeft}>2c, 1f — Rending + FailsToNorms 1</td>
          <td style={tdRight}>11</td>
          <td style={tdRight}>12</td>
          <td style={tdLeft}><strong>decline</strong></td>
        </tr>
        <tr>
          <td style={tdLeft}>1c, <strong>2f</strong> — Rending + FailsToNorms 1</td>
          <td style={tdRight}>11</td>
          <td style={tdRight}>8</td>
          <td style={tdLeft}>take</td>
        </tr>
        <tr>
          <td style={tdLeft}>1c, 1f — Rending only</td>
          <td style={tdRight}>7</td>
          <td style={tdRight}>4</td>
          <td style={tdLeft}>take</td>
        </tr>
        <tr>
          <td style={tdLeft}>1c, 1f — nothing else</td>
          <td style={tdRight}>7</td>
          <td style={tdRight}>4</td>
          <td style={tdLeft}>take</td>
        </tr>
      </tbody>
    </table>

    <p>
      The fourth row is the one that proves the diagnosis. Add a <em>second</em> fail and the conflict
      disappears — Punishing takes one, FailsToNorms takes the other, Rending promotes the second
      one&apos;s output, and taking Punishing wins comfortably (11 against 8). Scarcity was doing the
      damage, not Punishing itself.
    </p>

    <p>
      The last two rows are the ordinary case. When nothing else wants the fail, Punishing is exactly
      the free hit it appears to be.
    </p>

    <h2 className="h3">What the calculator does</h2>

    <p>
      Punishing is worded &quot;you <em>can</em> retain&quot;, so it is a choice, and a player who saw
      this coming would simply decline. The calculator used to take it unconditionally, which is why
      ticking the box could push the damage number down.
    </p>

    <p>
      It now resolves <em>both</em> lines through the remaining steps and keeps whichever ends better,
      the same way it already handled the Mystic Scry choice. Ties keep the retention, so every roll
      where nothing else competes for the fail behaves exactly as before. On a shoot, &quot;better&quot;
      is expected damage after the defender&apos;s saves, cover, and Piercing, so a locked normal that
      wins on raw damage can still lose once a save blocks it. The decision is made in the dice step,
      once, before defence dice are rolled — it uses the defender&apos;s profile, not the save roll
      that comes up. The shoot score includes saves, cover, and Piercing, and does not include Feel
      No Pain or Saintly Relics.
    </p>

    <h2 className="h3">The wider lesson</h2>

    <p>
      An ability that is free in isolation is not free when it consumes something another rule wanted.
      Punishing doesn&apos;t take damage away from you directly; it spends a scarce fail on the
      lower-value conversion and leaves a promotion with nothing to promote. Any time two rules draw on
      the same pool of dice, &quot;always use it&quot; stops being safe advice — which is exactly why
      the rules bother to say <em>can</em>.
    </p>

    <p><Link to="/">&larr; Back to calculator</Link></p>
  </Container>
);

export default PunishingNote;
