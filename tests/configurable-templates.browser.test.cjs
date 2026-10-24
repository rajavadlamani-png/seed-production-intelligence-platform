const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  try {
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    assert.match(await page.title(), /Seed Production Monitor/);
    await page.locator('#demoUsername').fill('manager');
    await page.locator('#demoPassword').fill('demo123');
    await page.locator('#demoLoginForm button[type="submit"]').click();
    await page.locator('.nav-item[data-view="configuration"]').click();
    await page.getByRole('heading', { name: 'Templates & designations' }).waitFor();
    for (const expected of ['Paddy', 'Telangana', 'Karimnagar', 'Rabi 2026–27', 'November 2026']) {
      assert.ok((await page.locator('#registryPage').innerText()).includes(expected), 'Pilot scope should show ' + expected);
    }
    const stageSelect = page.locator('#templateStageSelect');
    assert.equal(await stageSelect.locator('option').count(), 6, 'Six baseline stages should be present');
    assert.ok((await stageSelect.innerText()).includes('First Inspection Report'));

    await page.locator('#templateStageLabel').fill('QA First Inspection Report');
    await page.locator('#applyStageLabel').click();
    assert.equal(await stageSelect.locator('option').nth(0).innerText(), 'QA First Inspection Report');

    const firstFieldButton = page.locator('[data-toggle-hidden]').first();
    const fieldKey = await firstFieldButton.getAttribute('data-toggle-hidden');
    await firstFieldButton.click();
    assert.equal(await page.locator('[data-toggle-hidden="' + fieldKey + '"]').innerText(), 'Show');
    assert.equal(await page.locator('#templatePreview').locator('div').count(), await page.locator('.template-field-row').count() - 1,
      'Hidden field should be omitted from preview');
    await page.locator('[data-toggle-hidden="' + fieldKey + '"]').click();
    assert.equal(await page.locator('[data-toggle-hidden="' + fieldKey + '"]').innerText(), 'Hide');

    await page.locator('#addTemplateField [name="label"]').fill('QA Supervisor Notes');
    await page.locator('#addTemplateField [name="type"]').selectOption('textarea');
    await page.locator('#addTemplateField').locator('button[type="submit"]').click();
    assert.ok((await page.locator('#templatePreview').innerText()).includes('QA Supervisor Notes'));

    await page.locator('[data-preview-layout="desktop"]').click();
    assert.ok(await page.locator('#templatePreview').evaluate(el => el.classList.contains('desktop-preview')));
    await page.locator('[data-preview-layout="mobile"]').click();
    assert.ok(await page.locator('#templatePreview').evaluate(el => el.classList.contains('mobile-preview')));

    const designationText = await page.locator('.designation-panel').innerText();
    for (const expected of ['Temporary Field Assistant', 'TFA', 'Field Officer', 'Production Officer', 'Territory Production Lead', 'TPL', 'Unmapped']) {
      assert.ok(designationText.includes(expected), 'Designation config should include ' + expected);
    }

    await page.locator('.nav-item[data-view="fields"]').click();
    await page.locator('#registryPage').waitFor();
    assert.ok((await page.locator('#registryPage').innerText()).includes('Farmer'));
    await page.locator('.nav-item[data-view="inspections"]').click();
    assert.ok((await page.locator('#registryPage').innerText()).toLowerCase().includes('inspection'));

    await page.locator('.nav-item[data-view="configuration"]').click();
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflow, false, 'Configuration page should not create horizontal viewport overflow at mobile width');
    assert.deepEqual(pageErrors, [], 'No uncaught browser page errors should occur');
    console.log('PASS: login, configuration route, pilot scope, six stages, rename, hide/show, add field, preview layouts, designations, roster/inspection navigation, mobile overflow, browser console');
  } catch (error) {
    console.error('FAIL:', error.stack || error);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
