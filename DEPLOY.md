# Deploy Docker

## Build
```bash
docker build -t telegram-cbz-bot .
```

## Run
```bash
docker run --env-file .env --restart unless-stopped telegram-cbz-bot
```

## Docker Compose
```bash
docker compose up -d --build
```

## Note
- il bot richiede `TELEGRAM_BOT_TOKEN` nel file `.env`
- supporto CBZ: sì
- supporto CBR: sì, grazie a `p7zip-full` nel container
