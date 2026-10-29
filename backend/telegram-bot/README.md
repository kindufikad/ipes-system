# IPES Telegram Bot Starter

This module is a separate Node.js + Telegraf service for handling secure private-DM Telegram communication with the IPES backend.

## Folder structure

```text
backend/
└── telegram-bot/
    ├── .env.example
    ├── README.md
    ├── server.js
    └── src/
        ├── app.js
        ├── bot/
        │   ├── index.js
        │   └── topicRouter.js
        ├── config/
        │   └── index.js
        ├── controllers/
        │   └── telegramController.js
        ├── routes/
        │   └── telegramRoutes.js
        └── services/
            ├── notificationService.js
            └── userAuthService.js
```

## Environment

Copy `.env.example` to `.env` and set:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_PORT=4010
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=ipes_db
JWT_SECRET=your_jwt_secret_here
```

## Run the bot

```bash
cd backend/telegram-bot
node server.js
```

## Supported flow

- `/start` triggers private-chat account linking
- User provides registered email or Employee/Student ID
- System verifies against the MySQL `users` table and linked profile tables
- Only allowed roles can continue
- Bot stores `telegram_chat_id` on the matching user record
- Role-specific menu appears after verification

## Role-based features

- Student: Pending Evaluations, Check Deadlines
- Lab Assistant / Instructor: evaluation summaries and notifications
- Dept Head / Dean / Director: department completion and pending evaluators
- System Admin: system health logs and backup alerts

## Supergroup topic routing

The bot includes a topic router to support forum-style supergroup routing via `message_thread_id`.
