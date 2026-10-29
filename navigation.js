/**
 * navigation.js - Módulo de Navegación y Pathfinding Avanzado para Mineflayer
 * 
 * Utiliza 'mineflayer-pathfinder' para calcular rutas óptimas y resolver obstáculos.
 * Incluye buffer de tiempo (debounce) y chequeo de distancia previo a cada salto
 * para evitar que el bot se congele o se bugee al intentar saltar bloques a distintas alturas.
 */

const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const minecraftData = require('minecraft-data');

class BotNavigation {
  constructor(bot) {
    this.bot = bot;
    this.movements = null;
    this.isNavigating = false;
    this.lastJumpTime = 0;
    this.jumpBufferMs = 350; // Buffer de tiempo (cooldown) entre saltos para evitar bucles/congelamientos
    this.minJumpDistance = 0.25; // Distancia mínima al bloque obstáculo (en metros)
    this.maxJumpDistance = 1.25; // Distancia máxima segura para ejecutar el salto de 1 bloque
    this.stuckCheckTimer = null;
    this.lastPos = null;
    this.isEvadingStuck = false;
    this.logs = [];

    this.init();
  }

  log(message, level = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const entry = { id: Math.random().toString(36).substring(2, 9), timestamp, level, category: 'PATHFINDING', message };
    this.logs.push(entry);
    if (this.logs.length > 100) this.logs.shift();
    console.log(`[Navigation:${level.toUpperCase()}] ${message}`);
  }

  init() {
    if (!this.bot) return;

    if (!this.bot.pathfinder) {
      this.bot.loadPlugin(pathfinder);
    }

    this.bot.once('spawn', () => {
      this.setupMovements();
      this.setupEventListeners();
    });
  }

  setupMovements() {
    try {
      const version = this.bot.version || '1.20.1';
      const mcData = minecraftData(version);
      this.movements = new Movements(this.bot, mcData);

      this.movements.canDig = false;
      this.movements.allowParkour = false; // Desactivar saltos de parkour extremos de 2+ bloques
      this.movements.allowSprinting = true;
      this.movements.maxDropDown = 4;
      this.movements.allowFreeMotion = false;

      if ('canWalkOnSlabs' in this.movements) this.movements.canWalkOnSlabs = true;
      if ('canWalkOnStairs' in this.movements) this.movements.canWalkOnStairs = true;

      this.bot.pathfinder.setMovements(this.movements);
      this.log('Configuración de Movements cargada con buffer anti-congelamiento en terreno irregular.', 'info');
    } catch (err) {
      this.log(`Error al inicializar Movements: ${err.message}`, 'error');
    }
  }

  setupEventListeners() {
    if (!this.bot || !this.bot.pathfinder) return;

    this.bot.on('goal_reached', () => {
      this.isNavigating = false;
      this.stopStuckMonitor();
      this.log('¡Meta de navegación alcanzada con éxito!', 'info');
    });

    this.bot.on('path_stuck', () => {
      this.log('Detección de bloqueo (path_stuck). Aplicando maniobra de desatasco...', 'warn');
      this.handleStuckManually();
    });

    this.bot.on('physicsTick', () => {
      if (this.isNavigating && !this.isEvadingStuck) {
        this.checkJumpConditions();
      }
    });
  }

  checkJumpConditions() {
    if (!this.bot || !this.bot.entity) return;

    const now = Date.now();
    if (now - this.lastJumpTime < this.jumpBufferMs) {
      return;
    }

    if (!this.bot.entity.onGround) {
      return;
    }

    const pos = this.bot.entity.position;
    const yaw = this.bot.entity.yaw;

    const dx = -Math.sin(yaw);
    const dz = -Math.cos(yaw);

    const frontCheckPos = pos.offset(dx * 0.75, 0, dz * 0.75);
    const feetBlock = this.bot.blockAt(frontCheckPos.floored());
    const stepUpBlock = this.bot.blockAt(frontCheckPos.floored().offset(0, 1, 0));
    const headBlock = this.bot.blockAt(pos.floored().offset(0, 2, 0));
    const headFrontBlock = this.bot.blockAt(frontCheckPos.floored().offset(0, 2, 0));

    const isCollided = Boolean(this.bot.entity.isCollidedHorizontally);
    const isBlockInFront = feetBlock && feetBlock.boundingBox === 'block';

    if (isCollided || isBlockInFront) {
      const clearHead = (!headBlock || headBlock.boundingBox === 'empty') && (!headFrontBlock || headFrontBlock.boundingBox === 'empty');
      const notWall = !stepUpBlock || stepUpBlock.boundingBox === 'empty';

      if (clearHead && notWall) {
        const blockCenter = frontCheckPos.floored().offset(0.5, 0, 0.5);
        const distToBlock = Math.hypot(blockCenter.x - pos.x, blockCenter.z - pos.z);

        if (distToBlock >= this.minJumpDistance && distToBlock <= this.maxJumpDistance + 0.3) {
          this.executeJumpWithBuffer(now, distToBlock);
        }
      }
    }
  }

  executeJumpWithBuffer(timestamp, distance) {
    this.lastJumpTime = timestamp;
    this.log(`Ejecutando salto limpio (Distancia obstáculo: ${distance.toFixed(2)}m, Buffer: ${this.jumpBufferMs}ms)`, 'info');

    this.bot.setControlState('forward', true);
    this.bot.setControlState('jump', true);

    setTimeout(() => {
      if (this.bot) {
        this.bot.setControlState('jump', false);
      }
    }, 160);
  }

  async goTo(x, y, z, range = 1) {
    if (!this.bot || !this.bot.pathfinder) return;

    this.isNavigating = true;
    this.log(`Navegando a X=${Math.round(x)}, Y=${Math.round(y)}, Z=${Math.round(z)} (Rango: ${range}m)`);
    this.startStuckMonitor();

    try {
      const goal = new goals.GoalNear(x, y, z, range);
      await this.bot.pathfinder.goto(goal);
    } catch (err) {
      this.log(`Navegación interrumpida: ${err.message}`, 'warn');
      this.handleStuckManually();
    } finally {
      this.isNavigating = false;
      this.stopStuckMonitor();
    }
  }

  stop() {
    this.isNavigating = false;
    this.stopStuckMonitor();

    if (this.bot && this.bot.pathfinder) {
      this.bot.pathfinder.setGoal(null);
      this.bot.clearControlStates();
      this.log('Navegación detenida y controles limpiados.', 'info');
    }
  }

  handleStuckManually() {
    if (!this.bot || this.isEvadingStuck) return;

    this.isEvadingStuck = true;
    this.log('Maniobra de emergencia: Pausando goal, retrocediendo y micro-salto lateral...', 'warn');

    const activeGoal = this.bot.pathfinder.goal;
    try {
      this.bot.pathfinder.setGoal(null);
      this.bot.clearControlStates();
    } catch (e) {}

    this.bot.setControlState('back', true);

    setTimeout(() => {
      if (!this.bot) return;
      this.bot.setControlState('back', false);
      this.bot.setControlState('jump', true);
      this.bot.setControlState('left', true);

      setTimeout(() => {
        if (!this.bot) return;
        this.bot.clearControlStates();
        this.isEvadingStuck = false;

        if (activeGoal && this.bot.pathfinder) {
          try {
            this.bot.pathfinder.setGoal(activeGoal, true);
          } catch (e) {}
        }
      }, 250);
    }, 200);
  }

  startStuckMonitor() {
    this.stopStuckMonitor();
    this.lastPos = this.bot.entity ? this.bot.entity.position.clone() : null;

    this.stuckCheckTimer = setInterval(() => {
      if (!this.isNavigating || !this.bot || !this.bot.entity || this.isEvadingStuck) return;

      const currentPos = this.bot.entity.position;
      if (this.lastPos) {
        const distMoved = currentPos.distanceTo(this.lastPos);
        if (distMoved < 0.18 && this.bot.pathfinder.isMoving()) {
          this.log('Detección preventiva: Sin progreso espacial en terreno irregular. Forzando desatasco...', 'warn');
          this.handleStuckManually();
        }
      }
      this.lastPos = currentPos.clone();
    }, 2500);
  }

  stopStuckMonitor() {
    if (this.stuckCheckTimer) {
      clearInterval(this.stuckCheckTimer);
      this.stuckCheckTimer = null;
    }
  }
}

module.exports = { BotNavigation };
