// config/env.config.js
// Loader central de configuracao de ambiente.
// Le o arquivo config/.env da branch atual.
// TODOS os valores que mudam entre ambientes devem vir daqui.
// NUNCA use valores hardcoded no codigo.

const fs = require('fs');
const path = require('path');

const envFile = path.join(__dirname, '.env');

if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf-8').split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const eqIndex = line.indexOf('=');
      if (eqIndex > 0) {
        const key = line.substring(0, eqIndex).trim();
        const value = line.substring(eqIndex + 1).trim();
        if (!process.env[key]) process.env[key] = value;
      }
    }
  });
}

module.exports = {
  APP_ENV: process.env.APP_ENV || 'dev',
  PREFIX: process.env.PREFIX || '',
  DB_NAME: process.env.DB_NAME,
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: parseInt(process.env.DB_PORT) || 5432,
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD,
  BACKEND_PORT: parseInt(process.env.BACKEND_PORT) || 5001,
  FRONTEND_PORT: parseInt(process.env.FRONTEND_PORT) || 3000,
  API_URL: process.env.API_URL,
  SERVICE_BACKEND: process.env.SERVICE_BACKEND,
  SERVICE_FRONTEND: process.env.SERVICE_FRONTEND,
  isDev: process.env.APP_ENV === 'dev',
  isStage: process.env.APP_ENV === 'stage',
  isProd: process.env.APP_ENV === 'prod',
};
