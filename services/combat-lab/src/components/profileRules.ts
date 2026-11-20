import Ability from 'src/Ability';
import Note, * as N from 'src/Notes';
import type {AbilityCheckbox} from './controlNotes';

export type ProfileRole = 'attacker' | 'defender' | 'fighter';

interface FactionRule extends AbilityCheckbox {
  roles: readonly ProfileRole[];
}

const all: ProfileRole[] = ['attacker', 'defender', 'fighter'];
const attack: ProfileRole[] = ['attacker', 'fighter'];
const defence: ProfileRole[] = ['defender', 'fighter'];
const saves: ProfileRole[] = ['defender'];
const melee: ProfileRole[] = ['fighter'];

export const factionRules: FactionRule[] = [
  {ability: Ability.ActsOfFaith, roles: all, note: new Note('Acts of Faith',
    'Novitiates spend Faith during their attack or defence roll. Guidance rerolls one die for 1 point. Blessing retains one normal as a critical success for 2. Intervention retains a fail as a normal success for 3. Enter the available points for the whole sequence. The calculator chooses the best act for the current action.',
    'Novitiates тратят очки веры при броске атаки или защиты. Guidance за 1 очко перебрасывает кубик, Blessing за 2 сохраняет обычный успех как крит, Intervention за 3 сохраняет провал как обычный успех. Укажите запас на всю серию. Калькулятор выбирает один акт для текущего действия.')},
  {ability: Ability.IconOfFaith, roles: all, note: new Note('Icon of Faith',
    'Once per turning point the Novitiates can use two different Acts of Faith in one sequence, paying for both from the same pool.',
    'Раз за переломный момент Novitiates могут применить два разных акта в одной последовательности. Стоимость обоих вычитается из общего запаса веры.')},
  {ability: Ability.AerialAgility, roles: saves, note: new Note('Aerial Agility',
    'Vespid Stingwings. When the shooter counteracts, interrupts, moved or was set up this activation, roll a D6 for each die inflicting normal damage. A 5+ ignores that die, up to one success per Shoot action.',
    'Vespid Stingwings. Включите, если стрелок контратакует, прерывает активацию, двигался или был выставлен в этой активации. За каждый кубик с обычным уроном бросается D6. На 5+ урон этого кубика отменяется, один раз за стрельбу.')},
  {ability: Ability.BlessingsOfInfection, roles: melee, note: N.BlessingsOfInfection},
  {ability: Ability.CegorachsJest, roles: melee, note: N.CegorachsJest},
  {ability: Ability.CriticalShot, roles: ['attacker'], note: new Note('Critical Shot',
    'Phobos Strike Team. Add D3 damage to one critical success resolved with a bolt weapon in a Shoot action.',
    'Phobos Strike Team. Один прошедший крит болтерного оружия наносит дополнительно D3 урона. Заблокированный крит бонуса не даёт.')},
  {ability: Ability.CurseOfRot, roles: all, note: N.CurseOfRot},
  {ability: Ability.DominoField, roles: saves, note: new Note('Domino Field',
    'Void-Dancer Troupe. Allocate one rolled successful defence die to block all successful attack dice showing that face. An automatically retained save has no rolled face.',
    'Void-Dancer Troupe. Один успешный брошенный кубик защиты блокирует все успешные кубики атаки с той же цифрой. Например, сейв с 5 блокирует две атакующие пятёрки. Автосейв из укрытия для этого не подходит.')},
  {ability: Ability.Indomitus, roles: saves, note: N.Indomitus},
  {ability: Ability.OmnissiahsImperative, roles: saves, note: new Note('Omnissiah’s Imperative',
    'Hunter Clade, Bulwark. Improve the starting Save by one and collect an additional defence die before applying Piercing. Enter the unmodified Save on the profile.',
    'Hunter Clade, режим Bulwark. Сейв улучшается на 1, а защита получает четвёртый кубик до применения Piercing. В профиле укажите исходный сейв.')},
  {ability: Ability.Oubliex, roles: defence, note: new Note('Oubliex',
    'Mandrake Nightfiend. While active, roll a D6 when an attack die would deal damage. A 5+ ignores that die and spends Oubliex. It becomes active when readied or when its huskblade incapacitates an enemy. Devastating resolves separately.',
    'Mandrake Nightfiend. Пока Oubliex активен, бросайте D6 при уроне от кубика атаки. На 5+ весь урон этого кубика отменяется и Oubliex гаснет. Он заряжается при подготовке оперативника или убийстве хаскблейдом. Урон от Devastating проходит отдельно.')},
  {ability: Ability.PuritySeal, roles: attack, note: N.PuritySeal, label: 'Purity Seal'},
  {ability: Ability.Crush, roles: melee, note: new Note('Ravener Wrecker · Crush',
    'On every strike, both players roll off. The Wrecker adds 1 against a printed Wounds stat of 9 or less. A win adds the margin, up to 3 extra damage.',
    'При каждом ударе оба игрока бросают по D6. Wrecker прибавляет 1, если характеристика Wounds цели 9 или меньше. При победе он добавляет разницу к урону, максимум +3. При ничьей оба перебрасывают.')},
  {ability: Ability.ScryProtection, roles: saves, note: new Note('Scry Protection',
    'Inquisitorial Agents. The protected operative can retain one failed defence die as a normal save or one rolled normal save as a critical save.',
    'Inquisitorial Agents. Под защитой мистика один провал защиты можно сохранить как обычный сейв либо один выпавший обычный сейв как критический. Выбирается один вариант.')},
  {ability: Ability.MysticScryBuff, roles: attack, note: N.MysticScryBuff},
  {ability: Ability.Sturdy, roles: saves, note: new Note('Sturdy',
    'Hearthkyn Salvagers and Hernkyn Yaegirs. When collecting defence dice, convert the attacker’s retained critical successes to normal successes. Piercing Crits and Devastating have already resolved.',
    'Hearthkyn Salvagers и Hernkyn Yaegirs. При сборе кубиков защиты все сохранённые криты стрелка становятся обычными попаданиями. Уже сработавшие Piercing Crits и Devastating сохраняют эффект.')},
  {ability: Ability.StealthAssault, roles: melee, note: new Note('Stealth Assault',
    'Phobos Strike Team. After switching from Conceal to Engage, charging and fighting, resolve the first two dice consecutively. Each can strike or block.',
    'Phobos Strike Team. Если оперативник сменил Conceal на Engage, совершил Charge и начал бой, он может разрешить первые два кубика подряд. Каждым можно ударить или заблокировать.')},
  {ability: Ability.SurvivalInstincts, roles: defence, note: new Note('Survival Instincts',
    'Ratlings, excluding Ogryn and Bullgryn. When shot or fought against, enhance one block. A normal success blocks one critical, or a critical blocks two successes of either kind.',
    'Ratlings, кроме Ogryn и Bullgryn. Когда в оперативника стреляют или на него нападают в бою, один обычный успех может заблокировать крит, либо один крит может заблокировать два любых успеха.')},
  {ability: Ability.TiltingShields, roles: melee, note: N.TiltingShields},
  {ability: Ability.TranshumanPhysiology, roles: saves, note: N.TranshumanPhysiology},
  {ability: Ability.UndauntedExplorers, roles: defence, note: new Note('Undaunted Explorers',
    'Elucidian Starstriders. Halve damage from the first damaging attack die in the Resolve Attack Dice step each turning point. Round up, to a minimum of 2 without increasing the original damage.',
    'Elucidian Starstriders. Первый кубик атаки, наносящий урон в шаге разрешения, можно ослабить раз за переломный момент. Урон делится пополам с округлением вверх и минимумом 2. Например, 5 превращается в 3.')},
  {ability: Ability.ViciousVenom, roles: melee, note: new Note('Vicious Venom',
    'Vespid Stingwings, excluding the Oversight Drone. When initiating a fight, add D3 damage to one critical strike.',
    'Vespid Stingwings, кроме Oversight Drone. Если веспид начал бой, один его критический удар наносит дополнительно D3 урона. При ответном бое правило не срабатывает.')},
];

export const factionRulesFor = (role: ProfileRole) => factionRules.filter(rule => rule.roles.includes(role));

const russianHelp = new Map<Note, string>([
  [N.AutoCrits, 'Столько кубиков атаки сразу сохраняются как криты. Остальные бросаются.'],
  [N.AutoNorms, 'Можно сохранить до указанного числа обычных попаданий до броска. Калькулятор выбирает количество с учётом профиля.'],
  [N.CoverCritSaves, 'Число критических сейвов, сохраняемых за укрытие до броска защиты.'],
  [N.CoverNormSaves, 'Число обычных сейвов, сохраняемых за укрытие до броска защиты.'],
  [N.ObscuredTarget, 'Криты стрелка сохраняются как обычные попадания. Эффекты от критов отключаются, и один успех атаки сбрасывается.'],
  [N.PreParry, 'Боец может заблокировать один успех противника до обычного чередования ударов и блоков.'],
  [N.FailsToNorms, 'Изменяет до указанного числа провалов на обычные успехи. Такой кубик ещё можно улучшить до крита.'],
  [N.NormsToCrits, 'Сохраняет до указанного числа выпавших обычных успехов как криты. Кубик, уже сохранённый другим правилом, повторно сохранить нельзя.'],
  [N.PuritySeal, 'Angels of Death. При двух и более провалах атаки сбросьте один, чтобы сохранить другой как обычный успех.'],
  [N.Indomitus, 'Angels of Death. При двух и более провалах защиты сбросьте один, чтобы сохранить другой как обычный сейв.'],
  [N.MysticScryBuff, 'Inquisitorial Agents. При стрельбе, в бою и при ответном бое один провал атаки можно сохранить как обычное попадание либо один обычный успех как крит.'],
  [N.CurseOfRot, 'Plague Marines. Первоначальные тройки противника на кубиках атаки или защиты становятся неперебрасываемыми провалами и наносят ему по 1 урона. Включайте на стороне чумного десантника в пределах 3″ или 7″ от отравленного врага.'],
  [N.TranshumanPhysiology, 'Angels of Death. На броске защиты один выпавший обычный сейв можно сохранить как критический.'],
  [N.SaintlyRelics, 'При уроне от кубика атаки бросьте D6, либо 2D6 для Inspiring. Хотя бы одна 6 игнорирует урон этого кубика. Максимум один кубик за действие и два за бой.'],
  [N.HardyX, 'Кубик защиты становится критическим сейвом при результате не ниже выбранного порога.'],
  [N.FeelNoPain, 'За каждое попадание бросается D6. Если достигнут указанный порог, урон этого попадания уменьшается на 1.'],
  [N.Dueller, 'Обычный успех может блокировать критический. Brutal всё ещё требует крит для блока.'],
  [N.StrikeOnDeath, 'При выведении из строя боец может нанести один удар оставшимся успехом до снятия с поля.'],
  [N.CegorachsJest, 'При обычном ударе врага бросьте D6. Результат ниже его Hit превращает удар в блок. Одно успешное применение за бой.'],
  [N.DoubleBlock, 'Один усиленный блок за бой. Обычный успех блокирует крит, либо крит блокирует два успеха.'],
  [N.BlessingsOfInfection, 'При трёх провалах можно сбросить один и сохранить другой как обычный успех. При трёх успехах можно сбросить провал и сохранить обычный успех как крит.'],
  [N.CritDamageBonus, 'Один критический удар наносит на 1 урона больше.'],
  [N.FirstStrikeBonus, 'Первый удар, обычный или критический, наносит на 1 урона больше. Блок не расходует бонус.'],
  [N.TiltingShields, 'Враг может сохранять как крит только выпавшую 6. Автоматически сохранённые криты остаются.'],
  [N.Shock, 'Первый критический удар сбрасывает нерешённый обычный успех противника. Если обычных нет, сбрасывается крит.'],
  [N.Punishing, 'При наличии крита один провал можно сохранить как обычное попадание.'],
  [N.HalfDamageFirstStrike, 'Урон первого удара делится пополам с округлением вверх, минимум до 2. Исходный урон 0 или 1 не увеличивается.'],
  [N.NicheAbility, 'Critical+Strike даёт ещё один удар после первого крита, Strike+Strike — после первого удара. Stealth Assault позволяет разрешить два первых кубика подряд, включая блоки. Тратятся уже имеющиеся успехи.'],
  [N.DevastatingMelee, 'Каждый сохранённый крит наносит указанный урон до разрешения ударов и блоков. Сам кубик остаётся доступен.'],
  [N.Reroll, 'Balanced перебрасывает один провал, DoubleBalanced — два. Ceaseless перебрасывает провалы с одним значением, Relentless — все провалы. Режим поиска критов перебрасывает все некритические результаты.'],
]);

export function ruleDescription(note: Note, english: boolean) {
  return english ? note.description : note.russian ?? russianHelp.get(note) ?? note.description;
}
