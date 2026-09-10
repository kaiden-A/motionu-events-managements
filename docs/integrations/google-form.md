# Google Form → Program Roster Integration

Automatically add Google Form respondents to a program's participant roster using
a Google Apps Script trigger that calls the public Motion-U webhook.

Repeat submissions are handled idempotently: if someone with the same email or
student ID already exists in the program, the existing record is returned and
nothing is duplicated.

## How it works

```
Google Form submission
  └─ Apps Script onFormSubmit trigger
       └─ POST /api/v1/public/events/{event_id}/participants   (X-Form-Key header)
            └─ Participant + attendance/QR rows created in the program
```

New participants appear on the **Participants** page. QR passes are **not**
emailed automatically — use **Email all passes**, or the per-participant
**Email QR pass** action, when you are ready.

## Endpoint

| | |
|---|---|
| Method | `POST` |
| Path | `/api/v1/public/events/{event_id}/participants` |
| Header | `X-Form-Key: <FORM_API_KEY>` |
| Body | `{"name": "...", "student_id": "...", "email": "...", "phone": "..."}` — `phone` optional |

All API routes live under the `/api/v1` prefix. The health endpoint is
unprefixed at `/health`.

Responses:

| Status | Meaning |
|---|---|
| `201 Created` | Participant added |
| `200 OK` | Duplicate (same email/student ID) — existing record returned |
| `401 Unauthorized` | Missing or wrong `X-Form-Key` |
| `404 Not Found` | Program (event) ID does not exist |
| `422 Unprocessable Entity` | Missing/invalid body fields |
| `503 Service Unavailable` | `FORM_API_KEY` is not configured on the server |

## 1. Configure the server

Set a long random secret in the API environment (`.env` locally, host env in
production):

```env
FORM_API_KEY=your-long-random-secret
```

The API must be reachable over public HTTPS from Google's servers so the Apps
Script can call it.

## 2. Get the program ID

Open **Admin → Participants**, select the program, and copy the `e=` value from
the browser URL:

```
https://your-admin-host/participants?e=8f3c1a2e-...   ← this is EVENT_ID
```

## 3. Create the Apps Script

1. Open Apps Script:
   - from the form: **Extensions → Apps Script**, or
   - from the linked response Sheet: **Extensions → Apps Script**.
2. Paste the sample from [`google-form.gs`](./google-form.gs).
3. Fill in the constants:
   - `API_URL` — your API origin plus the public form path, e.g.
     `https://api.example.com/api/v1/public/events`
   - `EVENT_ID` — from step 2
   - `FORM_KEY` — the same value as `FORM_API_KEY`
4. Adjust `QUESTION_KEYS` to match your form's question titles — matching
   ignores case and extra whitespace.
5. **Triggers** (clock icon) → **Add trigger** → function `onFormSubmit`:
   - script bound to the Form → event source **From form**, event type
     **On form submit**; or
   - script bound to the Sheet → event source **From spreadsheet**, event type
     **On form submit**.
6. Authorize with your Google account.

The sample reads `e.namedValues` when present (spreadsheet-bound triggers) and
falls back to `e.response.getItemResponses()` (form-bound triggers, which have
no `namedValues`).

Submit a test response; the participant should appear on the Participants page
within a few seconds.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `401 Invalid form key` | `FORM_KEY` and `FORM_API_KEY` differ |
| `503 Public form API is not configured` | Set `FORM_API_KEY` and restart the API |
| `404 Program not found` | `EVENT_ID` is wrong or the program was deleted |
| `422` with `input: ""` | Form-bound script reading `e.namedValues` (only spreadsheet triggers provide it) — use the sample's `collectAnswers()`, or bind the script to the response Sheet |
| `422` with non-empty input | Question titles don't match `QUESTION_KEYS`; log `Object.keys(answers)` to see the actual titles |
| Nothing in the roster, no error | Trigger not installed or not authorized |

Apps Script errors are visible under **Executions** in the Apps Script editor.
The script uses `muteHttpExceptions: true` and logs failures with `console.error`.
