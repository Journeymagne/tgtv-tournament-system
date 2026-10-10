import fs from 'fs';
import Model from 'src/Model';
import Ability from 'src/Ability';
import * as Util from 'src/Util';
import * as Common from 'src/CalcEngineCommon';
import { calcDmgProbs } from 'src/CalcEngineShoot';

// Differential harness for the exact Shoot engine and the shared post-roll step.
//
// This does not assert anything on its own. It dumps a fingerprint of engine behavior over a large
// scenario sweep, so the SAME sweep can be run on two checkouts and the outputs diffed. That turns
// "did this change anything it shouldn't have?" into a question with a countable answer: every
// difference must be attributable to an intended change, and everything else must be byte-identical.
//
// Skipped unless SWEEP_OUT is set, so it costs nothing in the normal suite. See VERIFICATION.md.
const OUT = process.env.SWEEP_OUT;
const maybeDescribe = OUT ? describe : describe.skip;

const ABILITY_SETS: [string, Ability[]][] = [
  ['none', []],
  ['rending', [Ability.Rending]],
  ['severe', [Ability.Severe]],
  ['punishing', [Ability.Punishing]],
  ['punishing+rending', [Ability.Punishing, Ability.Rending]],
  ['mysticScry', [Ability.MysticScryBuff]],
  ['mysticScry+rending', [Ability.MysticScryBuff, Ability.Rending]],
  ['waaagh', [Ability.NormToCritIfAtLeastTwoNorms]],
  ['puritySeal', [Ability.PuritySeal]],
  ['closeAssault', [Ability.FailToNormIfAtLeastTwoSuccesses]],
  ['obscured', [Ability.ObscuredTarget]],
  ['rending+obscured', [Ability.Rending, Ability.ObscuredTarget]],
];

maybeDescribe('shoot diff sweep', () => {
  it('dumps engine fingerprints', () => {
    const out: Record<string, string> = {};

    // 1. Exhaustive sweep of the shared post-roll step, which both engines route through.
    for (const [abName, abList] of ABILITY_SETS) {
      const abilities = new Set(abList);
      for (let crits = 0; crits <= 3; crits++) {
        for (let norms = 0; norms <= 3; norms++) {
          for (let fails = 0; fails <= 3; fails++) {
            for (let addC = 0; addC <= 2; addC++) {
              for (let addN = 0; addN <= 2; addN++) {
                for (let f2n = 0; f2n <= 2; f2n++) {
                  for (let n2c = 0; n2c <= 2; n2c++) {
                    for (const [nd, cd] of [[0, 0], [3, 4], [3, 8], [4, 5]]) {
                      const r = Common.applyPostRollModifications(
                        crits, norms, fails, addC, addN, f2n, n2c, abilities, nd, cd);
                      const key = `post|${abName}|${crits},${norms},${fails}|${addC},${addN}|${f2n},${n2c}|${nd},${cd}`;
                      out[key] = `${r.crits},${r.norms}`;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // 2. Grid sweep of the full exact Shoot pipeline, including saves, cover and Piercing.
    // Records expected damage AND total probability mass, so a corrupted distribution shows up.
    for (const atkDice of [2, 4]) {
      for (const bs of [3, 4]) {
        for (const lethal of [0, 5]) {
          for (const atkAutoNorms of [0, 1]) {
            for (const [abName, abList] of ABILITY_SETS) {
              for (const save of [3, 4]) {
                for (const cover of [0, 1, 2]) {
                  for (const defN2c of [0, 1]) {
                    for (const px of [0, 1]) {
                      const atk = new Model(atkDice, bs, 3, 4)
                        .setProp('lethal', lethal)
                        .setProp('autoNorms', atkAutoNorms)
                        .setProp('px', px)
                        .setProp('abilities', new Set(abList));
                      const def = new Model(3, save)
                        .setProp('autoNorms', cover)
                        .setProp('normsToCrits', defN2c);
                      const dmgs = calcDmgProbs(atk, def);
                      const mass = Array.from(dmgs.values()).reduce((a, b) => a + b, 0);
                      const key = `shoot|${atkDice},${bs},L${lethal},acc${atkAutoNorms},px${px},${abName}`
                        + `|sv${save},cov${cover},n2c${defN2c}`;
                      out[key] = `${Util.weightedAverage(dmgs).toFixed(9)}|${mass.toFixed(9)}`;
                    }
                  }
                }
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
