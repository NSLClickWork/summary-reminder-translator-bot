# NSL Bot System — Developer Conventions

> This file defines the architecture, naming rules, and technical standards for all current and future bots in the NSL system.  
> **Read this before adding any new bot or module.**

---

## 1. Project Structure

```
NSL Bot/
├── summary_master/          # Bot 1: Communication Brain (Summarization)
│   ├── index.js             # Entry point — loads env & starts adapters
│   ├── .env                 # Secrets & config (NEVER commit to Git)
│   ├── src/
│   │   ├── adapters/
│   │   │   ├── slack.js     # Slack Bolt App instance + event listeners
│   │   │   ├── slack_ui.js  # App Home UI + button/modal handlers
│   │   │   └── airtable.js  # Airtable write helper
│   │   ├── modules/
│   │   │   └── summary_master/
│   │   │       ├── channel_summarizer.js
│   │   │       ├── morning_brief.js
│   │   │       └── thread_summarizer.js
│   │   ├── ai/
│   │   │   └── engine.js    # Unified AI caller (Groq / OpenAI compatible)
│   │   └── data/
│   │       └── summary_state.json  # Persists last-summarized timestamps
│   └── package.json
│
├── workflow_enforcer/       # Bot 2: Workflow & Deadline Manager
│   ├── index.js
│   ├── .env
│   ├── src/
│   │   ├── adapters/
│   │   │   ├── slack.js     # init(slackApp) — registers all modules
│   │   │   └── slack_ui.js  # App Home UI + Read Me modal
│   │   ├── modules/
│   │   │   ├── approvals.js
│   │   │   ├── deadlines.js
│   │   │   └── sync.js
│   │   └── ai/              # (reserved for future AI features)
│   └── package.json
│
├── Start_NSL_Bots.bat       # Double-click to start all bots on local machine
└── CONVENTIONS.md           # This file
```

### Rule: One folder = One Slack App
Each top-level folder corresponds to **one independent Slack App** with its own tokens, App Home, and entry point.

---

## 2. Technology Stack

| Concern          | Library              | Notes                                    |
|------------------|----------------------|------------------------------------------|
| Slack framework  | `@slack/bolt`        | Socket Mode (no public URL needed)       |
| Env variables    | `dotenv`             | `.env` file in root of each bot folder   |
| Scheduling       | `node-schedule`      | ✅ Use this for ALL cron jobs (not `node-cron`) |
| Airtable         | `airtable`           | One shared base ID per company           |
| AI Engine        | Groq / OpenAI-compat | Abstracted via `src/ai/engine.js`        |

---

## 3. Timezone Convention

> **All cron jobs must be written in UTC time.**  
> This makes the code portable to any cloud server (Railway, AWS, etc.) regardless of the server's local timezone.

| Event                        | Vietnam Time | Germany Time | UTC (cron expression) |
|------------------------------|--------------|--------------|------------------------|
| Morning Brief                | 08:00 AM     | 03:00 AM     | `0 1 * * *`           |
| Approval / Deadline Reminder | 11:00 AM     | 06:00 AM     | `0 4 * * *`           |

---

## 4. Environment Variable (`.env`) Convention

Each bot folder must have a `.env` file. **Never share tokens between bots.**

### Required variables for every bot:
```
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...
PORT=3000  # Use 3001, 3002... for additional bots on the same machine
```

### Shared Airtable config (both bots use the same Airtable base):
```
AIRTABLE_API_KEY=pat...
AIRTABLE_BASE_ID=app...
```

### Bot-specific config (document new vars here when added):
| Variable                       | Bot                | Purpose                                      |
|--------------------------------|--------------------|----------------------------------------------|
| `AI_BASE_URL`                  | summary_master     | Groq or OpenAI API base URL                  |
| `AI_API_KEY`                   | summary_master     | AI API key                                   |
| `AI_MODEL_NAME`                | summary_master     | Model name (e.g. `llama-3.3-70b-versatile`)  |
| `AIRTABLE_TABLE_NAME`          | summary_master     | Airtable table for Decision Memos            |
| `MORNING_BRIEF_CHANNELS`       | summary_master     | Comma-separated channel IDs to scan          |
| `MORNING_BRIEF_REPORT_CHANNEL` | summary_master     | Channel ID to post the Morning Brief report  |

---

## 5. Airtable Convention

One Airtable **Base** (`appCrnefkdGqzZAtK`) is shared by all bots.  
Each bot gets its **own Table** inside that base — never mix concerns into one table.

| Table Name          | Owner bot           | Key Fields                                                          |
|---------------------|---------------------|---------------------------------------------------------------------|
| `NSL Decision Memo Bot` | summary_master  | `Content`, `Source Channel`, `Date`                                 |
| `Approvals`         | workflow_enforcer   | `Task_Name`, `Requester`, `Approver_Slack_ID`, `Status`, `Created_Date`, `Notes` |
| `Tasks`             | workflow_enforcer   | `Task_Name`, `Assignee_Slack_ID`, `Deadline` (YYYY-MM-DD), `Status` |

### Field naming rules:
- Use `PascalCase` with underscores for multi-word fields: `Task_Name`, `Slack_ID`
- Status fields always use Single Select with consistent options: `Pending` / `Approved` / `Rejected` / `Done`
- Date fields always use Airtable's **Date** type (format: `YYYY-MM-DD`)
- Slack user IDs are stored as plain text (e.g., `U1234ABCD`)

---

## 6. Slack App Home UI Convention

Every bot **must** have an App Home with:
1. A **header** with the bot's name and emoji.
2. A **description section** with a `📖 How it works (Read Me)` button that opens a modal explaining all features in English.
3. A **divider** separating the header from feature buttons.
4. Each feature listed as a `section` block with an `accessory` button.

### Button `action_id` naming:
- Format: `btn_<verb>_<noun>` (e.g. `btn_check_approvals`, `btn_cross_team_sync`)
- For dynamic IDs (per-record): `btn_approve_${recordId}` — register with a **regex handler**: `slackApp.action(/btn_approve_/, ...)`

---

## 7. Adding a New Bot — Checklist

When creating a new bot (e.g. `recruiter_bot`):

- [ ] Create a new top-level folder: `NSL Bot/recruiter_bot/`
- [ ] Run `npm init -y` then `npm install @slack/bolt dotenv node-schedule airtable`
- [ ] Copy the `index.js` pattern from `workflow_enforcer/index.js`
- [ ] Create its own Slack App at [api.slack.com](https://api.slack.com/apps) with:
  - Socket Mode: **ON**
  - Home Tab: **ON**
  - Event Subscriptions → `app_home_opened`: **ON**
- [ ] Add its entry to `Start_NSL_Bots.bat`
- [ ] Create its own Table in Airtable (do NOT reuse existing tables)
- [ ] Add new env vars to this document's table in Section 5
- [ ] Use `0 4 * * *` (UTC) for 11:00 AM VN reminders
- [ ] All UI and bot messages must be in **English**

---

## 8. Language & Message Convention

- **All code comments**: English
- **All Slack messages** sent by the bot: **English**
- **Log messages** (`console.log`): English
- **Error messages shown to users**: English with a friendly tone
- **Internal notes in `.env`**: English or Vietnamese (either is fine)

---

## 9. Error Handling Convention

All Slack action handlers and module functions must follow this pattern:

```js
slackApp.action('btn_example', async ({ ack, body, client }) => {
    await ack(); // Always ack() first, before any async work
    try {
        // ... business logic
    } catch (error) {
        console.error('Error in btn_example handler:', error);
        // Show a user-friendly error in Slack when possible
    }
});
```

**Never leave a `btn_review_` or similar handler with only `ack()` and no logic.**

---

*Last updated: June 2026 — Summary Master + Workflow Enforcer deployed.*
