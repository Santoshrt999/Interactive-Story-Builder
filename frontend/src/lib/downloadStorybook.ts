import type { CompletedChapter } from '@/store/storyStore';
import type { EndStoryResponse } from '@/api/types';
import { absoluteAssetUrl, nameWithHeart } from '@/lib/theme';

interface BuildStorybookArgs {
  storyTitle: string | null;
  chapters: CompletedChapter[];
  certificate: EndStoryResponse;
  childName: string;
  characterName: string;
  avatarEmoji: string;
}

/** Escape user/content strings for safe HTML embedding. */
function esc(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Build a self-contained, print-friendly HTML keepsake of the whole story. */
export function buildStorybookHtml({
  storyTitle,
  chapters,
  certificate,
  childName,
  characterName,
  avatarEmoji,
}: BuildStorybookArgs): string {
  const cert = certificate.certificate;
  const vocab = certificate.vocabulary;
  const prettyChild = nameWithHeart(childName);

  const chaptersHtml = chapters
    .map((c) => {
      const img = absoluteAssetUrl(c.imageUrl);
      const imgHtml = img
        ? `<img class="scene" src="${esc(img)}" alt="${esc(c.sceneDescription)}" />`
        : `<div class="scene scene--placeholder">${esc(c.sceneDescription || 'A new scene unfolds…')}</div>`;
      return `
      <section class="chapter">
        ${imgHtml}
        <h2><span class="num">${c.chapterNumber}</span> ${esc(c.title)}</h2>
        <p>${esc(c.text)}</p>
      </section>`;
    })
    .join('\n');

  const vocabHtml =
    vocab.length > 0
      ? `<section class="vocab">
          <h2>Words ${esc(childName)} collected 📖</h2>
          <ul>
            ${vocab
              .map((v) => `<li><strong>${esc(v.word)}</strong> — ${esc(v.definition)}</li>`)
              .join('\n')}
          </ul>
        </section>`
      : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(storyTitle || 'My Storybook')}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600&family=Quicksand:wght@500;600&display=swap');
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: 'Quicksand', system-ui, sans-serif;
    color: #2c2140;
    background: #14112a;
    line-height: 1.7;
  }
  .page {
    max-width: 820px;
    margin: 0 auto;
    background: #fdf6e9;
    padding: 56px 60px;
  }
  h1, h2, h3 { font-family: 'Fredoka', system-ui, sans-serif; line-height: 1.1; }
  .cover {
    text-align: center;
    padding: 90px 60px;
    background: linear-gradient(135deg, #241846, #2f1f5c);
    color: #fdf6e9;
  }
  .cover .emoji { font-size: 72px; }
  .cover h1 { font-size: 48px; margin: 12px 0 8px; }
  .cover .by { opacity: 0.85; font-size: 18px; }
  .chapter { margin: 0 0 48px; page-break-inside: avoid; }
  .chapter h2 { font-size: 30px; color: #ff7eb3; margin: 18px 0 10px; }
  .chapter h2 .num { color: #c9963f; }
  .chapter p { font-size: 19px; }
  .scene {
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
    border-radius: 18px;
    box-shadow: 0 12px 30px -12px rgba(20,13,40,0.5);
  }
  .scene--placeholder {
    display: grid;
    place-items: center;
    text-align: center;
    color: #fff;
    font-family: 'Fredoka', sans-serif;
    font-size: 20px;
    padding: 24px;
    background: linear-gradient(135deg, #5b3fb8, #4ec5ff);
  }
  .certificate {
    text-align: center;
    border: 4px solid #ffd166;
    border-radius: 24px;
    padding: 36px;
    margin: 40px 0;
    page-break-inside: avoid;
  }
  .certificate .emoji { font-size: 56px; }
  .certificate h2 { font-size: 34px; color: #ff7eb3; }
  .vocab ul { columns: 2; gap: 28px; padding-left: 18px; }
  .vocab li { margin-bottom: 8px; font-size: 16px; }
  .vocab strong { color: #ff7eb3; }
  footer { text-align: center; opacity: 0.6; margin-top: 28px; font-size: 14px; }
  @media print {
    body { background: #fff; }
    .page, .cover { max-width: none; }
    .cover { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="cover">
    <div class="emoji">${esc(avatarEmoji)}</div>
    <h1>${esc(storyTitle || cert.title)}</h1>
    <p class="by">A magical adventure by ${prettyChild} &amp; ${esc(characterName)}</p>
  </div>

  <div class="page">
    ${chaptersHtml}

    <section class="certificate">
      <div class="emoji">🏆</div>
      <p style="letter-spacing:.25em;text-transform:uppercase;font-size:13px;opacity:.6">Certificate of Adventure</p>
      <h2>${esc(cert.title)}</h2>
      <p>Awarded to <strong>${prettyChild}</strong> and their hero <strong>${esc(cert.character_name)}</strong></p>
      <p>${esc(cert.achievement)}</p>
    </section>

    ${vocabHtml}

    <footer>Made with ✨ in Fantasy Story Land</footer>
  </div>
</body>
</html>`;
}

/** Trigger a Blob download of the storybook HTML keepsake. */
export function downloadStorybook(args: BuildStorybookArgs): void {
  const html = buildStorybookHtml(args);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeTitle = (args.storyTitle || 'my-storybook')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  a.href = url;
  a.download = `${safeTitle || 'my-storybook'}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
