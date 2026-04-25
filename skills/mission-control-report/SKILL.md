---
name: mission-control-report
description: Generate and deliver a daily Mission Control status report to the Discord #setup > mission-control thread. Covers dashboard status, active tasks, agents, skills, cron jobs, sessions, memory, and Obsidian vault activity. All times in 12-hour format (e.g. 2:00 AM).
version: 1.1.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [Mission Control, Discord, Report, Dashboard, Daily]
    related_skills: [discord-server-management, obsidian-hermes-memory]
---

# Mission Control Daily Report

Generate and deliver a daily Mission Control status report to Discord.

## Instructions

Run the report script directly. Do not write any code — just execute this command:

```bash
bash ~/.hermes/skills/discord/mission-control-report/report.sh
```

That's it. The script collects all data and sends the report to the Discord `#setup → mission-control` thread automatically.

## Delivery Target

- **Discord Thread:** `mission-control` inside channel `#setup`
- **Thread ID:** `1497643238767460382`
- **Schedule:** 2:00 AM daily
- **Format:** 12-hour times (e.g. `2:00 AM`, `11:45 PM`)

## What the report covers

- Mission Control dashboard status (online/offline)
- Active tasks (in_progress)
- Registered agents
- Hermes gateway status, session count, skill count
- Obsidian vault changes in the last 24 hours
- Memory last-updated time
- Upcoming cron jobs (next run times in 12-hour format)
