import fs from 'fs';
import Model from 'src/Model';
import Ability from 'src/Ability';
import FightStrategy from 'src/FightStrategy';
import { calcRemainingWoundPairProbs, consolidateWoundPairProbs } from 'src/CalcEngineFightInternal';
import { SaintlyRelicsNormal, SaintlyRelicsOff } from 'src/SaintlyRelics';

// Differential harness for the Monte Carlo Fight engine (see DiffSweep.test.ts for the idea).
//
// Fixed seed and fixed simulation count, so any difference between two checkouts is a behavior
// change rather than sampling noise. Skipped unless SWEEP_OUT is set. See VERIFICATION.md.
const OUT = process.env.SWEEP_OUT;
const maybeDescribe = OUT ? describe : describe.skip;

const SIMS = 3000;
const SEED = 24601;

maybeDescribe('fight diff sweep', () => {
  it('dumps fight fingerprints', () => {
    const out: Record<string, string> = {};

    const strategies = [
      FightStrategy.MaxDmgToEnemy, FightStrategy.MinDmgToSelf,
      FightStrategy.Strike, FightStrategy.Parry,
    ];

    for (const fnp of [0, 4]) {
      for (const relics of [SaintlyRelicsOff, SaintlyRelicsNormal]) {
        for (const acc of [0, 1]) {
          for (const n2c of [0, 1]) {
            for (const abName of ['none', 'rending', 'severe', 'punishing']) {
              const abList = abName === 'none' ? []
                : abName === 'rending' ? [Ability.Rending]
                  : abName === 'severe' ? [Ability.Severe] : [Ability.Punishing];
              for (const s1 of strategies) {
                const a = new Model(4, 3, 3, 4).setProp('wounds', 12)
                  .setProp('autoNorms', acc).setProp('normsToCrits', n2c)
                  .setProp('abilities', new Set(abList));
                const b = new Model(4, 3, 3, 4).setProp('wounds', 12)
                  .setProp('fnp', fnp).setProp('saintlyRelics', relics);
                const probs = calcRemainingWoundPairProbs(
                  a, b, s1, FightStrategy.MaxDmgToEnemy, 1, SIMS, SEED);
                const [aW, bW] = consolidateWoundPairProbs(probs);
                const key = `fight|fnp${fnp},relic${relics},acc${acc},n2c${n2c},${abName},s${s1}`;
                out[key] = `${(aW.get(0) || 0).toFixed(6)}|${(bW.get(0) || 0).toFixed(6)}`;
              }
            }
          }
        }
      }
    }

    fs.writeFileSync(OUT!, JSON.stringify(out));
    // eslint-disable-next-line no-console
    console.log(`sweep: wrote ${Object.keys(out).length} entries to ${OUT}`);
    expect(Object.keys(out).length).toBeGreaterThan(0);
  });
});
