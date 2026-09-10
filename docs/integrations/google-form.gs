/**
 * Motion-U — Google Form → program roster webhook
 *
 * See docs/integrations/google-form.md for the full setup guide.
 *
 * 1. Paste this file into Apps Script:
 *    - from the form: Extensions → Apps Script, or
 *    - from the response Sheet: Extensions → Apps Script.
 * 2. Fill API_URL, EVENT_ID and FORM_KEY below.
 *    - EVENT_ID: open Admin → Participants, select the program, copy the
 *      `e=` value from the URL (…/participants?e=xxxxxxxx-xxxx-…).
 *    - FORM_KEY: the server's FORM_API_KEY value.
 * 3. Triggers (clock icon) → Add trigger → function `onFormSubmit`:
 *    - script bound to the Form → event source "From form" → "On form submit"
 *    - script bound to the Sheet → event source "From spreadsheet" → "On form submit"
 * 4. Authorize with your Google account.
 *
 * QUESTION_KEYS must match the form's question titles; matching ignores case
 * and extra whitespace. Repeat submissions (same email or student ID in the
 * program) are ignored.
 */

const API_URL = 'https://YOUR-BACKEND-HOST/api/v1/public/events';
const EVENT_ID = 'YOUR-PROGRAM-UUID';
const FORM_KEY = 'YOUR-FORM-API-KEY';

const QUESTION_KEYS = {
  name: 'Full name',
  student_id: 'Student ID',
  email: 'Email',
  phone: 'Phone number',
};

function onFormSubmit(e) {
  var answers = collectAnswers(e);
  var payload = {
    name: valueOf(answers, QUESTION_KEYS.name),
    student_id: valueOf(answers, QUESTION_KEYS.student_id),
    email: valueOf(answers, QUESTION_KEYS.email),
    phone: valueOf(answers, QUESTION_KEYS.phone) || '',
  };

  var response = UrlFetchApp.fetch(API_URL + '/' + EVENT_ID + '/participants', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Form-Key': FORM_KEY },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  var code = response.getResponseCode();
  if (code !== 200 && code !== 201) {
    console.error('Motion-U webhook failed (' + code + '): ' + response.getContentText());
  }
}

// Spreadsheet-bound triggers provide e.namedValues; form-bound triggers do not
// and expose the submission through e.response instead. Support both.
function collectAnswers(e) {
  var answers = {};
  if (e && e.namedValues) {
    Object.keys(e.namedValues).forEach(function (title) {
      answers[normalize(title)] = e.namedValues[title];
    });
  } else if (e && e.response) {
    e.response.getItemResponses().forEach(function (itemResponse) {
      answers[normalize(itemResponse.getItem().getTitle())] = itemResponse.getResponse();
    });
  }
  return answers;
}

function valueOf(answers, title) {
  if (!title) return '';
  var value = answers[normalize(title)];
  if (value == null) return '';
  return Array.isArray(value) ? value.join(', ') : String(value).trim();
}

function normalize(title) {
  return String(title || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
