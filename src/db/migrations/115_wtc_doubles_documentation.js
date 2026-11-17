const {defaultPages}=require('../../domain/documentation');
// Frozen additive sections. Preserve live documentation and editorial changes.
const additions={
  "ru": {
    "pairing-instructions": [
      {
        "title": "WTC Doubles · TTS · 2×2",
        "markdown": "## WTC Doubles · TTS · 2×2\n\n1. Оба капитана бросают D6; при равенстве перебрасывают. Победитель получает инициативу.\n2. Капитан без инициативы банит одну из четырёх миссий раунда. Затем капитан с инициативой банит другую. Остаются две миссии.\n3. Капитан с инициативой выбирает право составить пары игроков или назначить столы своим игрокам и первым выполняет выбранное действие.\n4. Капитан без инициативы выполняет оставшееся действие: составляет пары либо назначает столы своим игрокам. Если столы выбраны раньше соперников, они остаются закреплены за игроками.\n5. Капитан без инициативы распределяет между двумя играми оставшиеся миссии. Каждый игрок, стол и миссия используются один раз.\n6. Выполните шаги в приложении. Все встречи раунда используют два общих виртуальных стола; после завершения назначений создаются две личные игры.\n"
      },
      {
        "title": "WTC Doubles · IRL · 2×2",
        "markdown": "## WTC Doubles · IRL · 2×2\n\n1. Оба капитана бросают D6; при равенстве перебрасывают. Победитель получает инициативу.\n2. Капитан без инициативы банит одну из четырёх миссий раунда. Затем капитан с инициативой банит другую. Остаются две миссии.\n3. Капитан с инициативой выбирает право составить пары игроков или назначить столы своим игрокам и первым выполняет выбранное действие.\n4. Капитан без инициативы выполняет оставшееся действие: составляет пары либо назначает столы своим игрокам. Если столы выбраны раньше соперников, они остаются закреплены за игроками.\n5. Капитан без инициативы распределяет между двумя играми оставшиеся миссии. Каждый игрок, стол и миссия используются один раз.\n6. Выполните паринг за столом и внесите обе игры в ручную форму. Встреча использует отдельную линию из двух физических столов. Две невыбранные миссии считаются забаненными. Любой капитан или организатор может сохранить пары.\n"
      }
    ],
    "team-tiebreakers": [
      {
        "title": "WTC Doubles · 2×2",
        "markdown": "## WTC Doubles · 2×2\r\n\r\nКаждая личная игра даёт 20 GP по той же формуле ниже; две игры — 40 GP. Команда с 0–17 GP получает 0 ТП, с 18–22 GP — 1 ТП, с 23–40 GP — 2 ТП. Бонуса за суммарные VP и личных 2/1/0 ТП существующего Doubles здесь нет.\r\n\r\nПосле командных ТП сравниваются личные победы, средний SOS, суммарные итоговые VP и исходные Tac Op без бонуса Primary. SOS — среднее текущих командных ТП соперников по завершённым встречам, включая выбывших; повторная сыгранная встреча учитывается отдельно. Сравнение выполняется без округления. Незавершённая командная встреча не добавляет показатели в официальный командный зачёт.\r\n\r\nСледующие разделы описывают обычный WTC 3×3.\n"
      }
    ]
  },
  "en": {
    "pairing-instructions": [
      {
        "title": "WTC Doubles · TTS · 2×2",
        "markdown": "## WTC Doubles · TTS · 2×2\n\n1. Both captains roll D6, rerolling ties. The winner has initiative.\n2. The captain without initiative bans one of four round missions. The captain with initiative bans another. Two missions remain.\n3. The captain with initiative chooses player pairings or assigning tables to their own players and makes that choice first.\n4. The captain without initiative makes the other choice: player pairings or assigning tables to their own players. Tables selected before opponents remain attached to their players.\n5. The captain without initiative assigns the remaining missions to the two games. Each player, table and mission is used once.\n6. Complete the steps in the app. All round matches share two virtual tables; two personal games are created after all assignments.\n"
      },
      {
        "title": "WTC Doubles · IRL · 2×2",
        "markdown": "## WTC Doubles · IRL · 2×2\n\n1. Both captains roll D6, rerolling ties. The winner has initiative.\n2. The captain without initiative bans one of four round missions. The captain with initiative bans another. Two missions remain.\n3. The captain with initiative chooses player pairings or assigning tables to their own players and makes that choice first.\n4. The captain without initiative makes the other choice: player pairings or assigning tables to their own players. Tables selected before opponents remain attached to their players.\n5. The captain without initiative assigns the remaining missions to the two games. Each player, table and mission is used once.\n6. Agree the pairing at the venue and enter both games in the manual form. Each match has its own two-table line. The two unselected missions are the bans. Either captain or the organizer may save.\n"
      }
    ],
    "team-tiebreakers": [
      {
        "title": "WTC Doubles · 2×2",
        "markdown": "## WTC Doubles · 2×2\r\n\r\nEach personal game provides 20 GP using the formula below; two games provide 40 GP. A team with 0–17 GP earns 0 TP, 18–22 GP earns 1 TP, and 23–40 GP earns 2 TP. Existing Doubles' total-VP bonus and personal 2/1/0 TP do not apply.\r\n\r\nAfter team TP compare individual wins, mean SOS, total final VP and raw Tac Op without the Primary bonus. SOS averages opponents' current team TP over completed encounters, retaining withdrawn opponents and counting played repeats individually. Compare without rounding. Incomplete team matches contribute no official team standings metrics.\r\n\r\nThe following sections describe standard WTC 3×3.\n"
      }
    ]
  }
};
module.exports={version:115,name:'wtc_doubles_documentation',async up(client){
 for(const [locale,pages] of Object.entries(additions))for(const [id,sections]of Object.entries(pages)){
  const {rows:[current]}=await client.query('SELECT markdown FROM tournaments.documentation_pages WHERE page_id=$1 AND locale=$2 FOR UPDATE',[id,locale]);
  if(!current){const page=defaultPages().find(p=>p.id===id&&p.locale===locale);await client.query('INSERT INTO tournaments.documentation_pages(page_id,locale,category,title,summary,markdown,position) VALUES($1,$2,$3,$4,$5,$6,1) ON CONFLICT(page_id,locale) DO NOTHING',[page.id,page.locale,page.category,page.title,page.summary,page.markdown]);continue;}
  const missing=sections.filter(s=>!current.markdown.includes('## '+s.title));
  if(missing.length)await client.query('UPDATE tournaments.documentation_pages SET markdown=$3,version=version+1,updated_at=NOW() WHERE page_id=$1 AND locale=$2',[id,locale,missing.map(s=>s.markdown).join('\n')+'\n'+current.markdown]);
 }
}};
