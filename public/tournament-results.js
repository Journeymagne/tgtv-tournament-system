(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TGTVTournamentResults = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const signed = value => number(value) > 0 ? `+${number(value)}` : String(number(value));
  const record = row => `${number(row.wins)} / ${number(row.draws)} / ${number(row.losses)}`;
  const initial = name => Array.from(String(name).trim())[0]?.toUpperCase() || '?';

  function isReady(data = {}) {
    const tournament = data.tournament || {}, rounds = data.rounds || [];
    if (tournament.status !== 'in_progress' || tournament.roundDraft || !rounds.length) return false;
    const matches = data.teamMatches ?? data.matches ?? rounds.flatMap(round => round.matches || []);
    if (!matches.length || matches.some(match => tournament.participantMode === 'team' ? match.phase !== 'completed' : match.status !== 'completed')) return false;
    if (rounds.some(round => round.status !== 'completed' || !(round.matches || matches.filter(match => match.roundId === round.id)).length)) return false;
    if (tournament.format === 'swiss') {
      const count = Number(tournament.swissRoundCount);
      if (!Number.isSafeInteger(count) || count < 1 || rounds.length !== count) return false;
      const numbers = new Set(rounds.map(round => Number(round.roundNumber)));
      for (let n = 1; n <= count; n++) if (!numbers.has(n)) return false;
    }
    return true;
  }

  function buildModel(data = {}) {
    const tournament = data.tournament || {};
    const published = tournament.finalResults ?? data.finalResults;
    if (tournament.status !== 'completed' || !Array.isArray(published) || !published.length) return null;
    const team = tournament.participantMode === 'team';
    const entities = new Map((team ? data.rosters || [] : data.participants || []).map(entity => [Number(entity.id), entity]));
    const all = [...published].sort((a, b) => number(a.rank) - number(b.rank));
    const entries = all.slice(0, 10).map(row => {
      const id = Number(team ? row.rosterId : row.participantId), entity = entities.get(id) || {};
      return { id, rank: number(row.rank), name: entity.name || entity.displayName || entity.displayNameSnapshot || entity.teamNameSnapshot || '',
        members: team ? (entity.members || []).filter(member => !member.endedAt).map(member => member.displayNameSnapshot || member.name).filter(Boolean) : [],
        tp: number(team ? row.teamTournamentPoints : row.matchPoints), gp: number(team ? row.teamGamePoints : row.totalVp),
        showGp: !team || tournament.pairingType !== 'sword_shield_classic',
        wins: number(row.wins), draws: number(row.draws), losses: number(row.losses) };
    });
    const personalWinners = team ? (data.individualStandings || []).filter(row => number(row.rank) === 1 && number(row.gamesPlayed) + number(row.byes) > 0)
      .map(row => ({ name: row.name || '', rosters: (row.rosterNames || []).join(' · '), tp: number(row.matchPoints), gp: number(row.totalGp), diff: number(row.gpDiff) })) : [];
    return { name: tournament.name || '', slug: tournament.slug || String(tournament.id || 'tournament'), team, entries, personalWinners,
      entryCount: all.length, playerCount: team ? (data.individualStandings || []).length : all.length,
      roundCount: (data.rounds || []).filter(round => round.status === 'completed').length,
      season: String(tournament.seasonId || ''), venue: tournament.venueMode || '', completedAt: tournament.completedAt,
      startsAt: tournament.startsAt, showGp: entries[0]?.showGp !== false };
  }

  const trophy = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 3h8v7a4 4 0 0 1-8 0V3Zm0 2H4v4a4 4 0 0 0 4 4m8-8h4v4a4 4 0 0 1-4 4M12 14v5m-4 2h8"/></svg>';
  const star = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="m12 2 3 6.2 6.8 1-4.9 4.7 1.2 6.8-6.1-3.2-6.1 3.2 1.2-6.8L2.2 9.2l6.8-1L12 2Z"/></svg>';
  function label(row, t) { return row.name || t('results.unknown'); }
  function formatDate(value, locale) {
    if (!value || !Number.isFinite(Date.parse(value))) return '';
    return new Intl.DateTimeFormat(locale || 'ru', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
  }
  function metadata(model, locale) {
    return [formatDate(model.startsAt, locale), model.venue === 'irl' ? 'IRL' : model.venue === 'tts' ? 'Tabletop Simulator' : '', model.season].filter(Boolean).join(' · ');
  }
  function render(data, { t, locale = 'ru' } = {}) {
    const model = buildModel(data);
    if (!model) return '';
    const gpLabel = model.team ? 'GP' : 'VP';
    const champion = model.entries[0];
    const avatar = row => `<span class="tournament-result-avatar" aria-hidden="true">${escape(initial(label(row, t)))}</span>`;
    const podium = (row, main) => `<section class="tournament-result-card ${main ? 'tournament-result-champion' : 'tournament-result-runner'}">
      <div class="tournament-result-card-heading"><span>${main ? trophy : ''}${escape(t(main ? 'results.champions' : row.rank === 2 ? 'results.silver' : 'results.bronze'))}</span><strong>${row.tp} TP</strong></div>
      <span class="tournament-result-watermark" aria-hidden="true">${String(row.rank).padStart(2, '0')}</span>
      ${avatar(row)}<h3>${escape(label(row, t))}</h3>
      ${main && row.members.length ? `<p class="tournament-result-members">${row.members.map(escape).join(' · ')}</p>` : ''}
      <div class="tournament-result-card-footer"><span>${record(row)} ${escape(t('results.wdl'))}</span>${row.showGp ? `<strong>${row.gp} ${gpLabel}</strong>` : ''}</div>
    </section>`;
    const table = rows => `<table class="tournament-result-table"><caption class="visually-hidden">${escape(t(model.team ? 'results.topTeams' : 'results.topPlayers'))}</caption><thead><tr><th scope="col">#</th><th scope="col">${escape(t(model.team ? 'results.roster' : 'results.player'))}</th><th scope="col">TP</th>${model.showGp ? `<th scope="col">${gpLabel}</th>` : ''}<th scope="col">${escape(t('results.wdl'))}</th></tr></thead><tbody>${rows.map(row => `<tr data-result-entry="${row.id}" class="${row.rank === 1 ? 'is-champion' : ''}"><td>${String(row.rank).padStart(2, '0')}</td><th scope="row">${escape(label(row, t))}</th><td>${row.tp}</td>${model.showGp ? `<td>${row.gp}</td>` : ''}<td>${record(row)}</td></tr>`).join('')}</tbody></table>`;
    const winners = model.personalWinners;
    return `<section class="tournament-results" aria-label="${escape(t('results.title'))}">
      <div class="tournament-results-toolbar"><span class="status completed">${escape(t('results.completed'))}</span><button type="button" class="primary-button" data-tournament-results-download>${escape(t('results.download'))}</button></div>
      <p class="tournament-result-eyebrow">${escape(t('results.final'))}</p><h2>${escape(t('results.title'))}</h2>
      <h3 class="tournament-result-event-name">${escape(model.name)}</h3><p class="tournament-result-meta">${escape(metadata(model, locale))}</p>
      <div class="tournament-result-podium">${podium(champion, true)}<div class="tournament-result-runners">${model.entries.slice(1, 3).map(row => podium(row, false)).join('')}</div></div>
      ${winners.length ? `<section class="tournament-result-card tournament-result-personal">${star}<div><p class="tournament-result-eyebrow">${escape(t('results.personalWinner'))}</p><h3>${winners.map(row => escape(label(row, t))).join(' · ')}</h3><p class="tournament-result-meta">${escape([...new Set(winners.map(row => row.rosters).filter(Boolean))].join(' · '))}</p></div><div class="tournament-result-personal-score"><strong>${winners[0].tp} <small>TP</small></strong><span>${winners[0].gp} Total GP · <em>${signed(winners[0].diff)} Diff GP</em></span></div></section>` : ''}
      <section class="tournament-result-card tournament-result-topten"><h3>${escape(t(model.team ? 'results.topTeams' : 'results.topPlayers'))}</h3><div class="tournament-result-tables">${table(model.entries.slice(0, 5))}${model.entries.length > 5 ? table(model.entries.slice(5)) : ''}</div></section>
      <footer class="tournament-result-summary"><span>${model.entryCount} ${escape(t(model.team ? 'results.rosters' : 'results.players'))}${model.team ? ` · ${model.playerCount} ${escape(t('results.players'))}` : ''} · ${model.roundCount} ${escape(t('results.rounds'))}</span><span>${escape(t('results.published'))} ${escape(formatDate(model.completedAt, locale))}</span></footer>
      <p class="field-help" data-tournament-results-error role="status" aria-live="polite"></p>
    </section>`;
  }

  // Uses only text and canvas primitives: no cross-origin images, HTML rasterizer
  // or network fonts can taint the downloadable image.
  function createCanvas(model, { t, locale = 'ru', document: doc = document, colors = {} } = {}) {
    if (!model?.entries.length) throw new Error(t('results.exportFailed'));
    const palette = { surface: '#101010', panel: '#202020', ink: '#f4f4f4', muted: '#b9b9b9', line: '#3b3b3b', accent: '#ff7a1a', good: '#39c27f', ...colors };
    const canvas = doc.createElement('canvas'); canvas.width = 1200;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(t('results.exportFailed'));
    const font = (size, weight = 500) => { ctx.font = `${weight} ${size}px "Segoe UI", Arial, sans-serif`; };
    function lines(value, width, size, weight = 500) {
      font(size, weight);
      const output = []; let current = '';
      // Grapheme segmentation keeps names in languages without spaces and emoji intact.
      const segments = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter(locale, { granularity: 'grapheme' }).segment(String(value))].map(item => item.segment) : Array.from(String(value));
      for (const char of segments) {
        if (char === '\n' || (current && ctx.measureText(current + char).width > width)) { output.push(current.trimEnd()); current = char === '\n' ? '' : char; }
        else current += char;
      }
      if (current || !output.length) output.push(current.trimEnd());
      return output;
    }
    const champion = model.entries[0], heroLines = lines(label(champion, t), 445, 58, 750);
    const titleLines = lines(model.name, 1112, 18, 650);
    const headHeight = 192 + titleLines.length * 25;
    const heroHeight = Math.max(334, 176 + heroLines.length * 65 + (champion.members.length ? lines(champion.members.join(' · '), 605, 13).length * 20 : 0));
    const runners = model.entries.slice(1, 3);
    const runnerHeights = runners.map(row => Math.max(154, 95 + lines(label(row, t), 335, 23, 650).length * 28));
    const podiumHeight = Math.max(heroHeight, runnerHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, runners.length - 1) * 16);
    const winnerName = model.personalWinners.map(row => label(row, t)).join(' · ');
    const personalHeight = model.personalWinners.length ? Math.max(90, 52 + lines(winnerName, 690, 25, 700).length * 31 + lines([...new Set(model.personalWinners.map(row => row.rosters))].join(' · '), 690, 12).length * 17) : 0;
    const columns = [model.entries.slice(0, 5), model.entries.slice(5)].filter(rows => rows.length);
    const columnWidth = columns.length > 1 ? 520 : 1066;
    const rowHeights = columns.map(rows => rows.map(row => Math.max(40, 14 + lines(label(row, t), columnWidth - 246, 14, 600).length * 19)));
    const tableHeight = 95 + Math.max(...rowHeights.map(heights => heights.reduce((sum, height) => sum + height, 0)));
    canvas.height = Math.max(1120, headHeight + podiumHeight + personalHeight + tableHeight + 150);
    // Changing canvas dimensions resets its context state.
    ctx.textBaseline = 'top';
    ctx.fillStyle = palette.surface; ctx.fillRect(0, 0, canvas.width, canvas.height);
    function text(value, x, y, size, color = palette.ink, weight = 500, width = 2000, lineHeight = size * 1.3) {
      const wrapped = lines(value, width, size, weight); font(size, weight); ctx.fillStyle = color;
      for (let i = 0; i < wrapped.length; i++) ctx.fillText(wrapped[i], x, y + i * lineHeight);
      return wrapped.length * lineHeight;
    }
    function box(x, y, width, height, stroke = palette.line) {
      ctx.fillStyle = palette.panel; ctx.strokeStyle = stroke; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(x, y, width, height, 10); ctx.fill(); ctx.stroke();
    }
    function line(x, y, width) { ctx.strokeStyle = palette.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + width, y); ctx.stroke(); }
    function circle(row, x, y, size, accent = false) {
      ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2); ctx.fillStyle = palette.surface; ctx.fill(); ctx.strokeStyle = accent ? palette.accent : palette.line; ctx.lineWidth = 2; ctx.stroke();
      font(size * .43, 750); const value = initial(label(row, t)); ctx.fillStyle = palette.accent; ctx.fillText(value, x + (size - ctx.measureText(value).width) / 2, y + size * .25);
    }
    text('†  KT COMPANION', 44, 40, 15, palette.accent, 750);
    text(t('results.completed'), 920, 43, 12, palette.good, 600, 236);
    text(t('results.final').toUpperCase(), 44, 94, 11, palette.accent, 700);
    text(t('results.title'), 44, 118, 43, palette.ink, 700);
    text(model.name, 44, 180, 18, palette.ink, 650, 1112, 25);
    text(metadata(model, locale), 44, 184 + titleLines.length * 25, 11, palette.muted, 500, 1112);
    let y = headHeight + 32;
    const heroWidth = runners.length ? 680 : 1112;
    box(44, y, heroWidth, podiumHeight, palette.accent);
    text(t('results.champions').toUpperCase(), 72, y + 25, 11, palette.accent, 700, heroWidth - 150);
    text(`${champion.tp} TP`, 44 + heroWidth - 100, y + 25, 18, palette.ink, 650);
    text(label(champion, t), 72, y + 76, 58, palette.ink, 750, 445, 65);
    circle(champion, 44 + heroWidth - 155, y + 110, 100, true);
    if (champion.members.length) text(champion.members.join(' · '), 72, y + 87 + heroLines.length * 65, 13, palette.muted, 500, heroWidth - 56, 20);
    line(72, y + podiumHeight - 58, heroWidth - 56);
    text(`${record(champion)} ${t('results.wdl')}`, 72, y + podiumHeight - 37, 11, palette.muted);
    if (champion.showGp) text(`${champion.gp} ${model.team ? 'GP' : 'VP'}`, 44 + heroWidth - 100, y + podiumHeight - 37, 14, palette.ink, 650);
    let runnerY = y;
    runners.forEach((row, i) => {
      box(740, runnerY, 416, runnerHeights[i]);
      text(String(row.rank).padStart(2, '0'), 764, runnerY + 18, 29, palette.muted, 650);
      circle(row, 1090, runnerY + 19, 38);
      text(t(row.rank === 2 ? 'results.silver' : 'results.bronze').toUpperCase(), 764, runnerY + 54, 10, palette.muted, 600);
      const height = text(label(row, t), 764, runnerY + 75, 23, palette.ink, 650, 335, 28);
      text(`${row.tp} TP${row.showGp ? ` · ${row.gp} ${model.team ? 'GP' : 'VP'}` : ''}`, 764, runnerY + 79 + height, 11, palette.muted);
      runnerY += runnerHeights[i] + 16;
    });
    y += podiumHeight + 20;
    if (personalHeight) {
      box(44, y, 1112, personalHeight);
      text('☆', 68, y + 26, 38, palette.accent);
      text(t('results.personalWinner').toUpperCase(), 122, y + 17, 10, palette.accent, 700);
      const nameHeight = text(winnerName, 122, y + 36, 25, palette.ink, 700, 690, 31);
      text([...new Set(model.personalWinners.map(row => row.rosters))].join(' · '), 122, y + 38 + nameHeight, 12, palette.muted, 500, 690, 17);
      const winner = model.personalWinners[0];
      text(`${winner.tp} TP`, 1015, y + 22, 25, palette.ink, 650);
      text(`${winner.gp} Total GP · ${signed(winner.diff)} Diff GP`, 913, y + 58, 11, palette.good, 500, 220);
      y += personalHeight + 22;
    }
    box(44, y, 1112, tableHeight);
    text(t(model.team ? 'results.topTeams' : 'results.topPlayers'), 66, y + 20, 18, palette.ink, 650);
    columns.forEach((rows, column) => {
      const x = 66 + column * 548; let rowY = y + 87;
      text('#', x + 8, y + 60, 10, palette.muted);
      text(t(model.team ? 'results.roster' : 'results.player'), x + 40, y + 60, 10, palette.muted, 500, columnWidth - 246);
      text('TP', x + columnWidth - 180, y + 60, 10, palette.muted);
      if (model.showGp) text(model.team ? 'GP' : 'VP', x + columnWidth - 120, y + 60, 10, palette.muted);
      text(t('results.wdl'), x + columnWidth - 70, y + 60, 10, palette.muted);
      line(x, rowY - 8, columnWidth);
      rows.forEach((row, i) => {
        text(String(row.rank).padStart(2, '0'), x + 8, rowY + 4, 12, row.rank === 1 ? palette.accent : palette.muted);
        text(label(row, t), x + 40, rowY + 3, 14, row.rank === 1 ? palette.accent : palette.ink, 600, columnWidth - 246, 19);
        text(row.tp, x + columnWidth - 180, rowY + 3, 14, palette.ink, 700);
        if (model.showGp) text(row.gp, x + columnWidth - 120, rowY + 3, 13);
        text(record(row), x + columnWidth - 70, rowY + 5, 10, palette.muted);
        rowY += rowHeights[column][i]; if (i < rows.length - 1) line(x, rowY - 6, columnWidth);
      });
    });
    const footerY = Math.max(y + tableHeight + 35, canvas.height - 62);
    line(44, footerY, 1112);
    text(`${model.entryCount} ${t(model.team ? 'results.rosters' : 'results.players')} · ${model.roundCount} ${t('results.rounds')}`, 44, footerY + 20, 11, palette.muted);
    text(`${t('results.published')} ${formatDate(model.completedAt, locale)}`, 760, footerY + 20, 11, palette.muted, 500, 395);
    return canvas;
  }

  async function download(data, options = {}) {
    const model = buildModel(data), doc = options.document || document;
    const canvas = createCanvas(model, { ...options, document: doc });
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error(options.t('results.exportFailed'))), 'image/png'));
    const url = URL.createObjectURL(blob), link = doc.createElement('a');
    link.href = url; link.download = `${(model.name || model.slug).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 120)}-results.png`;
    try { doc.body.appendChild(link); link.click(); }
    finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  return { isReady, buildModel, render, createCanvas, download };
});
