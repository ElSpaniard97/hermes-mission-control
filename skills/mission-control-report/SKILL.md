---
name: mission-control-report
description: Generate and deliver a daily Mission Control status report to the Discord #setup > mission-control thread. Covers dashboard status, active tasks, agents, skills, cron jobs, sessions, memory, and Obsidian vault activity. All times in 12-hour format (e.g. 2:00 AM).
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [Mission Control, Discord, Report, Dashboard, Daily]
    related_skills: [discord-server-management, obsidian-hermes-memory]
---

# Mission Control Daily Report

Generate a comprehensive daily status report for Hermes Mission Control and deliver it to the Discord `#setup → mission-control` thread.

## Delivery Target

- **Discord Thread:** `mission-control` inside channel `#setup`
- **Thread ID:** `1497643238767460382`
- **Channel ID:** `1497643067895976208`
- **Schedule:** 2:00 AM daily

All timestamps must use **12-hour format** (e.g. `2:00 AM`, `11:45 PM`). Never use 24-hour format.

## Setup

```bash
DISCORD_BOT_TOKEN=$(grep "^DISCORD_BOT_TOKEN=" ~/.hermes/.env | cut -d= -f2 | tr -d '\n\r')
THREAD_ID="1497643238767460382"
MC_URL="http://localhost:3001"
MC_API_KEY=$(cat /home/zeke/hermes-mission-control/.data/.auto-generated 2>/dev/null | grep "API_KEY" | cut -d= -f2 | tr -d '\n\r')
```

## Data Collection

### 1. Mission Control Dashboard Status

```bash
# Check if MC is running
MC_STATUS=$(curl -sf "$MC_URL/api/status?action=health" -H "x-api-key: $MC_API_KEY" 2>/dev/null && echo "online" || echo "offline")

# Get active tasks
TASKS=$(curl -sf "$MC_URL/api/tasks?status=in_progress&limit=10" \
  -H "x-api-key: $MC_API_KEY" 2>/dev/null)

# Get agents
AGENTS=$(curl -sf "$MC_URL/api/agents" \
  -H "x-api-key: $MC_API_KEY" 2>/dev/null)

# Get recent activity
ACTIVITY=$(curl -sf "$MC_URL/api/activities?limit=10" \
  -H "x-api-key: $MC_API_KEY" 2>/dev/null)
```

### 2. Hermes System Status

```bash
# Gateway status
GATEWAY_STATUS=$(hermes gateway status 2>&1 | grep -E "Active:|✓|✗" | head -3)

# Cron jobs
CRON_JOBS=$(hermes cron list 2>&1)

# Recent sessions
SESSION_COUNT=$(ls ~/.hermes/sessions/ 2>/dev/null | wc -l)

# Skill count
SKILL_COUNT=$(hermes skills list 2>&1 | grep -c "│" || echo "unknown")
```

### 3. Obsidian Vault Changes (last 24h)

```bash
VAULT="/home/zeke/Hermes-Vault"
CHANGED_FILES=$(find "$VAULT" -newer "$VAULT/.obsidian" -name "*.md" \
  -not -path "*/.obsidian/*" 2>/dev/null | head -20)
```

### 4. Memory Updates

```bash
MEMORY_MODIFIED=$(stat -c "%y" ~/.hermes/memories/MEMORY.md 2>/dev/null | \
  python3 -c "import sys; from datetime import datetime; d=datetime.strptime(sys.stdin.read().strip()[:19],'%Y-%m-%d %H:%M:%S'); print(d.strftime('%-I:%M %p'))" 2>/dev/null || echo "unknown")
```

## Report Format

Compose the report in this structure:

```
📊 **Mission Control Daily Report**
🕑 Generated: [TIME in 12hr format] · [DATE]

━━━━━━━━━━━━━━━━━━━━━━

🖥️ **Dashboard** — [online/offline]
• URL: http://localhost:3001
• [any notable status from /api/status]

━━━━━━━━━━━━━━━━━━━━━━

✅ **Active Tasks** ([count])
• [task title] — [assigned_to] — [priority]
• (or "No tasks in progress" if empty)

━━━━━━━━━━━━━━━━━━━━━━

🤖 **Agents** ([count] registered)
• [agent name] — [status] — [role]

━━━━━━━━━━━━━━━━━━━━━━

⚙️ **Hermes Gateway** — [running/stopped]
• Sessions: [count]
• Skills: [count]
• Cron jobs: [list names and next run times in 12hr format]

━━━━━━━━━━━━━━━━━━━━━━

📓 **Obsidian Vault Changes** (last 24h)
• [filename] — [created/modified]
• (or "No changes" if none)

━━━━━━━━━━━━━━━━━━━━━━

🧠 **Memory** — Last updated: [TIME in 12hr format]
• [brief summary of MEMORY.md if recently updated]

━━━━━━━━━━━━━━━━━━━━━━

🔔 **Upcoming Cron Jobs** (next 24h)
• [job name] — [next run in 12hr format]
```

## Send to Discord Thread

After composing the report, send it to the thread:

```bash
curl -s -X POST \
  -H "Authorization: Bot $DISCORD_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  "https://discord.com/api/v10/channels/$THREAD_ID/messages" \
  -d "{\"content\": \"$REPORT\"}"
```

For longer reports, split into multiple messages if content exceeds 1900 characters.

## Notes

- If Mission Control dashboard is offline, report that and skip MC-specific sections
- Always convert all times to 12-hour format before including in the report
- If no data is available for a section, write "No data available" rather than omitting the section
