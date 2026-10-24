const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  // The prototype does not need optional QR/spreadsheet CDN scripts for these UI checks.
  await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
  await page.route('https://cdn.sheetjs.com/**', route => route.abort());
  try {
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await page.locator('#demoLoginForm').waitFor();
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

    // Weather must use the device's GPS coordinates, not the selected farmer's village.
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({ latitude: 17.3850, longitude: 78.4867 });
    let weatherRequestUrl = '';
    await page.route('https://api.open-meteo.com/v1/forecast?**', async route => {
      weatherRequestUrl = route.request().url();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          current: {
            temperature_2m: 30, relative_humidity_2m: 45, apparent_temperature: 32,
            precipitation: 0, weather_code: 2, wind_speed_10m: 6, wind_direction_10m: 180, wind_gusts_10m: 16
          },
          daily: {
            time: ['2026-10-24'], weather_code: [2], temperature_2m_max: [31], temperature_2m_min: [23],
            precipitation_probability_max: [20], precipitation_sum: [0.3], wind_speed_10m_max: [10],
            wind_gusts_10m_max: [16], sunrise: ['2026-10-24T06:31'], sunset: ['2026-10-24T18:03'],
            daylight_duration: [41520], sunshine_duration: [39180], et0_fao_evapotranspiration: [4.2]
          }
        })
      });
    });
    await page.locator('#openFieldApp').click();
    // The field app intentionally opens behind its demo phone/OTP sign-in gate.
    await page.locator('#fieldMobile').fill('9876543210');
    await page.locator('#fieldAuthForm button[type="submit"]').click();
    await page.locator('#demoOtp').fill('123456');
    await page.locator('#fieldAuthForm button[type="submit"]').click();
    await page.locator('#seedWeatherPanel').getByText('Device GPS location · 17.3850, 78.4867').waitFor({ timeout: 10000 });
    assert.ok(weatherRequestUrl.includes('latitude=17.385'), 'Weather request must use device latitude');
    assert.ok(weatherRequestUrl.includes('longitude=78.4867'), 'Weather request must use device longitude');
    assert.ok(!(await page.locator('#seedWeatherPanel').innerText()).includes('Niphād, Maharashtra'),
      'Weather must not silently use the selected farmer village');
    assert.deepEqual(pageErrors, [], 'No uncaught browser page errors should occur during GPS weather loading');

    // Switching to a selected farmer must use the village coordinates, not the device GPS.
    await page.route('https://geocoding-api.open-meteo.com/v1/search?**', async route => {
      const url = new URL(route.request().url());
      const term = (url.searchParams.get('name') || '').toLowerCase();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [{
          id: 1, name: term === 'niphad' ? 'Niphad' : (term === 'yeola' ? 'Yeola' : 'Nashik'), latitude: term === 'yeola' ? 20.1 : 20.0833, longitude: term === 'yeola' ? 74.5 : 73.8,
          country: 'India', country_code: 'IN', admin1: 'Maharashtra'
        }] })
      });
    });
    await page.locator('#seedWeatherPanel [data-weather-location="field"]').click();
    await page.locator('#seedWeatherPanel').getByText('Niphad, Maharashtra, India · selected farmer/village').waitFor();
    assert.ok(weatherRequestUrl.includes('latitude=20.0833'), 'Selected farmer weather must use village latitude');
    assert.ok(weatherRequestUrl.includes('longitude=73.8'), 'Selected farmer weather must use village longitude');

    // Choosing a different farmer should automatically switch the forecast to that village.
    await page.locator('#assignedField').selectOption('2');
    await page.locator('#seedWeatherPanel').getByText('Yeola, Maharashtra, India · selected farmer/village').waitFor();
    assert.ok(weatherRequestUrl.includes('latitude=20.1'), 'Changing farmer should use the newly selected village latitude');
    assert.ok(weatherRequestUrl.includes('longitude=74.5'), 'Changing farmer should use the newly selected village longitude');

    await page.locator('#seedWeatherPanel [data-weather-location="device"]').click();
    await page.locator('#seedWeatherPanel').getByText('Device GPS location · 17.3850, 78.4867').waitFor();
    assert.ok(weatherRequestUrl.includes('latitude=17.385'), 'Switching back must restore device GPS weather');

    // Return to the manager workspace so the mobile overflow check still targets configuration.
    await page.locator('[data-bottom="more"]').click();
    await page.locator('#backManager').click();
    await page.locator('.nav-item[data-view="configuration"]').click();
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflow, false, 'Configuration page should not create horizontal viewport overflow at mobile width');
    assert.deepEqual(pageErrors, [], 'No uncaught browser page errors should occur');
    console.log('PASS: login, configuration route, pilot scope, six stages, rename, hide/show, add field, preview layouts, designations, roster/inspection navigation, device GPS and selected-village weather coordinates, mobile overflow, browser console');
  } catch (error) {
    console.error('FAIL:', error.stack || error);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
