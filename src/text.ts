// Plain-text formatting for non-interactive output.

const useColor = process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== "dumb";

function style(code: number, reset: number) {
  return (text: string) => (useColor ? `\x1b[${code}m${text}\x1b[${reset}m` : text);
}

export const bold = style(1, 22);
export const dim = style(2, 22);
export const green = style(32, 39);
export const red = style(31, 39);

/** Word-wrap `text` to `width` columns, indenting every line. */
export function wrap(text: string, indent = "", width = 88): string {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && indent.length + line.length + 1 + word.length > width) {
      lines.push(indent + line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(indent + line);
  return lines.join("\n");
}

/** A bulleted item whose continuation lines align under the text. */
export function bullet(text: string, indent = "  ", mark = "-"): string {
  const first = `${indent}${mark} `;
  return wrap(text, " ".repeat(first.length)).replace(" ".repeat(first.length), first);
}
