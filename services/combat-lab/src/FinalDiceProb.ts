export default class FinalDiceProb {
  public prob: number;
  public crits: number;
  public norms: number;
  public cursed: number = 0; // Curse of Rot: how many of the rolled dice were 3s (1 damage each to the roller)

  public constructor(
    prob: number,
    crits: number,
    norms: number
  ) {
    this.prob = prob;
    this.crits = crits;
    this.norms = norms;
  }

  public successes(): number {
    return this.crits + this.norms;
  }
}
