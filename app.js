const tabs = [...document.querySelectorAll('[data-mode]')];
const manager = document.getElementById('managerView');
const field = document.getElementById('fieldView');
const toast = document.getElementById('toast');
let toastTimer;
function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}
tabs.forEach(button => button.addEventListener('click', () => {
  tabs.forEach(tab => tab.classList.toggle('active', tab === button));
  const showField = button.dataset.mode === 'field';
  manager.classList.toggle('hidden', showField);
  field.classList.toggle('hidden', !showField);
}));
document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('selected', item === button));
  if (button.dataset.view !== 'overview') notify(`${button.textContent.trim()} view is planned for a later stage.`);
}));
document.getElementById('addField').addEventListener('click', () => notify('Field registration form is planned for the next stage.'));
document.querySelectorAll('.visit-action').forEach(button => button.addEventListener('click', () => notify('Inspection capture is planned for the next stage.')));
