/**
 * ResourceGatherer: Recolección optimizada de recursos.
 * Incluye tala sistemática de árboles (madera), minería de túnel (hierro/carbón/diamante) y prevención de lava.
 */

const { goals } = require('mineflayer-pathfinder');

class ResourceGatherer {
  constructor(bot, movements, mcData) {
    this.bot = bot;
    this.movements = movements;
    this.mcData = mcData;
  }

  // Talar madera de forma inteligente
  async gatherWood(count = 16) {
    this.bot.chat(`[Recolección] Iniciando tala de madera (${count} bloques requeridos)...`);

    const logBlockIds = [
      this.mcData.blocksByName.oak_log?.id,
      this.mcData.blocksByName.birch_log?.id,
      this.mcData.blocksByName.spruce_log?.id,
      this.mcData.blocksByName.dark_oak_log?.id
    ].filter(Boolean);

    let gathered = 0;

    while (gathered < count) {
      const logBlock = this.bot.findBlock({
        matching: logBlockIds,
        maxDistance: 32
      });

      if (!logBlock) {
        this.bot.chat(`[Madera] No encuentro más árboles visibles. He talado ${gathered} troncos.`);
        break;
      }

      // Equipar hacha si la tiene
      const axe = this.bot.inventory.items().find(i => i.name.includes('_axe'));
      if (axe) await this.bot.equip(axe, 'hand');

      try {
        await this.bot.collectBlock.collect(logBlock);
        gathered++;
        // Pausa humana entre tronco y tronco
        await new Promise(r => setTimeout(r, 250));
      } catch (err) {
        console.warn('[Aviso Tala]:', err.message);
        break;
      }
    }

    this.bot.chat(`[Recolección] Tala finalizada. Total obtenido: ${gathered} troncos de madera.`);
  }

  // Minería de minerales (hierro, carbón, diamante) con comprobación de lava
  async mineOre(oreName = 'iron_ore', count = 16) {
    const oreId = this.mcData.blocksByName[oreName]?.id || this.mcData.blocksByName['deepslate_' + oreName]?.id;
    if (!oreId) {
      this.bot.chat(`No reconozco el mineral "${oreName}".`);
      return;
    }

    this.bot.chat(`[Minería] Buscando vetas de ${oreName}...`);

    // Equipar pico adecuado
    const pickaxe = this.bot.inventory.items().find(i => i.name.includes('_pickaxe'));
    if (pickaxe) await this.bot.equip(pickaxe, 'hand');

    const blocks = this.bot.findBlocks({
      matching: oreId,
      maxDistance: 32,
      count: count
    });

    if (blocks.length === 0) {
      this.bot.chat(`[Minería] No hay vetas expuestas de ${oreName} cerca. Explora más profundo.`);
      return;
    }

    let mined = 0;
    for (const bPos of blocks) {
      const block = this.bot.blockAt(bPos);
      if (!block) continue;

      // Medida de seguridad: Comprobar que no haya lava adyacente
      if (this.isLavaNearby(bPos)) {
        console.warn('[Alerta Seguridad] Detectada lava junto al mineral. Omitiendo por precaución.');
        continue;
      }

      try {
        await this.bot.collectBlock.collect(block);
        mined++;
      } catch (e) {
        console.warn('Error recolectando mineral:', e.message);
      }
    }

    this.bot.chat(`[Minería] Sesión terminada. Extraídos ${mined} bloques de ${oreName}.`);
  }

  isLavaNearby(pos) {
    const offsets = [
      pos.offset(1, 0, 0), pos.offset(-1, 0, 0),
      pos.offset(0, 1, 0), pos.offset(0, -1, 0),
      pos.offset(0, 0, 1), pos.offset(0, 0, -1)
    ];

    const lavaId = this.mcData.blocksByName.lava?.id;
    return offsets.some(p => this.bot.blockAt(p)?.type === lavaId);
  }

  async gather(resource, count = 16) {
    if (resource.includes('log') || resource.includes('wood') || resource === 'madera') {
      await this.gatherWood(count);
    } else {
      await this.mineOre(resource, count);
    }
  }
}

module.exports = { ResourceGatherer };
