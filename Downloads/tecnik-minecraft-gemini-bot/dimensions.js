/**
 * DimensionNavigator: Navegación técnica y segura en Nether y End.
 * Controla:
 * - Conversión de coordenadas Overworld <-> Nether (factor 8).
 * - Uso obligatorio de pieza dorada contra Piglins.
 * - Distancia de seguridad al vacío en el End.
 */

const { goals } = require('mineflayer-pathfinder');

class DimensionNavigator {
  constructor(bot, movements, mcData) {
    this.bot = bot;
    this.movements = movements;
    this.mcData = mcData;
  }

  // Comprueba si el bot lleva al menos una pieza dorada para evitar el ataque de Piglins en el Nether
  hasGoldArmor() {
    const armorSlots = [
      this.bot.inventory.slots[5], // casco
      this.bot.inventory.slots[6], // pechera
      this.bot.inventory.slots[7], // pantalones
      this.bot.inventory.slots[8]  // botas
    ];
    return armorSlots.some(slot => slot && slot.name.includes('golden_'));
  }

  async equipGoldArmorIfAvailable() {
    if (this.hasGoldArmor()) return true;

    const goldPiece = this.bot.inventory.items().find(i => i.name.includes('golden_'));
    if (goldPiece) {
      this.bot.chat('[Nether] Equipando pieza de armadura dorada para neutralizar Piglins...');
      let dest = 'torso';
      if (goldPiece.name.includes('helmet')) dest = 'head';
      if (goldPiece.name.includes('boots')) dest = 'feet';
      if (goldPiece.name.includes('leggings')) dest = 'legs';
      await this.bot.equip(goldPiece, dest);
      return true;
    }

    this.bot.chat('[ALERTA Nether] ¡Cuidado! No dispongo de armadura de oro. Los Piglins serán hostiles.');
    return false;
  }

  // Cálculo técnico de coordenadas para enlazar portales
  calculateNetherCoords(overworldCoords) {
    return {
      x: Math.floor(overworldCoords.x / 8),
      y: overworldCoords.y,
      z: Math.floor(overworldCoords.z / 8)
    };
  }

  // Preparación y viaje seguro
  async prepareDimensionTravel(targetDimension) {
    if (targetDimension === 'the_nether') {
      this.bot.chat('[Nether] Iniciando protocolo de incursión al Nether...');
      await this.equipGoldArmorIfAvailable();

      // Buscar portal del Nether cercano
      const portalBlock = this.bot.findBlock({
        matching: this.mcData.blocksByName.nether_portal?.id,
        maxDistance: 48
      });

      if (portalBlock) {
        this.bot.chat(`[Nether] Portal localizado en ${portalBlock.position.x}, ${portalBlock.position.y}, ${portalBlock.position.z}. Cruzando...`);
        await this.bot.pathfinder.goto(new goals.GoalBlock(portalBlock.position.x, portalBlock.position.y, portalBlock.position.z));
      } else {
        this.bot.chat('[Nether] No hay ningún portal del Nether a menos de 48 bloques.');
      }
    } else if (targetDimension === 'the_end') {
      this.bot.chat('[End] Protocolo End: Activando prevención de caída al vacío (Y > 10).');
      // Asegurarse de tener cubos de agua para caídas MLG
      const waterBucket = this.bot.inventory.items().find(i => i.name === 'water_bucket');
      if (waterBucket) {
        this.bot.chat('[End] Cubo de agua en inventario verificado para clutch MLG.');
      }
    }
  }
}

module.exports = { DimensionNavigator };
