import {PackedModel} from 'src/simulation/types';
import ShootOptions from 'src/ShootOptions';
import FightOptions from 'src/FightOptions';
export interface ShootJob {mode:'shoot';attacker1:PackedModel;defender1:PackedModel;options1:ShootOptions;attacker2:PackedModel;defender2:PackedModel;options2:ShootOptions;}
export interface FightJob {mode:'fight';fighterA:PackedModel;fighterB:PackedModel;options:FightOptions;}
export type CalculatorJob=ShootJob|FightJob;
export interface CalculatorResult {id:number;mode:'shoot'|'fight';first?:[number,[number,number][]][];second?:[number,[number,number][]][];woundsA?:[number,number][];woundsB?:[number,number][];elapsed:number;error?:string;}
