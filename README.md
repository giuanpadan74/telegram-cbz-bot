# telegram-cbz-bot

Bot Telegram per gruppi:
- rileva upload di file .cbz e .cbr
- verifica il formato reale dell'archivio
- estrae e invia la prima immagine
- cerca metadati del fumetto e risponde in italiano

## Note
- CBZ: supportato via ZIP
- CBR: riconoscimento formato attivo, estrazione RAR non completa in questa versione
- se il file è un falso con estensione sbagliata, viene bloccato dal controllo magic number

## Avvio
```bash
bun install
TELEGRAM_BOT_TOKEN=... bun run start
```
