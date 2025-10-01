#!/usr/bin/env node

/**
 * Script de configuración inicial para Lucy3000
 * Ejecutar: node scripts/setup.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function setup() {
  console.log('\n🌟 Bienvenido a Lucy3000 Setup\n');
  console.log('Este script te ayudará a configurar tu aplicación.\n');

  try {
    // Verificar si .env ya existe
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      const overwrite = await question('⚠️  El archivo .env ya existe. ¿Deseas sobrescribirlo? (s/n): ');
      if (overwrite.toLowerCase() !== 's') {
        console.log('\n✅ Configuración cancelada. Tu archivo .env actual se mantiene.\n');
        rl.close();
        return;
      }
    }

    console.log('\n📝 Por favor, proporciona la siguiente información:\n');

    // Supabase Configuration
    console.log('🗄️  CONFIGURACIÓN DE SUPABASE');
    console.log('   (Obtén estos datos en: https://app.supabase.com/project/_/settings/database)\n');
    
    const databaseUrl = await question('   DATABASE_URL: ');
    const supabaseUrl = await question('   SUPABASE_URL: ');
    const supabaseAnonKey = await question('   SUPABASE_ANON_KEY: ');
    const supabaseServiceKey = await question('   SUPABASE_SERVICE_KEY: ');

    // Backend Configuration
    console.log('\n⚙️  CONFIGURACIÓN DEL BACKEND\n');
    const port = await question('   Puerto del servidor (default: 3001): ') || '3001';
    const nodeEnv = await question('   Entorno (development/production, default: development): ') || 'development';

    // JWT Secret
    console.log('\n🔐 SEGURIDAD\n');
    const jwtSecret = await question('   JWT_SECRET (deja vacío para generar uno aleatorio): ');
    const finalJwtSecret = jwtSecret || generateRandomSecret();

    // App Configuration
    console.log('\n📱 CONFIGURACIÓN DE LA APLICACIÓN\n');
    const appName = await question('   Nombre de la aplicación (default: Lucy3000 Accounting): ') || 'Lucy3000 Accounting';
    const appVersion = await question('   Versión (default: 1.0.0): ') || '1.0.0';

    // Crear archivo .env
    const envContent = `# Supabase Configuration
DATABASE_URL="${databaseUrl}"
SUPABASE_URL="${supabaseUrl}"
SUPABASE_ANON_KEY="${supabaseAnonKey}"
SUPABASE_SERVICE_KEY="${supabaseServiceKey}"

# Backend Configuration
PORT=${port}
NODE_ENV=${nodeEnv}

# JWT Secret
JWT_SECRET="${finalJwtSecret}"

# App Configuration
APP_NAME="${appName}"
APP_VERSION="${appVersion}"

# Backup Configuration
BACKUP_PATH="./backups"
BACKUP_INTERVAL_HOURS=24
`;

    fs.writeFileSync(envPath, envContent);
    console.log('\n✅ Archivo .env creado exitosamente!\n');

    // Preguntar si desea ejecutar migraciones
    const runMigrations = await question('¿Deseas ejecutar las migraciones de Prisma ahora? (s/n): ');
    
    if (runMigrations.toLowerCase() === 's') {
      console.log('\n🔄 Ejecutando migraciones de Prisma...\n');
      const { execSync } = require('child_process');
      
      try {
        execSync('npx prisma generate', { stdio: 'inherit' });
        execSync('npx prisma migrate dev', { stdio: 'inherit' });
        console.log('\n✅ Migraciones completadas!\n');
      } catch (error) {
        console.error('\n❌ Error al ejecutar migraciones:', error.message);
        console.log('   Puedes ejecutarlas manualmente con: npm run prisma:migrate\n');
      }
    }

    // Instrucciones finales
    console.log('\n🎉 ¡Configuración completada!\n');
    console.log('📋 Próximos pasos:\n');
    console.log('   1. Instalar dependencias: npm install');
    console.log('   2. Generar cliente Prisma: npm run prisma:generate');
    console.log('   3. Ejecutar migraciones: npm run prisma:migrate');
    console.log('   4. Crear usuario admin en Supabase (ver README.md)');
    console.log('   5. Iniciar la aplicación: npm run dev\n');
    console.log('📖 Para más información, consulta README.md\n');

  } catch (error) {
    console.error('\n❌ Error durante la configuración:', error.message);
  } finally {
    rl.close();
  }
}

function generateRandomSecret() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let secret = '';
  for (let i = 0; i < 64; i++) {
    secret += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return secret;
}

// Ejecutar setup
setup();

