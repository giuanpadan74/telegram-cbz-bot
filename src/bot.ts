import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import TelegramBot from 'node-telegram-bot-api';
import JSZip from 'jszip';
import * as cheerio from 'cheerio';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN mancante');

const bot = new TelegramBot(token, { polling: true });
const tmpDir = '/tmp/telegram-cbz-bot';
fs.mkdirSync(tmpDir, { recursive: true });

function magicHex(buf: Buffer) {
  return buf.subarray(0, 8).toString('hex').toUpperCase();
}

function isZipMagic(buf: Buffer) {
  const sig = magicHex(buf).slice(0, 8);
  return sig === '504B0304' || sig === '504B0506' || sig === '504B0708';
}

function isRarMagic(buf: Buffer) {
  const sig = magicHex(buf).slice(0, 8);
  return sig === '52617221';
}

function sortImages(names: string[]) {
  return [...names]
    .filter((n) => /\.(jpe?g|png|webp|gif|bmp)$/i.test(n))
    .sort((a, b) => a.localeCompare(b, 'it', { numeric: true }));
}

async function extractFromCbz(filePath: string) {
  const data = await fs.promises.readFile(filePath);
  if (!isZipMagic(data)) throw new Error('Il file non sembra un CBZ valido');
  const zip = await JSZip.loadAsync(data);
  const entries = sortImages(Object.keys(zip.files).filter((k) => !zip.files[k].dir));
  if (!entries.length) throw new Error('Nessuna immagine trovata nel CBZ');
  const first = await zip.files[entries[0]].async('nodebuffer');
  return { buffer: first, name: path.basename(entries[0]) };
}

function find7z() {
  const candidates = ['/usr/bin/7z', '/usr/bin/7zr', '/usr/bin/bsdtar'];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

async function extractFromCbr(filePath: string) {
  const data = await fs.promises.readFile(filePath);
  if (!isRarMagic(data)) throw new Error('Il file non sembra un CBR valido');

  const bin = find7z();
  if (!bin) throw new Error('CBR valido, ma manca 7z/bsdtar per l’estrazione');

  const outDir = fs.mkdtempSync(path.join(tmpDir, 'cbr-'));
  const args = bin.includes('7z') ? ['x', '-y', `-o${outDir}`, filePath] : ['xf', filePath, '-C', outDir];
  const result = spawnSync(bin, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Estrazione CBR fallita: ${result.stderr || result.stdout || 'errore sconosciuto'}`);

  const walk = (dir: string): string[] => {
    let files: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) files = files.concat(walk(full));
      else files.push(full);
    }
    return files;
  };

  const files = sortImages(walk(outDir));
  if (!files.length) throw new Error('Nessuna immagine trovata nel CBR');
  return { buffer: await fs.promises.readFile(files[0]), name: path.basename(files[0]) };
}

async function searchMetadata(titleHint: string) {
  const q = encodeURIComponent(titleHint);
  const url = `https://www.google.com/search?q=${q}+site%3Awikipedia.org+OR+site%3Afandom.com+OR+site%3Acomicvine.gamespot.com+OR+site%3Amangaupdates.com`;
  const html = await (await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } })).text();
  const $ = cheerio.load(html);
  return $('body').text().replace(/\s+/g, ' ').slice(0, 4000);
}

function buildText(title: string, sourceNote: string) {
  return [
    '📚 *Rilevato file fumetto*',
    `📝 Titolo stimato: *${title}*`,
    '🏷️ Casa editrice: _in ricerca_',
    '📅 Prima pubblicazione: _in ricerca_',
    '🌍 Lingua: _in ricerca_',
    '🔎 Fonte: ' + sourceNote,
    '',
    '✅ Controllo formato: verificato magic number prima dell’estrazione'
  ].join('\n');
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const doc = msg.document;
  if (!doc) return;

  const name = doc.file_name || '';
  const ext = path.extname(name).toLowerCase();
  if (!['.cbz', '.cbr'].includes(ext)) return;

  try {
    const file = await bot.getFile(doc.file_id);
    const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Download fallito');
    const bytes = Buffer.from(await res.arrayBuffer());

    const tempFile = path.join(tmpDir, `${crypto.randomUUID()}${ext}`);
    fs.writeFileSync(tempFile, bytes);

    const firstImage = ext === '.cbz' ? await extractFromCbz(tempFile) : await extractFromCbr(tempFile);
    await bot.sendPhoto(chatId, firstImage.buffer, { caption: `🖼️ Prima immagine: ${firstImage.name}` });

    const titleGuess = name.replace(/\.(cbz|cbr)$/i, '').replace(/[._-]+/g, ' ').trim() || 'Titolo non rilevato';
    const info = await searchMetadata(titleGuess);
    await bot.sendMessage(chatId, buildText(titleGuess, info.slice(0, 120)), { parse_mode: 'Markdown' });
  } catch (err: any) {
    await bot.sendMessage(chatId, `❌ Errore: ${err.message}`);
  }
});

console.log('Bot avviato');
