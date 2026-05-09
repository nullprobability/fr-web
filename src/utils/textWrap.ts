export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    if (para.length === 0) {
      lines.push('');
      continue;
    }

    const words = para.split(/\s+/);
    let currentLine = '';

    for (const word of words) {
      if (word.length === 0) continue;
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const w = ctx.measureText(testLine).width;

      if (w > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = word;
      } else if (w > maxWidth) {
        lines.push(word);
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine);
    }
  }

  return lines;
}
