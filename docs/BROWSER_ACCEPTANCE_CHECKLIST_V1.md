# Browser Acceptance Checklist — Configurable Templates V1

Status: an automated browser acceptance subset passed in GitHub Actions on commit `a023aab9e8a9311fe59625cddd6302215b779271`. The full manual checklist below is not yet complete, and no separate hosted preview has been created.

## Automated browser checks completed
- [x] Demo manager login opens the workspace.
- [x] Template Designer route loads and shows the approved pilot scope.
- [x] Six baseline inspection stages appear.
- [x] Stage label rename updates the stage selector.
- [x] Hide/show updates field visibility in the preview.
- [x] Add a long-text field and confirm it appears in preview.
- [x] Mobile and desktop preview layout controls toggle their layout classes.
- [x] TFA/TPL aliases, separate Field Officer and Production Officer titles, and unmapped roles are displayed.
- [x] Roster and inspection navigation render.
- [x] Mobile configuration viewport has no horizontal overflow in the tested Chromium environment.
- [x] No uncaught browser page errors during the automated path.

These checks are a smoke/acceptance subset, not proof that every item in the manual checklist passes.

## Before testing
- Open a local checkout of `feature/configurable-paddy-templates` or use a temporary preview deployment built from this branch.
- Do not test against the public GitHub Pages URL and assume it contains these changes; Pages still serves the unchanged main branch.
- Use only the built-in synthetic demo records.
- Sign in to the demo as Production Manager with the sample credentials displayed on the welcome page.

## Template Designer
- [ ] Open **Templates & designations** from the manager navigation.
- [ ] Confirm the target scope displays Paddy, Telangana, Karimnagar, Rabi 2026–27 and November 2026.
- [ ] Confirm all six baseline inspection stages appear with their existing labels.
- [ ] Rename one stage, apply the label, and confirm it is reflected in the designer and other stage-label locations.
- [ ] Edit an existing field label and confirm the stable internal key does not change.
- [ ] Change a field to required and confirm the control is marked required.
- [ ] Edit the options of an existing single-select field and confirm the new options are shown in the entry form.
- [ ] Move a field up and down; confirm the entry form follows the new order.
- [ ] Hide a field; confirm it remains listed in the designer but disappears from the entry form preview and inspection form.
- [ ] Show the field again; confirm it reappears.
- [ ] Add a short-text, long-text, decimal, date, and single-select field (test separately); confirm each appears in the preview and inspection form.
- [ ] Retire a field; confirm it is removed from future entry and historical in-memory values are not explicitly deleted by the retire action.
- [ ] Switch between mobile and desktop preview layouts.
- [ ] Refresh the page; confirm changes reset and the UI clearly identifies itself as session-only.

## Designations
- [ ] Confirm Temporary Field Assistant with alias TFA and Territory Production Lead with alias TPL are present.
- [ ] Confirm Field Officer and Production Officer remain separate.
- [ ] Edit a title and alias; confirm the stable designation ID is unchanged.
- [ ] Confirm all designation-to-role mappings remain **Unmapped** and no permissions are assigned automatically.

## Regression checks
- [ ] Demo login still opens the selected manager, territory, and field-officer views.
- [ ] Overview and farmer/field roster still render.
- [ ] Master-list import preview still opens and validates synthetic rows.
- [ ] Planning & allocation still renders and its existing controls work.
- [ ] Production & lots and Reports still render.
- [ ] Open an inspection form before changing configuration, close it, change a field, then reopen it; confirm the inspection dialog is rebuilt with the latest template metadata.
- [ ] Check all six stage panels, stage locking, draft saving and completion gating.
- [ ] GPS UI still opens; do not grant location permissions unless testing that flow is intended.
- [ ] Mobile viewport has no clipped controls or horizontal overflow in the new workspace.

## Pass/fail recording
For each failed step, capture: browser and viewport size, page/stage, exact reproduction steps, expected result, actual result, and any console error. Do not test real grower or personal data.

## Current limitations that are expected
- Template edits reset on refresh.
- No server-side persistence, publication, approval, audit trail, immutable form versions, secure roles, or database is connected.
- The displayed pilot geography is configuration metadata only; no real Karimnagar village/grower hierarchy is loaded.
