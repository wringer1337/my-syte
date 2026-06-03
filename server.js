const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'app.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT UNIQUE,
    password TEXT,
    name TEXT,
    role TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS calculations (
    id INTEGER PRIMARY KEY,
    userId INTEGER,
    type TEXT,
    width REAL,
    height REAL,
    count INTEGER,
    price REAL,
    createdAt TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY,
    userId INTEGER,
    name TEXT,
    email TEXT,
    phone TEXT,
    type TEXT,
    width REAL,
    height REAL,
    count INTEGER,
    message TEXT,
    status TEXT,
    createdAt TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY,
    key TEXT UNIQUE,
    value TEXT
  )`);

  const defaultSettings = [
    { key: 'heroImage', value: 'https://images.unsplash.com/photo-1519839416795-1bcb5b329c66?auto=format&fit=crop&w=1200&q=80' },
    { key: 'heroTitle', value: 'Производство окон, дверей и стеклопакетов' },
    { key: 'heroCaption', value: 'Рассчитайте стоимость онлайн, оставьте заявку и управляйте заказами в личном кабинете.' }
  ];

  defaultSettings.forEach((item) => {
    db.run(
      'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
      [item.key, item.value]
    );
  });

  db.get('SELECT id FROM users WHERE email = ?', ['admin@visla.ru'], (err, row) => {
    if (err) {
      console.error('Ошибка проверки администратора:', err);
      return;
    }
    if (!row) {
      const defaultPass = bcrypt.hashSync('Admin123!', 10);
      db.run(
        'INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)',
        ['admin@visla.ru', defaultPass, 'Администратор', 'admin'],
        (insertErr) => {
          if (insertErr) {
            console.error('Не удалось создать администратора:', insertErr);
          } else {
            console.log('Администратор создан: admin@visla.ru / Admin123!');
          }
        }
      );
    }
  });
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(
  session({
    secret: 'visla-glass-secret-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
  })
);

app.use(express.static(path.join(__dirname, 'public')));

const rootPhotoFiles = new Set(['images.jpg', 'Visla2.png', 'derevo.jpg']);
app.get('/photos/:filename', (req, res) => {
  const { filename } = req.params;
  if (!rootPhotoFiles.has(filename)) {
    return res.status(404).send('Файл не найден');
  }
  res.sendFile(path.join(__dirname, filename));
});

function authRequired(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.status(401).json({ error: 'Не авторизован' });
  }
}

function roleRequired(requiredRole) {
  return (req, res, next) => {
    if (req.session.user && req.session.user.role === requiredRole) {
      next();
    } else {
      res.status(403).json({ error: 'Доступ запрещён' });
    }
  };
}

app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }
  const hashed = bcrypt.hashSync(password, 10);
  db.run(
    'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
    [name.trim(), email.trim().toLowerCase(), hashed, 'user'],
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.status(409).json({ error: 'Пользователь с таким email уже существует' });
        }
        return res.status(500).json({ error: 'Ошибка регистрации пользователя' });
      }
      req.session.user = { id: this.lastID, name: name.trim(), email: email.trim().toLowerCase(), role: 'user' };
      res.json({ user: req.session.user });
    }
  );
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Заполните email и пароль' });
  }
  db.get('SELECT id, name, email, password, role FROM users WHERE email = ?', [email.trim().toLowerCase()], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Ошибка при входе' });
    }
    if (!row || !bcrypt.compareSync(password, row.password)) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }
    req.session.user = { id: row.id, name: row.name, email: row.email, role: row.role };
    res.json({ user: req.session.user });
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get('/api/user', authRequired, (req, res) => {
  res.json({ user: req.session.user });
});

app.get('/api/users', authRequired, roleRequired('admin'), (req, res) => {
  db.all('SELECT id, name, email, role FROM users ORDER BY id', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Ошибка получения списка пользователей' });
    }
    res.json({ users: rows });
  });
});

app.post('/api/users/role', authRequired, roleRequired('admin'), (req, res) => {
  const { userId, role } = req.body;
  const allowed = ['user', 'manager', 'admin'];
  if (!allowed.includes(role)) {
    return res.status(400).json({ error: 'Неверная роль' });
  }
  db.run('UPDATE users SET role = ? WHERE id = ?', [role, userId], function (err) {
    if (err) {
      return res.status(500).json({ error: 'Ошибка обновления роли' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    res.json({ success: true });
  });
});

function calculatePrice({ type, width, height, count }) {
  const baseSizes = {
    window: 3200,
    door: 4200,
    glass: 1800
  };
  const coefficient = type === 'window' ? 1 : type === 'door' ? 1.4 : 0.85;
  const square = Math.max(0.1, (width * height) / 1000000);
  const price = Math.round(baseSizes[type] * square * coefficient * Math.max(1, count));
  return price;
}

app.post('/api/calculate', authRequired, (req, res) => {
  const { type, width, height, count } = req.body;
  if (!type || !width || !height || !count) {
    return res.status(400).json({ error: 'Заполните все параметры' });
  }
  const numericWidth = Number(width);
  const numericHeight = Number(height);
  const numericCount = Number(count);
  if (numericWidth <= 0 || numericHeight <= 0 || numericCount <= 0) {
    return res.status(400).json({ error: 'Неверные размеры или количество' });
  }
  const price = calculatePrice({ type, width: numericWidth, height: numericHeight, count: numericCount });
  const createdAt = new Date().toISOString();
  db.run(
    'INSERT INTO calculations (userId, type, width, height, count, price, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.session.user.id, type, numericWidth, numericHeight, numericCount, price, createdAt],
    function (err) {
      if (err) {
        return res.status(500).json({ error: 'Ошибка сохранения расчета' });
      }
      res.json({ result: { type, width: numericWidth, height: numericHeight, count: numericCount, price, createdAt } });
    }
  );
});

app.get('/api/calculations', authRequired, (req, res) => {
  const params = [];
  let query = 'SELECT id, type, width, height, count, price, createdAt FROM calculations';
  if (req.session.user.role !== 'admin') {
    query += ' WHERE userId = ?';
    params.push(req.session.user.id);
  }
  query += ' ORDER BY createdAt DESC';
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Ошибка получения расчетов' });
    }
    res.json({ calculations: rows });
  });
});

app.post('/api/requests', authRequired, (req, res) => {
  const { phone, type, width, height, count, message } = req.body;
  if (!phone || !type || !width || !height || !count) {
    return res.status(400).json({ error: 'Заполните все обязательные поля' });
  }
  const numericWidth = Number(width);
  const numericHeight = Number(height);
  const numericCount = Number(count);
  if (numericWidth <= 0 || numericHeight <= 0 || numericCount <= 0) {
    return res.status(400).json({ error: 'Неверные размеры или количество' });
  }
  const createdAt = new Date().toISOString();
  db.run(
    'INSERT INTO requests (userId, name, email, phone, type, width, height, count, message, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [req.session.user.id, req.session.user.name, req.session.user.email, phone.trim(), type, numericWidth, numericHeight, numericCount, (message || '').trim(), 'new', createdAt],
    function (err) {
      if (err) {
        return res.status(500).json({ error: 'Ошибка сохранения заявки' });
      }
      res.json({ request: { id: this.lastID, type, width: numericWidth, height: numericHeight, count: numericCount, status: 'new', createdAt } });
    }
  );
});

app.get('/api/requests', authRequired, (req, res) => {
  const params = [];
  let query = 'SELECT id, name, email, phone, type, width, height, count, message, status, createdAt FROM requests';
  if (req.session.user.role !== 'admin' && req.session.user.role !== 'manager') {
    query += ' WHERE userId = ?';
    params.push(req.session.user.id);
  }
  query += ' ORDER BY createdAt DESC';
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Ошибка получения заявок' });
    }
    res.json({ requests: rows });
  });
});

app.get('/api/stats', authRequired, roleRequired('admin'), (req, res) => {
  db.get('SELECT COUNT(*) AS total FROM users', [], (err, usersRow) => {
    if (err) {
      return res.status(500).json({ error: 'Ошибка статистики' });
    }
    db.get('SELECT COUNT(*) AS total FROM calculations', [], (err2, calculationsRow) => {
      if (err2) {
        return res.status(500).json({ error: 'Ошибка статистики' });
      }
      db.get('SELECT COUNT(*) AS total FROM requests', [], (err3, requestsRow) => {
        if (err3) {
          return res.status(500).json({ error: 'Ошибка статистики' });
        }
        res.json({ stats: { users: usersRow.total, calculations: calculationsRow.total, requests: requestsRow.total } });
      });
    });
  });
});

app.get('/api/media-settings', (req, res) => {
  db.all('SELECT key, value FROM settings', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Ошибка получения настроек медиа' });
    }
    const settings = rows.reduce((acc, item) => {
      acc[item.key] = item.value;
      return acc;
    }, {});
    res.json({ settings });
  });
});

app.post('/api/media-settings', authRequired, roleRequired('admin'), (req, res) => {
  const { key, value } = req.body;
  if (!key || typeof value !== 'string') {
    return res.status(400).json({ error: 'Неверные данные для сохранения' });
  }
  db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value], function (err) {
    if (err) {
      return res.status(500).json({ error: 'Ошибка сохранения настроек медиа' });
    }
    res.json({ success: true });
  });
});

app.post('/api/assistant', authRequired, (req, res) => {
  const prompt = (req.body.question || '').toLowerCase();
  if (!prompt) {
    return res.status(400).json({ error: 'Задайте вопрос помощнику' });
  }

  const answers = [
    {
      keywords: ['окно', 'размер', 'ширина', 'высота'],
      text: 'Для расчета окна введите ширину и высоту в миллиметрах, а затем количество. Система автоматически предложит стоимость с учетом энергосбережения.'
    },
    {
      keywords: ['дверь', 'дверей', 'дверной'],
      text: 'Двери обычно дороже окон, потому что требуют усиленного профиля и надежной фурнитуры. Укажите размеры и количество, чтобы получить точный расчёт.'
    },
    {
      keywords: ['стеклопакет', 'стекло', 'стеклопакетов'],
      text: 'Стеклопакеты рассчитываются по площади. Чем больше площадь, тем выгоднее цена за метр. Наш калькулятор учитывает стандартные параметры и количество.'
    },
    {
      keywords: ['админ', 'роль', 'права', 'управление'],
      text: 'В админ-панели можно изменять роли пользователей, просматривать список заказов и запускать внутренние расчёты. Только администратор имеет полный доступ.'
    },
    {
      keywords: ['цена', 'стоимость', 'расчёт'],
      text: 'Для точного расчёта используйте страницу "Калькулятор". Она учитывает тип изделия, размеры и количество, чтобы мгновенно показать стоимость.'
    }
  ];

  let answer = 'Я готов помочь! Спросите про расчёт, роли, вход, продукт или админ-панель.';
  for (const item of answers) {
    if (item.keywords.some((keyword) => prompt.includes(keyword))) {
      answer = item.text;
      break;
    }
  }

  res.json({ answer });
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
  console.log('Стартовые данные: администратор admin@visla.ru / Admin123!');
});
