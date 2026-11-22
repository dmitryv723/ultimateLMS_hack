import { openStore } from './store.js';

const login = process.argv[2]?.trim().toLowerCase();
if (!login) {
  console.error('Укажите логин: npm run accounts:reset-code -- <логин>');
  process.exitCode = 1;
} else {
  const store = openStore();
  try {
    const code = store.issueResetCode(login);
    if (code) console.log('Одноразовый код восстановления (30 минут): ' + code);
    else {
      console.error('Учётная запись не найдена.');
      process.exitCode = 1;
    }
  } finally {
    store.close();
  }
}
