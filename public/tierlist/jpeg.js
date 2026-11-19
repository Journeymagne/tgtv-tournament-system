function wrapWords(context, value, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of value.split(/\s+/)) {
    const next = line ? line + ' ' + word : word;
    if (line && context.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  lines.push(line);
  return lines;
}

export async function createTierlistJpeg(board, { title, season, cardSize, showNames }) {
  const doc = board.ownerDocument, view = doc.defaultView;
  const style = view.getComputedStyle(board);
  const font = style.fontFamily;
  const background = style.getPropertyValue('--bg').trim();
  const ink = style.getPropertyValue('--ink').trim();
  const muted = style.getPropertyValue('--muted').trim();
  const well = style.getPropertyValue('--surface-well').trim();

  // Capture the ranked cards in display order before decoding their miniatures.
  const tiers = Array.from(board.querySelectorAll('.tl-tier'), row => {
    const label = row.querySelector('.tl-rank'), rankStyle = view.getComputedStyle(label);
    return { rank: label.textContent, fill: rankStyle.backgroundColor, ink: rankStyle.color,
      cards: Array.from(row.querySelectorAll('.tl-card'), card => ({ name: card.title, image: card.querySelector('img') })) };
  });
  await Promise.all(tiers.flatMap(tier => tier.cards.map(async card => {
    try { await card.image.decode(); }
    catch { card.image = null; } // Keep the team identifiable by name if the miniature is unavailable.
  })));

  const canvas = doc.createElement('canvas'), ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw Error('Canvas unavailable');
  const width = 1280, scale = 1.5, margin = 24, gap = 8, inset = 8, rankWidth = 76;
  const laneX = margin + rankWidth + gap, laneWidth = width - margin - laneX;
  const columns = Math.max(1, Math.floor((laneWidth - inset * 2 + gap) / (cardSize + gap)));
  const titleFont = '700 32px ' + font, cardFont = '600 12px ' + font;
  ctx.font = titleFont;
  const titleLines = wrapWords(ctx, title, width - margin * 2);
  const titleHeight = titleLines.length * 38;
  const firstTierY = margin + titleHeight + 40;
  ctx.font = cardFont;
  for (const tier of tiers) {
    let labelLines = 0;
    for (const card of tier.cards) {
      card.lines = wrapWords(ctx, card.name, cardSize - 4);
      if (showNames) labelLines = Math.max(labelLines, card.lines.length);
    }
    tier.cellHeight = cardSize + (labelLines ? 4 + 15 * labelLines : 0);
    const rowCount = Math.max(1, Math.ceil(tier.cards.length / columns));
    tier.height = inset * 2 + rowCount * tier.cellHeight + (rowCount - 1) * gap;
  }

  const height = firstTierY + tiers.reduce((sum, tier) => sum + tier.height + gap, 0) - gap + margin;
  canvas.width = width * scale; canvas.height = Math.ceil(height * scale);
  ctx.scale(scale, scale);
  ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.font = titleFont; ctx.fillStyle = ink; ctx.textBaseline = 'top';
  titleLines.forEach((line, i) => ctx.fillText(line, margin, margin + 38 * i, width - margin * 2));
  ctx.font = '500 18px ' + font; ctx.fillStyle = muted;
  ctx.fillText(season, margin, margin + titleHeight + 3, width - margin * 2);

  let y = firstTierY;
  ctx.textAlign = 'center';
  for (const tier of tiers) {
    ctx.fillStyle = well; ctx.fillRect(laneX, y, laneWidth, tier.height);
    ctx.fillStyle = tier.fill; ctx.fillRect(margin, y, rankWidth, tier.height);
    ctx.fillStyle = tier.ink; ctx.font = '800 34px ' + font; ctx.textBaseline = 'middle';
    ctx.fillText(tier.rank, margin + rankWidth / 2, y + tier.height / 2);
    ctx.font = cardFont; ctx.fillStyle = ink; ctx.textBaseline = 'top';
    tier.cards.forEach((card, index) => {
      const x = laneX + inset + (index % columns) * (cardSize + gap);
      const top = y + inset + Math.floor(index / columns) * (tier.cellHeight + gap);
      if (card.image) {
        const ratio = (cardSize - 6) / Math.max(card.image.naturalWidth, card.image.naturalHeight);
        const w = card.image.naturalWidth * ratio, h = card.image.naturalHeight * ratio;
        ctx.drawImage(card.image, x + (cardSize - w) / 2, top + cardSize - h - 3, w, h);
      }
      if (showNames || !card.image) {
        const labelY = showNames ? top + cardSize + 4 : top + (cardSize - card.lines.length * 15) / 2;
        card.lines.forEach((line, i) => ctx.fillText(line, x + cardSize / 2, labelY + 15 * i, cardSize - 4));
      }
    });
    y += tier.height + gap;
  }
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob?.type === 'image/jpeg') resolve(blob);
    else reject(Error('JPEG encoding failed'));
  }, 'image/jpeg', 0.92));
}
