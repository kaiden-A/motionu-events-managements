/**
 * Motion-U — Google Form → program roster webhook
 *
 * See docs/integrations/google-form.md for the full setup guide.
 *
 * 1. Form editor → Extensions → Apps Script, paste this file.
 * 2. Fill API_URL, EVENT_ID and FORM_KEY below.
 *    - EVENT_ID: open Admin → Participants, select the program, copy the
 *      `e=` value from the URL (…/participants?e=xxxxxxxx-xxxx-…).
 *    - FORM_KEY: the server's FORM_API_KEY value.
 * 3. Triggers (clock icon) → Add trigger → function `onFormSubmit`,
 *    event source "From form", type "On form submit".
 * 4. Authorize with your Google account.
 *
 * If the form's question titles differ, adjust QUESTION_KEYS to match.
 * Repeat submissions (same email or student ID in the program) are ignored.
 */

const API_URL = 'https://YOUR-BACKEND-HOST/public/events';
const EVENT_ID = 'YOUR-PROGRAM-UUID';
const FORM_KEY = 'YOUR-FORM-API-KEY';

const QUESTION_KEYS = {
  name: 'Full name',
  student_id: 'Student ID',
  email: 'Email',
  phone: 'Phone number',
};

function onFormSubmit(e) {
  var values = e.namedValues || {};
  var payload = {
    name: first(values[QUESTION_KEYS.name]),
    student_id: first(values[QUESTION_KEYS.student_id]),
    email: first(values[QUESTION_KEYS.email]),
    phone: first(values[QUESTION_KEYS.phone]) || '',
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

function first(list) {
  return list && list.length ? String(list[0]).trim() : '';
}
