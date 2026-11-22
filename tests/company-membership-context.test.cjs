const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

const authStart = app.indexOf('async function verifyCompanyMembership(user){');
const authEnd = app.indexOf("secureLoginForm?.addEventListener('submit'", authStart);
assert.ok(authStart >= 0 && authEnd > authStart, 'Company membership verification function must exist');
const auth = app.slice(authStart, authEnd);

assert.match(auth, /\.from\('company_memberships'\)/, 'Memberships must come from the authorized membership table');
assert.match(auth, /\.eq\('user_id',user\.id\)/, 'Membership query must be scoped to the authenticated user');
assert.match(auth, /\.eq\('status','active'\)/, 'Only active memberships may be considered');
assert.match(auth, /companies\(id, name, slug, status\)/, 'Company status must be available for active-company validation');
assert.match(auth, /company\?\.status==='active'/, 'Memberships in inactive companies must be excluded');
assert.doesNotMatch(auth, /\.maybeSingle\(/, 'Multi-company users must not be forced into a single-row membership lookup');
assert.match(app, /memberships\.length===1/, 'A single active membership should be handled without a chooser');
assert.match(app, /secureCompanyChooser\?\.classList\.remove\('hidden'\)/, 'Multiple memberships must display the company chooser');
assert.match(auth, /availableCompanyMemberships\.find\(/, 'Selection must resolve only against the returned authorized memberships');
assert.match(app, /activeCompanyMembership=membership/, 'The selected membership must establish the current company context');
assert.match(app, /if\(event==='SIGNED_OUT'\)[\s\S]*?clearActiveCompanyContext\(\)/, 'Signing out must clear company context');

for (const id of ['secureCompanyChooser', 'secureCompanySelect', 'secureCompanyContinue', 'secureCompanyFeedback', 'secureNextStep', 'secureStatusText']) {
  assert.ok(html.includes('id="' + id + '"'), 'Missing company selection UI element: ' + id);
}

console.log('Multi-company workspace selection source-contract tests passed.');
