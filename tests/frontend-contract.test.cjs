const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const js = fs.readFileSync('app.js', 'utf8');
const css = fs.readFileSync('styles.css', 'utf8');

test('secure workspace labels company master records as read-only', () => {
  assert.match(html, /Live company records · read-only/);
  assert.match(html, /Records are loaded from Supabase using your authenticated session/);
});

test('sample dashboard entry is explicit and clearly labelled', () => {
  assert.match(html, /id="openSampleDashboard"/);
  assert.match(html, /Open sample dashboards/);
  assert.match(html, /illustrative data only/);
  assert.match(js, /getElementById\('openSampleDashboard'\)\?\.addEventListener\('click'/);
  assert.match(js, /All displayed operational data is illustrative only/);
});

test('switching to sample mode clears live company context and signs out', () => {
  const start = js.indexOf("getElementById('openSampleDashboard')");
  const end = js.indexOf("secureSignOut?.addEventListener", start);
  assert.ok(start >= 0 && end > start, 'sample switch handler exists before sign-out handler');
  const handler = js.slice(start, end);
  assert.match(handler, /supabaseAuthClient\.auth\.signOut\(\)/);
  assert.match(handler, /activeCompanyId=null/);
  assert.match(handler, /activeCompanyName=''/);
  assert.match(handler, /cropRows=\[\];hybridRows=\[\]/);
  assert.match(handler, /classList\.add\('demo-authenticated'\)/);
  assert.match(handler, /page='overview'/);
});

test('secure sign-in does not display the sample dashboard as live company data', () => {
  assert.match(css, /body\.secure-authenticated #dashboardPage,body\.secure-authenticated #registryPage\{display:none!important\}/);
  assert.match(css, /body\.secure-authenticated #mastersView\{display:block!important\}/);
  assert.match(js, /No sample data is shown in this secure workspace/);
});

test('HTML IDs are unique', () => {
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicates)], []);
});

test('active company memberships are listed instead of requiring a single row', () => {
  assert.match(js, /\.select\('company_id, role_key, status, companies\(name\)'\)[\s\S]*?\.eq\('user_id',user\.id\)[\s\S]*?\.eq\('status','active'\)[\s\S]*?\.order\('company_id'\)/);
  assert.match(js, /if\(!memberships\?\.length\)/);
  assert.match(js, /if\(memberships\.length===1\)\{activateCompanyMembership\(memberships\[0\],user\);return true\}/);
  assert.match(js, /showCompanyMembershipChoices\(memberships,user\)/);
});

test('multiple-company choice does not load records until user selects a company', () => {
  const start = js.indexOf('function showCompanyMembershipChoices');
  const end = js.indexOf('async function verifyCompanyMembership', start);
  assert.ok(start >= 0 && end > start, 'company choice handler exists');
  const chooser = js.slice(start, end);
  assert.match(chooser, /activeCompanyId=null/);
  assert.match(chooser, /Select the company workspace you want to open/);
  assert.match(chooser, /companyMembershipSelect/);
  assert.match(chooser, /confirmCompanyMembership/);
  assert.match(chooser, /activateCompanyMembership\(membership,user\)/);
});
