const modeButtons = [...document.querySelectorAll('[data-mode]')];
const manager = document.getElementById('managerView');
const field = document.getElementById('fieldView');
const dashboardPage = document.getElementById('dashboardPage');
const registryPage = document.getElementById('registryPage');
const toast = document.getElementById('toast');
let toastTimer;

function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function openRegistry() {
  dashboardPage.classList.add('hidden');
  registryPage.classList.remove('hidden');
}

function openDashboard() {
  registryPage.classList.add('hidden');
  dashboardPage.classList.remove('hidden');
}

function showManagerPage(page = 'overview') {
  modeButtons.forEach(button => button.classList.toggle('active', button.dataset.mode === 'manager'));
  field.classList.add('hidden');
  manager.classList.remove('hidden');
  if (page === 'fields') openRegistry();
  else openDashboard();
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('selected', item.dataset.view === page));
}

modeButtons.forEach(button => button.addEventListener('click', () => {
  modeButtons.forEach(tab => tab.classList.toggle('active', tab === button));
  const showField = button.dataset.mode === 'field';
  manager.classList.toggle('hidden', showField);
  field.classList.toggle('hidden', !showField);
}));

document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => {
  const page = button.dataset.view;
  if (page === 'overview' || page === 'fields') showManagerPage(page);
  else {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('selected', item === button));
    notify(`${button.textContent.trim()} view is planned for a later stage.`);
  }
}));

document.getElementById('addField').addEventListener('click', () => showManagerPage('fields'));
document.getElementById('addFieldRegistry').addEventListener('click', () => notify('Secure Excel import will be added after the backend and access controls are ready. Do not upload real farmer data here.'));
document.getElementById('importMasterList').addEventListener('click', () => notify('Excel import is not enabled on this public prototype. Please do not use real farmer or bank data here.'));
document.querySelectorAll('[data-view-registry]').forEach(button => button.addEventListener('click', () => showManagerPage('fields')));
document.querySelectorAll('[data-action="assigned-list"]').forEach(button => button.addEventListener('click', () => notify('The field officer roster will show assigned farmers after secure sign-in is implemented.')));
document.querySelectorAll('[data-action="gps"], [data-action="photo"]').forEach(button => button.addEventListener('click', () => notify('This capture feature is not connected yet.')));
