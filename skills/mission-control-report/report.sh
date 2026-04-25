#!/usr/bin/env bash
set -euo pipefail

DISCORD_BOT_TOKEN=$(grep "^DISCORD_BOT_TOKEN=" ~/.hermes/.env | cut -d= -f2 | tr -d '\n\r')
THREAD_ID="1497643238767460382"
MC_URL="http://localhost:3001"
MC_API_KEY=$(cat /home/zeke/hermes-mission-control/.data/.auto-generated 2>/dev/null | grep "API_KEY" | cut -d= -f2 | tr -d '\n\r' || echo "")

# Time / date
TIME=$(date +"%-I:%M %p")
DATE=$(date +"%B %-d, %Y")

# Dashboard status
MC_HEALTH=$(curl -sf "$MC_URL/api/status?action=health" -H "x-api-key: $MC_API_KEY" 2>/dev/null || echo "")
if [ -n "$MC_HEALTH" ]; then
  MC_STATUS=$(echo "$MC_HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','healthy'))" 2>/dev/null || echo "online")
else
  MC_STATUS="offline"
fi

# Tasks
TASKS_JSON=$(curl -sf "$MC_URL/api/tasks?status=in_progress&limit=10" -H "x-api-key: $MC_API_KEY" 2>/dev/null || echo "[]")
TASK_COUNT=$(echo "$TASKS_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else len(d.get('tasks',d.get('data',[]))))" 2>/dev/null || echo "0")
TASK_LINES=$(echo "$TASKS_JSON" | python3 -c "
import sys, json
d = json.load(sys.stdin)
tasks = d if isinstance(d, list) else d.get('tasks', d.get('data', []))
if not tasks:
    print('No tasks in progress')
else:
    for t in tasks[:5]:
        title = t.get('title','Untitled')
        assigned = t.get('assigned_to', t.get('assignedTo','—'))
        priority = t.get('priority','Normal')
        print(f'• {title} — {assigned} — {priority}')
" 2>/dev/null || echo "• No data available")

# Agents
AGENTS_JSON=$(curl -sf "$MC_URL/api/agents" -H "x-api-key: $MC_API_KEY" 2>/dev/null || echo "[]")
AGENT_COUNT=$(echo "$AGENTS_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else len(d.get('agents',d.get('data',[]))))" 2>/dev/null || echo "0")
AGENT_LINES=$(echo "$AGENTS_JSON" | python3 -c "
import sys, json
d = json.load(sys.stdin)
agents = d if isinstance(d, list) else d.get('agents', d.get('data', []))
if not agents:
    print('No agents registered')
else:
    for a in agents[:5]:
        name = a.get('name','Unknown')
        status = a.get('status','—')
        role = a.get('role','—')
        print(f'• {name} — {status} — {role}')
" 2>/dev/null || echo "• No data available")

# Gateway
GATEWAY_STATUS=$(hermes gateway status 2>&1 | grep -Eo "(running|stopped|active|inactive)" | head -1 || echo "unknown")

# Sessions
SESSION_COUNT=$(ls ~/.hermes/sessions/*.json 2>/dev/null | wc -l | tr -d ' ')

# Skills
SKILL_COUNT=$(hermes skills list 2>&1 | grep -c "│" 2>/dev/null || echo "unknown")

# Cron jobs
CRON_LINES=$(hermes cron list 2>&1 | python3 -c "
import sys, re
lines = sys.stdin.read()
jobs = re.findall(r'Name:\s+(.+)', lines)
nexts = re.findall(r'Next run:\s+(.+)', lines)
if not jobs:
    print('• No cron jobs')
else:
    for i, job in enumerate(jobs):
        nxt = nexts[i] if i < len(nexts) else '—'
        # Convert ISO to 12hr if possible
        import datetime
        try:
            dt = datetime.datetime.fromisoformat(nxt.strip())
            nxt = dt.strftime('%-I:%M %p %b %-d')
        except:
            pass
        print(f'• {job.strip()} — {nxt.strip()}')
" 2>/dev/null || echo "• No data available")

# Obsidian vault changes (last 24h)
VAULT="/home/zeke/Hermes-Vault"
VAULT_LINES=$(find "$VAULT" -newer "$VAULT/.obsidian" -name "*.md" -not -path "*/.obsidian/*" 2>/dev/null | head -10 | while read f; do
    fname=$(basename "$f")
    if git -C "$VAULT" log --diff-filter=A --follow --oneline "$f" 2>/dev/null | grep -q .; then
        echo "• $fname — created"
    else
        echo "• $fname — modified"
    fi
done)
[ -z "$VAULT_LINES" ] && VAULT_LINES="• No changes"

# Memory last updated
MEMORY_MODIFIED=$(stat -c "%y" ~/.hermes/memories/MEMORY.md 2>/dev/null | python3 -c "
import sys
from datetime import datetime
try:
    d = datetime.strptime(sys.stdin.read().strip()[:19], '%Y-%m-%d %H:%M:%S')
    print(d.strftime('%-I:%M %p'))
except:
    print('unknown')
" 2>/dev/null || echo "unknown")

# Build report
REPORT="📊 **Mission Control Daily Report**
🕑 Generated: $TIME · $DATE

━━━━━━━━━━━━━━━━━━━━━━

🖥️ **Dashboard** — $MC_STATUS
• URL: $MC_URL

━━━━━━━━━━━━━━━━━━━━━━

✅ **Active Tasks** ($TASK_COUNT)
$TASK_LINES

━━━━━━━━━━━━━━━━━━━━━━

🤖 **Agents** ($AGENT_COUNT registered)
$AGENT_LINES

━━━━━━━━━━━━━━━━━━━━━━

⚙️ **Hermes Gateway** — $GATEWAY_STATUS
• Sessions: $SESSION_COUNT
• Skills: $SKILL_COUNT

━━━━━━━━━━━━━━━━━━━━━━

📓 **Obsidian Vault Changes** (last 24h)
$VAULT_LINES

━━━━━━━━━━━━━━━━━━━━━━

🧠 **Memory** — Last updated: $MEMORY_MODIFIED

━━━━━━━━━━━━━━━━━━━━━━

🔔 **Upcoming Cron Jobs** (next 24h)
$CRON_LINES"

# Send to Discord (split if > 1900 chars)
send_chunk() {
    local chunk="$1"
    local escaped
    escaped=$(python3 -c "import sys, json; print(json.dumps(sys.stdin.read()))" <<< "$chunk")
    curl -s -X POST \
      -H "Authorization: Bot $DISCORD_BOT_TOKEN" \
      -H "Content-Type: application/json" \
      "https://discord.com/api/v10/channels/$THREAD_ID/messages" \
      -d "{\"content\": $escaped}" > /dev/null
}

if [ ${#REPORT} -le 1900 ]; then
    send_chunk "$REPORT"
else
    # Split at separator lines
    while IFS= read -r -d $'\x00' chunk; do
        [ -n "$chunk" ] && send_chunk "$chunk"
    done < <(echo "$REPORT" | python3 -c "
import sys
text = sys.stdin.read()
chunks = []
current = ''
for line in text.split('\n'):
    if len(current) + len(line) + 1 > 1900 and current:
        chunks.append(current)
        current = line
    else:
        current += ('\n' if current else '') + line
if current:
    chunks.append(current)
import os
sys.stdout.buffer.write(b'\x00'.join(c.encode() for c in chunks) + b'\x00')
")
fi

echo "Report delivered to Discord thread $THREAD_ID"
