/**
 * Humanizer: Simulación de movimientos naturales de un jugador humano técnico.
 * Evita movimientos robóticos instantáneos (snap-aim) y simula fatiga, saltos con sprint y pausas de inspección.
 */

const { goals } = require('mineflayer-pathfinder');

class Humanizer {
  constructor(bot) {
    this.bot = bot;
    this.isIdling = false;
  }

  // Realiza pausas humanas naturales antes de ejecutar tareas pesadas (150ms a 400ms)
  async randomPause(min = 150, max = 400) {
    const ms = Math.floor(Math.random() * (max - min)) + min;
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Girar la mirada suavemente hacia unas coordenadas en vez de teletransportar la cámara
  async smoothLookAt(targetPos, durationMs = 300) {
    const startYaw = this.bot.entity.yaw;
    const startPitch = this.bot.entity.pitch;

    // Calcular yaw y pitch hacia el objetivo
    const delta = targetPos.minus(this.bot.entity.position.offset(0, this.bot.entity.height, 0));
    const targetYaw = Math.atan2(-delta.x, -delta.z);
    const groundDistance = Math.sqrt(delta.x * delta.x + delta.z * delta.z);
    const targetPitch = Math.atan2(delta.y, groundDistance);

    const steps = 8;
    const stepTime = durationMs / steps;

    for (let i = 1; i <= steps; i++) {
      const progress = i / steps;
      // Función cuadrática suave (ease-in-out)
      const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
      const curYaw = startYaw + (targetYaw - startYaw) * ease;
      const curPitch = startPitch + (targetPitch - startPitch) * ease;
      
      this.bot.look(curYaw, curPitch, true);
      await new Promise(r => setTimeout(r, stepTime));
    }
  }

  // Mirar a un jugador de forma natural
  async lookAtPlayer(username) {
    const player = this.bot.players[username]?.entity;
    if (player) {
      await this.randomPause(100, 250);
      await this.smoothLookAt(player.position.offset(0, player.height * 0.85, 0));
    }
  }

  // Rutina de reposo cuando el bot está inactivo (mira alrededor como si estuviera comprobando la base o el F3)
  startNaturalIdling() {
    this.isIdling = true;
    const idleLoop = async () => {
      while (this.isIdling) {
        // Solo hacer movimientos si no está en medio de un pathfinding
        if (!this.bot.pathfinder.isMoving()) {
          const rand = Math.random();
          if (rand < 0.3) {
            // Mirar un poco a la izquierda o derecha
            const deltaYaw = (Math.random() - 0.5) * 0.8;
            const deltaPitch = (Math.random() - 0.5) * 0.4;
            this.bot.look(this.bot.entity.yaw + deltaYaw, Math.max(-0.8, Math.min(0.8, this.bot.entity.pitch + deltaPitch)));
          } else if (rand < 0.45) {
            // Agacharse brevemente (típico saludo o comprobación de borde)
            this.bot.setControlState('sneak', true);
            await this.randomPause(200, 500);
            this.bot.setControlState('sneak', false);
          }
        }
        await this.randomPause(3500, 7500);
      }
    };
    idleLoop();
  }

  // Seguir a un jugador manteniendo una distancia técnica respetable (3 bloques)
  followPlayer(username) {
    const target = this.bot.players[username]?.entity;
    if (!target) {
      this.bot.chat(`No puedo ver a ${username} cerca.`);
      return;
    }

    this.bot.chat(`Siguiendo a ${username} de forma segura.`);
    this.bot.pathfinder.setGoal(new goals.GoalFollow(target, 3), true);
  }

  // Defender la zona si aparecen creepers o monstruos
  defendArea() {
    const entity = this.bot.nearestEntity(e => (e.type === 'mob' || e.type === 'hostile') && e.position.distanceTo(this.bot.entity.position) < 16);
    if (entity) {
      this.bot.chat(`¡Detectada amenaza: ${entity.name}! Equipando arma y defendiendo.`);
      const sword = this.bot.inventory.items().find(i => i.name.includes('sword') || i.name.includes('axe'));
      if (sword) this.bot.equip(sword, 'hand');
      this.bot.pvp.attack(entity);
    } else {
      this.bot.chat('No detecto mobs hostiles cercanos en este radio.');
    }
  }
}

module.exports = { Humanizer };
