/**
 * Mineflayer Gemini Technical Bot - index.js
 * Servidor destino: Tecnik.exaroton.me:39098 (Paper/Spigot/Purpur Java)
 * Incluye:
 *  1. Detector de estado del servidor en tiempo real (PRENDIDO vs APAGADO / HIBERNANDO / REINICIANDO)
 *  2. Reconexión automática inteligente cuando el servidor se reinicia o vuelve a encenderse
 *  3. Auto-Login automático con las credenciales configuradas (/login y /register + sesión Mineflayer)
 */

require('dotenv').config();
const net = require('net');
const dns = require('dns');
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const collectBlock = require('mineflayer-collectblock').plugin;
const pvp = require('mineflayer-pvp').plugin;
const autoeat = require('mineflayer-auto-eat').loader;

const { GeminiBrain } = require('./brain');
const { Humanizer } = require('./human');
const { FarmingEngine } = require('./farming');
const { ResourceGatherer } = require('./gatherer');
const { DimensionNavigator } = require('./dimensions');
const { ElytraController } = require('./elytra');

const CONFIG = {
  host: process.env.MC_HOST || 'Tecnik.exaroton.me',
  port: parseInt(process.env.MC_PORT, 10) || 39098,
  username: process.env.MC_USERNAME || 'bot',
  password: process.env.MC_PASSWORD || undefined, // Para cuentas Microsoft/Mojang si aplica
  loginPassword: process.env.MC_LOGIN_PASSWORD || 'TecnikBot2026!', // Contraseña para /login y /register dentro del servidor
  version: process.env.MC_VERSION || '26.1',
  auth: process.env.MC_AUTH_MODE || 'offline', // 'offline' o 'microsoft'
  reconnectCheckInterval: parseInt(process.env.MC_RECONNECT_INTERVAL, 10) || 5000, // Cada 5s verifica si prendió
};

let bot = null;
let brain = null;
let humanizer = null;
let farming = null;
let gatherer = null;
let dimensions = null;
let elytra = null;

let reconnectTimer = null;
let isReconnecting = false;
let hasLoggedInThisSession = false;
let lastKnownPowerState = 'DESCONOCIDO'; // 'PRENDIDO' | 'APAGADO' | 'HIBERNANDO' | 'REINICIANDO'

/**
 * Codifica un entero en formato VarInt del protocolo de Minecraft
 */
function writeVarInt(value) {
  const bytes = [];
  let val = value;
  while (true) {
    if ((val & ~0x7f) === 0) {
      bytes.push(val);
      break;
    }
    bytes.push((val & 0x7f) | 0x80);
    val >>>= 7;
  }
  return Buffer.from(bytes);
}

/**
 * Verifica mediante un Handshake TCP (Server List Ping 0x00) si el servidor de Minecraft
 * está PRENDIDO (Online) o APAGADO / HIBERNANDO (Offline / Exaroton Sleeping).
 * @returns {Promise<{ online: boolean, powerState: 'PRENDIDO' | 'APAGADO' | 'HIBERNANDO', version: string | null, motd: string }>}
 */
async function checkServerPowerState(host = CONFIG.host, port = CONFIG.port) {
  let targetHost = host;
  let targetPort = port;

  // 1. Resolver registros SRV (_minecraft._tcp) por si el servidor usa proxy dinámico
  try {
    const records = await dns.promises.resolveSrv(`_minecraft._tcp.${host}`);
    if (records && records.length > 0) {
      targetHost = records[0].name;
      targetPort = records[0].port;
    }
  } catch (_) {}

  // 2. Hacer Handshake TCP de estado de Minecraft
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(4500);

    socket.on('connect', () => {
      try {
        const hostBuf = Buffer.from(targetHost, 'utf8');
        const portBuf = Buffer.alloc(2);
        portBuf.writeUInt16BE(targetPort, 0);

        // Paquete 0x00 Handshake (Next State = 1 para Status)
        const packetBody = Buffer.concat([
          writeVarInt(0x00),
          writeVarInt(765),
          writeVarInt(hostBuf.length),
          hostBuf,
          portBuf,
          writeVarInt(1),
        ]);
        const handshakePacket = Buffer.concat([writeVarInt(packetBody.length), packetBody]);
        const statusRequestPacket = Buffer.from([0x01, 0x00]);
        socket.write(Buffer.concat([handshakePacket, statusRequestPacket]));
      } catch (err) {
        finish({ online: false, powerState: 'APAGADO', version: null, motd: err.message });
      }
    });

    let accumulated = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      accumulated = Buffer.concat([accumulated, chunk]);
      const str = accumulated.toString('utf8');
      const jsonStart = str.indexOf('{"');
      if (jsonStart !== -1) {
        try {
          const jsonCandidate = str.slice(jsonStart);
          const parsed = JSON.parse(jsonCandidate);
          const versionName = parsed?.version?.name || '';
          const protocol = parsed?.version?.protocol;
          const rawMotd = typeof parsed?.description === 'string'
            ? parsed.description
            : (parsed?.description?.text || JSON.stringify(parsed?.description || ''));

          // En Exaroton/Aternos, cuando está apagado o en reposo devuelve protocol -1 o "Sleeping"/"Offline"
          const isSleepingOrOffline =
            protocol === -1 ||
            /sleeping|offline|apagado|starting|stopping|loading|hibernando/i.test(versionName) ||
            /server is offline|servidor apagado|sleeping/i.test(rawMotd);

          if (isSleepingOrOffline) {
            finish({
              online: false,
              powerState: 'HIBERNANDO',
              version: versionName || 'En reposo',
              motd: rawMotd,
            });
          } else {
            finish({
              online: true,
              powerState: 'PRENDIDO',
              version: versionName,
              motd: rawMotd,
            });
          }
        } catch (_) {
          // Esperar más fragmentos TCP si el JSON aún no está completo
        }
      }
    });

    socket.on('timeout', () => {
      finish({ online: false, powerState: 'APAGADO', version: null, motd: 'Timeout (Servidor apagado)' });
    });

    socket.on('error', (err) => {
      finish({ online: false, powerState: 'APAGADO', version: null, motd: err.message });
    });

    socket.connect(targetPort, targetHost);
  });
}

/**
 * Realiza el login automático dentro del servidor usando las credenciales configuradas
 * Compatible con AuthMe, LoginSecurity, nLogin y sistemas de /login o /register
 */
function setupAutoLogin(botInstance) {
  hasLoggedInThisSession = false;

  // A) Escuchar mensajes del sistema por si el servidor pide /login o /register
  botInstance.on('messagestr', (msg) => {
    const lower = msg.toLowerCase();

    // Si ya nos autenticamos exitosamente, registrar confirmación
    if (
      lower.includes('successfully logged') ||
      lower.includes('logueado correctamente') ||
      lower.includes('has iniciado sesión') ||
      lower.includes('autenticado')
    ) {
      hasLoggedInThisSession = true;
      console.log('[Auto-Login] ¡Autenticación confirmada por el servidor!');
      return;
    }

    if (hasLoggedInThisSession || !CONFIG.loginPassword) return;

    // Detectar si pide registrarse por primera vez
    if (lower.includes('/register') || lower.includes('registrate') || lower.includes('regístrate')) {
      console.log('[Auto-Login] Servidor solicita registro. Enviando credenciales con /register...');
      hasLoggedInThisSession = true;
      setTimeout(() => {
        botInstance.chat(`/register ${CONFIG.loginPassword} ${CONFIG.loginPassword}`);
      }, 800);
      return;
    }

    // Detectar si pide iniciar sesión con /login
    if (lower.includes('/login') || lower.includes('logueate') || lower.includes('inicia sesion') || lower.includes('contraseña')) {
      console.log('[Auto-Login] Servidor solicita login. Enviando credenciales con /login...');
      hasLoggedInThisSession = true;
      setTimeout(() => {
        botInstance.chat(`/login ${CONFIG.loginPassword}`);
      }, 800);
    }
  });

  // B) Ejecutar login preventivo al hacer spawn si está configurada la contraseña
  botInstance.once('spawn', () => {
    if (CONFIG.loginPassword && !hasLoggedInThisSession) {
      setTimeout(() => {
        if (!hasLoggedInThisSession && botInstance && botInstance.entity) {
          console.log('[Auto-Login] Ejecutando verificación de credenciales tras conectar...');
          botInstance.chat(`/login ${CONFIG.loginPassword}`);
        }
      }, 1500);
    }
  });
}

/**
 * Bucle inteligente de reconexión:
 * Detecta cuando el servidor se apaga o se reinicia, monitorea su estado (PRENDIDO / APAGADO)
 * y vuelve a conectar e iniciar sesión en cuanto detecta que está PRENDIDO.
 */
async function waitForServerAndReconnect(disconnectReason = '') {
  if (isReconnecting) return;
  isReconnecting = true;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const isRestartReason = /restart|reinici|closed|cerrado|shutting down|apagando|reset|timed out/i.test(disconnectReason);
  if (isRestartReason) {
    lastKnownPowerState = 'REINICIANDO';
    console.log(`[Monitor Servidor] 🔄 Se detectó REINICIO del servidor ("${disconnectReason}"). Esperando a que vuelva a estar PRENDIDO...`);
  }

  const checkLoop = async () => {
    const status = await checkServerPowerState(CONFIG.host, CONFIG.port);

    if (status.online && status.powerState === 'PRENDIDO') {
      if (lastKnownPowerState !== 'PRENDIDO') {
        console.log(`[Monitor Servidor] 🟢 ¡Servidor PRENDIDO detectado! (Versión: ${status.version || CONFIG.version}). Reconectando y enviando credenciales...`);
      }
      lastKnownPowerState = 'PRENDIDO';
      isReconnecting = false;
      createBot();
    } else {
      lastKnownPowerState = status.powerState; // 'APAGADO' o 'HIBERNANDO'
      console.log(`[Monitor Servidor] 🔴 Servidor ${status.powerState} (${status.motd}). Verificando de nuevo en ${CONFIG.reconnectCheckInterval / 1000}s...`);
      reconnectTimer = setTimeout(checkLoop, CONFIG.reconnectCheckInterval);
    }
  };

  // Pequeña pausa inicial antes del primer chequeo tras desconexión
  reconnectTimer = setTimeout(checkLoop, 3000);
}

/**
 * Inicializa el bot de Mineflayer, sus plugins, el Auto-Login y los detectores de reinicio
 */
async function createBot() {
  // Verificar primero si el servidor está PRENDIDO antes de abrir la sesión de Mineflayer
  const initialStatus = await checkServerPowerState(CONFIG.host, CONFIG.port);
  if (!initialStatus.online) {
    lastKnownPowerState = initialStatus.powerState;
    console.warn(`[Monitor Servidor] 🔴 El servidor ${CONFIG.host}:${CONFIG.port} está ${initialStatus.powerState}. Esperando a que esté PRENDIDO...`);
    isReconnecting = false;
    waitForServerAndReconnect('Servidor apagado al iniciar');
    return;
  }

  lastKnownPowerState = 'PRENDIDO';
  console.log(`[Monitor Servidor] 🟢 Servidor PRENDIDO (${initialStatus.version || CONFIG.version}). Conectando con usuario "${CONFIG.username}"...`);

  bot = mineflayer.createBot({
    host: CONFIG.host,
    port: CONFIG.port,
    username: CONFIG.username,
    password: CONFIG.password,
    auth: CONFIG.auth,
    version: CONFIG.version,
    noSrv: true,
    checkTimeoutInterval: 90000,
  });

  // Activar módulo de Auto-Login con credenciales configuradas
  setupAutoLogin(bot);

  // Auto-aceptar Resource Pack del servidor durante la fase de configuración
  bot._client.on('packet', (data, meta) => {
    if (meta.name === 'add_resource_pack') {
      try {
        bot._client.write('resource_pack_receive', { uuid: data.uuid, result: 3 });
        bot._client.write('resource_pack_receive', { uuid: data.uuid, result: 0 });
      } catch (e) {}
    }
  });

  // Sincronización de físicas tick_end (20 Hz) para Purpur 26.x
  let tickTimer = null;
  bot._client.on('state', (state) => {
    if (state === 'play' && !tickTimer) {
      tickTimer = setInterval(() => {
        try {
          if (bot && bot._client && bot._client.state === 'play') {
            bot._client.write('tick_end', {});
          }
        } catch (e) {}
      }, 50);
    }
  });

  // Cargar plugins esenciales de navegación y combate
  bot.loadPlugin(pathfinder);
  bot.loadPlugin(collectBlock);
  bot.loadPlugin(pvp);
  bot.loadPlugin(autoeat);

  bot.once('login', () => {
    console.log(`[Login] ✅ Sesión autenticada en ${CONFIG.host}:${CONFIG.port} como "${CONFIG.username}".`);
  });

  bot.once('spawn', () => {
    console.log('[Spawn] 🟢 ¡El bot ha entrado al mundo y está operativo!');

    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);
    defaultMove.canDig = false;
    defaultMove.allowParkour = false; // Evita congelamientos al saltar bloques de 1 de altura
    defaultMove.allowSprinting = false;
    bot.pathfinder.setMovements(defaultMove);

    // Inicializar módulos técnicos
    brain = new GeminiBrain(process.env.GEMINI_API_KEY, bot);
    humanizer = new Humanizer(bot);
    farming = new FarmingEngine(bot, defaultMove);
    gatherer = new ResourceGatherer(bot, defaultMove, mcData);
    dimensions = new DimensionNavigator(bot, defaultMove, mcData);
    elytra = new ElytraController(bot, mcData);

    humanizer.startNaturalIdling();

    bot.autoEat.options = {
      priority: 'foodPoints',
      startAt: 14,
      bannedFood: ['rotten_flesh', 'poisonous_potato', 'pufferfish', 'spider_eye']
    };
  });

  // Escuchar mensajes de chat para interactuar mediante Gemini
  bot.on('chat', async (username, message) => {
    if (username === bot.username) return;

    const isDirected =
      message.toLowerCase().includes('bot') ||
      message.toLowerCase().includes(CONFIG.username.toLowerCase()) ||
      message.startsWith('!');

    if (!isDirected) return;

    console.log(`[Chat Recibido de ${username}]: ${message}`);
    if (humanizer) humanizer.lookAtPlayer(username);

    if (brain) {
      const response = await brain.processPlayerCommand(username, message, {
        humanizer,
        farming,
        gatherer,
        dimensions,
        elytra
      });

      if (response && response.reply) {
        setTimeout(() => {
          bot.chat(response.reply);
        }, 900);
      }
    }
  });

  // Detectar expulsión o reinicio del servidor
  bot.on('kicked', (reason) => {
    const reasonStr = typeof reason === 'string' ? reason : JSON.stringify(reason);
    console.warn(`[Expulsado / Reinicio Detectado]: ${reasonStr}`);
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    waitForServerAndReconnect(reasonStr);
  });

  // Detectar cierre de conexión (cuando el servidor se apaga o reinicia)
  bot.on('end', (reason) => {
    const reasonStr = String(reason || 'Conexión cerrada');
    console.warn(`[Desconectado] Conexión cerrada (${reasonStr}). Activando monitor de servidor PRENDIDO/APAGADO...`);
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    waitForServerAndReconnect(reasonStr);
  });

  bot.on('error', (err) => {
    console.error('[Error de Red/Mineflayer]:', err.message);
  });
}

// Iniciar bot con monitor de encendido/apagado
createBot();
