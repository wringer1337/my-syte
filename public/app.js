async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Сетевая ошибка');
  }
  return data;
}

function showAlert(message, type = 'success') {
  const alert = document.getElementById('page-alert');
  if (!alert) return;
  alert.textContent = message;
  alert.className = `alert alert-${type}`;
  alert.style.display = 'block';
}

function hideAlert() {
  const alert = document.getElementById('page-alert');
  if (alert) {
    alert.style.display = 'none';
  }
}

async function logout() {
  await fetchJson('/api/logout', { method: 'POST' });
  window.location.href = '/login.html';
}

async function checkAuth(redirect = true) {
  try {
    const data = await fetchJson('/api/user');
    document.querySelectorAll('.user-name').forEach((el) => (el.textContent = data.user.name));
    document.querySelectorAll('.user-role').forEach((el) => (el.textContent = data.user.role));
    return data.user;
  } catch (err) {
    if (redirect) {
      window.location.href = '/login.html';
    }
    return null;
  }
}

async function loadHomeMedia() {
  try {
    const data = await fetchJson('/api/media-settings');
    const hero = document.getElementById('hero-section');
    const heroTitle = document.getElementById('hero-title');
    const heroCaption = document.getElementById('hero-caption');
    if (hero && data.settings.heroImage) {
      hero.style.backgroundImage = `linear-gradient(rgba(20, 23, 32, 0.72), rgba(20, 23, 32, 0.72)), url('${data.settings.heroImage}')`;
    }
    if (heroTitle && data.settings.heroTitle) {
      heroTitle.textContent = data.settings.heroTitle;
    }
    if (heroCaption && data.settings.heroCaption) {
      heroCaption.textContent = data.settings.heroCaption;
    }
  } catch (err) {
    console.warn('Не удалось загрузить медиа-настройки:', err.message);
  }
}

async function login(event) {
  event.preventDefault();
  hideAlert();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  try {
    await fetchJson('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    window.location.href = '/dashboard.html';
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

async function register(event) {
  event.preventDefault();
  hideAlert();
  const name = document.getElementById('name').value;
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  try {
    await fetchJson('/api/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
    window.location.href = '/dashboard.html';
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

async function loadDashboard() {
  const user = await checkAuth();
  if (!user) return;
  const welcome = document.getElementById('dashboard-welcome');
  if (welcome) {
    welcome.textContent = `Добро пожаловать, ${user.name}!`;
  }
  const calculations = await fetchJson('/api/calculations');
  const table = document.getElementById('calculations-table');
  if (table) {
    if (calculations.calculations.length === 0) {
      table.innerHTML = '<tr><td colspan="6">Пока нет проведённых расчетов.</td></tr>';
    } else {
      table.innerHTML = calculations.calculations
        .map(
          (item) =>
            `<tr><td>${item.type}</td><td>${item.width} мм</td><td>${item.height} мм</td><td>${item.count}</td><td>${item.price} ₽</td><td>${new Date(item.createdAt).toLocaleString()}</td></tr>`
        )
        .join('');
    }
  }

  const requestsTable = document.getElementById('dashboard-requests-table');
  if (requestsTable) {
    const requestData = await fetchJson('/api/requests');
    if (requestData.requests.length === 0) {
      requestsTable.innerHTML = '<tr><td colspan="7">Пока нет заявок.</td></tr>';
      return;
    }
    requestsTable.innerHTML = requestData.requests
      .map(
        (item) =>
          `<tr><td>${item.type}</td><td>${item.width} мм</td><td>${item.height} мм</td><td>${item.count}</td><td>${item.phone}</td><td>${item.status}</td><td>${new Date(item.createdAt).toLocaleString()}</td></tr>`
      )
      .join('');
  }
}

async function loadAdminPanel() {
  const user = await checkAuth();
  if (!user) return;
  if (user.role !== 'admin') {
    showAlert('У вас нет доступа к админ-панели', 'error');
    return;
  }

  const statsData = await fetchJson('/api/stats');
  document.getElementById('stat-users').textContent = statsData.stats.users;
  document.getElementById('stat-calculations').textContent = statsData.stats.calculations;
  document.getElementById('stat-requests').textContent = statsData.stats.requests;

  const usersData = await fetchJson('/api/users');
  const usersTable = document.getElementById('users-table');
  if (usersTable) {
    usersTable.innerHTML = usersData.users
      .map(
        (item) =>
          `<tr><td>${item.id}</td><td>${item.name}</td><td>${item.email}</td><td><select onchange="changeRole(${item.id}, this.value)"><option value="user" ${item.role === 'user' ? 'selected' : ''}>user</option><option value="manager" ${item.role === 'manager' ? 'selected' : ''}>manager</option><option value="admin" ${item.role === 'admin' ? 'selected' : ''}>admin</option></select></td></tr>`
      )
      .join('');
  }

  const requestData = await fetchJson('/api/requests');
  const requestsTable = document.getElementById('requests-table');
  if (requestsTable) {
    requestsTable.innerHTML = requestData.requests
      .map(
        (item) =>
          `<tr><td>${item.id}</td><td>${item.name}</td><td>${item.email}</td><td>${item.phone}</td><td>${item.type}</td><td>${item.width}x${item.height}</td><td>${item.count}</td><td>${item.status}</td><td>${new Date(item.createdAt).toLocaleString()}</td></tr>`
      )
      .join('');
  }

  const mediaData = await fetchJson('/api/media-settings');
  const heroImageInput = document.getElementById('hero-image');
  const heroTitleInput = document.getElementById('hero-title-input');
  const heroCaptionInput = document.getElementById('hero-caption-input');
  if (heroImageInput) heroImageInput.value = mediaData.settings.heroImage || '';
  if (heroTitleInput) heroTitleInput.value = mediaData.settings.heroTitle || '';
  if (heroCaptionInput) heroCaptionInput.value = mediaData.settings.heroCaption || '';
}

async function changeRole(userId, role) {
  try {
    await fetchJson('/api/users/role', { method: 'POST', body: JSON.stringify({ userId, role }) });
    showAlert('Роль обновлена', 'success');
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

async function submitCalculation(event) {
  event.preventDefault();
  hideAlert();
  const type = document.getElementById('type').value;
  const width = document.getElementById('width').value;
  const height = document.getElementById('height').value;
  const count = document.getElementById('count').value;
  try {
    const result = await fetchJson('/api/calculate', {
      method: 'POST',
      body: JSON.stringify({ type, width, height, count })
    });
    document.getElementById('calc-result').textContent = `Итоговая стоимость: ${result.result.price} ₽`;
    showAlert('Расчет выполнен успешно', 'success');
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

async function submitRequest(event) {
  event.preventDefault();
  hideAlert();
  const phone = document.getElementById('request-phone').value;
  const type = document.getElementById('request-type').value;
  const width = document.getElementById('request-width').value;
  const height = document.getElementById('request-height').value;
  const count = document.getElementById('request-count').value;
  const message = document.getElementById('request-message').value;
  try {
    await fetchJson('/api/requests', {
      method: 'POST',
      body: JSON.stringify({ phone, type, width, height, count, message })
    });
    showAlert('Заявка отправлена. Мы свяжемся с вами в ближайшее время.', 'success');
    document.getElementById('request-form').reset();
    loadRequestPage();
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

async function loadRequestPage() {
  const user = await checkAuth();
  if (!user) return;
  const requestData = await fetchJson('/api/requests');
  const requestsTable = document.getElementById('my-requests-table');
  if (requestsTable) {
    if (requestData.requests.length === 0) {
      requestsTable.innerHTML = '<tr><td colspan="7">Пока нет заявок.</td></tr>';
      return;
    }
    requestsTable.innerHTML = requestData.requests
      .map(
        (item) =>
          `<tr><td>${item.type}</td><td>${item.width} мм</td><td>${item.height} мм</td><td>${item.count}</td><td>${item.phone}</td><td>${item.status}</td><td>${new Date(item.createdAt).toLocaleString()}</td></tr>`
      )
      .join('');
  }
}

async function saveMediaSettings(event) {
  event.preventDefault();
  hideAlert();
  const heroImage = document.getElementById('hero-image').value;
  const heroTitle = document.getElementById('hero-title-input').value;
  const heroCaption = document.getElementById('hero-caption-input').value;
  try {
    await fetchJson('/api/media-settings', { method: 'POST', body: JSON.stringify({ key: 'heroImage', value: heroImage }) });
    await fetchJson('/api/media-settings', { method: 'POST', body: JSON.stringify({ key: 'heroTitle', value: heroTitle }) });
    await fetchJson('/api/media-settings', { method: 'POST', body: JSON.stringify({ key: 'heroCaption', value: heroCaption }) });
    showAlert('Медиа-настройки сохранены', 'success');
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

async function submitQuestion(event) {
  event.preventDefault();
  hideAlert();
  const question = document.getElementById('question').value;
  try {
    const result = await fetchJson('/api/assistant', { method: 'POST', body: JSON.stringify({ question }) });
    document.getElementById('assistant-answer').textContent = result.answer;
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const logoutButton = document.getElementById('logout-button');
  if (logoutButton) {
    logoutButton.addEventListener('click', logout);
  }
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', login);
  }
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', register);
  }
  const calcForm = document.getElementById('calculator-form');
  if (calcForm) {
    calcForm.addEventListener('submit', submitCalculation);
    checkAuth();
  }
  const requestForm = document.getElementById('request-form');
  if (requestForm) {
    requestForm.addEventListener('submit', submitRequest);
    loadRequestPage();
  }
  const assistantForm = document.getElementById('assistant-form');
  if (assistantForm) {
    assistantForm.addEventListener('submit', submitQuestion);
    checkAuth();
  }
  const mediaForm = document.getElementById('media-form');
  if (mediaForm) {
    mediaForm.addEventListener('submit', saveMediaSettings);
    loadAdminPanel();
  }
  if (document.getElementById('dashboard-panel')) {
    loadDashboard();
  }
  if (document.getElementById('admin-panel') && !document.getElementById('media-form')) {
    loadAdminPanel();
  }
  if (document.getElementById('hero-section')) {
    loadHomeMedia();
  }
});
