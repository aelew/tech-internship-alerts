# 🔔 Tech Internship Alerts

Monitors GitHub repositories for new internships and sends alerts to Discord. This project is inspired by [cvrve/internships-bot](https://github.com/cvrve/internships-bot)!

## ✨ Features

- Mentions users with the `@Internship Alerts` role when a new internship is found
- Automatically edits alert embeds when a listing becomes inactive
- Adjustable cron schedule via environment variable
- Monitor multiple GitHub repositories at once

[![Example](./images/example.png)](https://discord.gg/P93Kc6jEKA)

## 🌱 Discord server

Join the [Tech Internship Alerts Discord server](https://discord.gg/P93Kc6jEKA) to get notified when new internships are posted!

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command | Action                |
| :------ | :-------------------- |
| `bun i` | Installs dependencies |
| `bun .` | Starts monitoring bot |

This project was created using `bun init` in bun v1.1.27. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.

## 🧾 License

[MIT](https://choosealicense.com/licenses/mit/)
