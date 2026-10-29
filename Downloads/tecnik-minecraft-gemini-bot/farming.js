/**
 * FarmingEngine: Operación de granjas automáticas y técnicas.
 * Diseñado específicamente para granjas de hierro (Iron Golem farms), recolección de cofres y vaciado en el almacén.
 */

const { goals } = require('mineflayer-pathfinder');
const Vec3 = require('vec3').Vec3;

class FarmingEngine {
  constructor(bot, movements) {
    this.bot = bot;
    this.movements = movements;
    this.isOperating = false;
  }

  // Operar granja de hierro: ir a los cofres recolectores, extraer lingotes y flores, y verificar flujo
  async operateIronFarm(chestCoords = null) {
    this.isOperating = true;
    this.bot.chat('[Granja de Hierro] Iniciando protocolo de recolección en la granja técnica...');

    // 1. Si no hay coordenadas fijas, buscar cofres de salida cercanos
    let targetChestBlock = null;
    if (chestCoords) {
      targetChestBlock = this.bot.blockAt(new Vec3(chestCoords.x, chestCoords.y, chestCoords.z));
    } else {
      targetChestBlock = this.bot.findBlock({
        matching: [this.bot.registry.blocksByName.chest?.id, this.bot.registry.blocksByName.trapped_chest?.id].filter(Boolean),
        maxDistance: 32
      });
    }

    if (!targetChestBlock) {
      this.bot.chat('[Granja] No encuentro cofres de recolección a menos de 32 bloques. Por favor indícame coordenadas.');
      return;
    }

    try {
      // 2. Caminar hacia el cofre con pathfinder
      this.bot.chat(`[Granja] Desplazándome al cofre en X=${targetChestBlock.position.x}, Y=${targetChestBlock.position.y}, Z=${targetChestBlock.position.z}...`);
      await this.bot.pathfinder.goto(new goals.GoalGetToBlock(targetChestBlock.position.x, targetChestBlock.position.y, targetChestBlock.position.z));

      // 3. Abrir el cofre
      const chest = await this.bot.openChest(targetChestBlock);
      await new Promise(r => setTimeout(r, 600)); // Pausa humana

      // 4. Retirar hierro (iron_ingot) y amapolas (poppy)
      let ironCount = 0;
      for (const item of chest.containerItems()) {
        if (item.name === 'iron_ingot' || item.name === 'poppy') {
          if (item.name === 'iron_ingot') ironCount += item.count;
          await chest.withdraw(item.type, null, item.count);
          await new Promise(r => setTimeout(r, 200)); // Simular shift-click
        }
      }

      await chest.close();
      this.bot.chat(`[Granja de Hierro] ¡Recolección completada! He retirado ${ironCount} lingotes de hierro del sistema.`);

    } catch (err) {
      console.error('[Error Granja]:', err);
      this.bot.chat(`[Granja] Error durante la recolección: ${err.message}`);
    } finally {
      this.isOperating = false;
    }
  }

  // Modo AFK seguro en la plataforma de spawneo o cámara de aldeanos
  async enterAfkSpot(x, y, z) {
    this.bot.chat(`[AFK] Dirigiéndome al punto AFK técnico en ${x}, ${y}, ${z}...`);
    await this.bot.pathfinder.goto(new goals.GoalBlock(x, y, z));
    this.bot.chat('[AFK] Posicionado. Manteniendo chunks activos para producción continua.');
  }
}

module.exports = { FarmingEngine };
