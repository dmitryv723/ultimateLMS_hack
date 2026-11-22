import { openStore } from './store.js';

const store = openStore();
try {
  const credentials = store.configureAccounts(process.argv.includes('--reset'));
  if (!credentials.length) {
    console.log('Аккаунты уже созданы. Чтобы выпустить новые пароли, запустите npm run demo:accounts -- --reset.');
  }
  for (const { student, password } of credentials) {
    console.log(`${student.fullName} — логин: ${student.login}   пароль: ${password}`);
  }
} finally {
  store.close();
}
