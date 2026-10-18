const modeButtons = [...document.querySelectorAll('[data-mode]')];
const manager = document.getElementById('managerView');
const field = document.getElementById('fieldView');
const dashboardPage = document.getElementById('dashboardPage');
const registryPage = document.getElementById('registryPage');
const fieldDialog = document.getElementById('fieldDialog');
const fieldForm = document.getElementById('fieldForm');
const toast = document.getElementById('toast');
const storageKey = 'sageharvest-demo-fields-v1';
let toastTimer;

function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function getFields() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function openRegistry() {
  dashboardPage.classList.add('hidden');
  registryPage.classList.remove('hidden');
  renderRegistry();
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

function addText(parent, tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

function renderRegistry() {
  const list = document.getElementById('registryList');
  const fields = getFields();
  document.getElementById('registryCount').textContent = `${fields.length} ${fields.length === 1 ? 'field' : 'fields'}`;
  list.replaceChildren();
  if (!fields.length) {
    const empty = document.createElement('div');
    empty.className = 'registry-empty';
    addText(empty, 'strong', '', 'No demo fields yet');
    addText(empty, 'p', 'muted', 'Register a field to see its details here. It will be saved only in this browser.');
    list.append(empty);
    return;
  }
  fields.forEach(record => {
    const card = document.createElement('article');
    card.className = 'registry-record';
    const title = document.createElement('div');
    title.className = 'registry-record-title';
    addText(title, 'strong', '', record.fieldName);
    addText(title, 'span', 'record-id', record.id);
    card.append(title);
    addText(card, 'p', '', `${record.grower} · ${record.village}, ${record.district}`);
    const details = document.createElement('div');
    details.className = 'record-details';
    addText(details, 'span', '', `${record.crop}${record.variety ? ` · ${record.variety}` : ''}`);
    addText(details, 'span', '', `${record.area} acres`);
    if (record.sowingDate) addText(details, 'span', '', `Sown ${record.sowingDate}`);
    card.append(details);
    list.append(card);
  });
}

function openFieldDialog() {
  if (typeof fieldDialog.showModal === 'function') fieldDialog.showModal();
  else notify('This browser does not support the registration dialog.');
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

document.getElementById('addField').addEventListener('click', openFieldDialog);
document.getElementById('addFieldRegistry').addEventListener('click', openFieldDialog);
document.querySelectorAll('[data-view-registry]').forEach(button => button.addEventListener('click', () => showManagerPage('fields')));
document.querySelectorAll('[data-action="register-field"]').forEach(button => button.addEventListener('click', openFieldDialog));
document.querySelectorAll('[data-action="gps"], [data-action="photo"]').forEach(button => button.addEventListener('click', () => notify('This capture feature is not connected yet.')));
document.getElementById('closeFieldDialog').addEventListener('click', () => fieldDialog.close());
document.getElementById('cancelFieldDialog').addEventListener('click', () => fieldDialog.close());
fieldDialog.addEventListener('click', event => {
  if (event.target === fieldDialog) fieldDialog.close();
});

fieldForm.addEventListener('submit', event => {
  event.preventDefault();
  if (!fieldForm.reportValidity()) return;
  const data = new FormData(fieldForm);
  const record = {
    id: `DEMO-${Date.now().toString().slice(-6)}`,
    grower: String(data.get('grower')).trim(),
    fieldName: String(data.get('fieldName')).trim(),
    village: String(data.get('village')).trim(),
    district: String(data.get('district')).trim(),
    crop: String(data.get('crop')).trim(),
    variety: String(data.get('variety')).trim(),
    area: Number(data.get('area')).toString(),
    sowingDate: String(data.get('sowingDate')).trim()
  };
  try {
    const fields = getFields();
    localStorage.setItem(storageKey, JSON.stringify([record, ...fields]));
  } catch {
    notify('Could not save this demo record in browser storage.');
    return;
  }
  fieldDialog.close();
  fieldForm.reset();
  showManagerPage('fields');
  notify('Demo field saved in this browser.');
});

renderRegistry();
