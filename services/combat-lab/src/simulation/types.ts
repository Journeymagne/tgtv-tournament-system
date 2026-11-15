import Ability from 'src/Ability';
export type Mode='shoot'|'fight';
export interface Weapon{id:string;name:string;kind:string;attacks:number;hit:number;normal:number;critical:number;rules:string;sourcePage:number;}
export interface Operative{id:string;name:string;apl:number;move:string;save:number;wounds:number;weapons:Weapon[];sourcePage:number;rulesText:string;}
export interface SourceRule{id:string;name:string;category:string;text:string;sourcePage:number;}
export interface Team{id:string;name:string;updated:string;sourceUrl:string;operatives:Operative[];rules:SourceRule[];}
export interface Catalog{snapshot:string;source:string;teams:Team[];counts:{teams:number;operatives:number;weapons:number;rules:number};}
export interface Effect{field:string;value:number|string;operation:'set'|'add';target:'attack'|'defense'|'both';max?:number;}
export interface Bonus{id:string;name:string;mode:Mode|'both';enabled:boolean;effects:Effect[];sourcePage?:number;text?:string;}
export interface Side{teamId:string;operativeId:string;rangedId:string;meleeId:string;health:number;cover:number;obscured:boolean;bonuses:Bonus[];}
export interface PackedModel{[key:string]:any;abilities:Ability[];}
export interface Job{id:number;mode:Mode;a:PackedModel;b:PackedModel;first:'A'|'B';simulations:number;targetStartingWounds?:number;}
export interface Result{id:number;mode:Mode;distributionA:[number,number][];distributionB:[number,number][];avgA:number;avgB:number;killA:number;killB:number;injury:number;simulations:number;elapsed:number;error?:string;}
