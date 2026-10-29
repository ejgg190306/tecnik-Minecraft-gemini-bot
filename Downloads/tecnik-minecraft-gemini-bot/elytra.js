/**
 * ElytraController: Despegue, vuelo con cohetes y aterrizaje seguro con Elytras.
 */

class ElytraController {
  constructor(bot, mcData) {
    this.bot = bot;
    this.mcData = mcData;
    this.isFlying = false;
  }

  // Comprueba y equipa las Elytras en el torso
  async equipElytra() {
    const currentChest = this.bot.inventory.slots[6];
    if (currentChest && currentChest.name === 'elytra') {
      return true;
    }

    const elytraItem = this.bot.inventory.items().find(i => i.name === 'elytra');
    if (!elytraItem) {
      this.bot.chat('[Elytras] No tengo Elytras en el inventario.');
      return false;
    }

    await this.bot.equip(elytraItem, 'torso');
    this.bot.chat('[Elytras] Elytras equipadas.');
    return true;
  }

  // Comprobar cohetes con duración de vuelo (flight duration)
  hasRockets() {
    return this.bot.inventory.items().find(i => i.name === 'firework_rocket');
  }

  // Secuencia de despegue técnico: salto + apertura de alas + uso de cohete
  async prepareAndTakeoff() {
    const equipped = await this.equipElytra();
    if (!equipped) return false;

    const rocket = this.hasRockets();
    if (!rocket) {
      this.bot.chat('[Elytras] No tengo cohetes de fuegos artificiales para impulsarme.');
      return false;
    }

    this.bot.chat('[Elytras] Iniciando maniobra de despegue...');
    
    // Equipar cohete en mano secundaria o principal
    await this.bot.equip(rocket, 'hand');

    // 1. Mirar hacia arriba en un ángulo de ascenso óptimo (~35 a 45 grados)
    await this.bot.look(this.bot.entity.yaw, 0.65, true);

    // 2. Saltar
    this.bot.setControlState('jump', true);
    await new Promise(r => setTimeout(r, 200));
    this.bot.setControlState('jump', false);

    // 3. Volver a pulsar salto en el aire para desplegar las elytras (packet start_flying)
    await new Promise(r => setTimeout(r, 150));
    this.bot.setControlState('jump', true);
    await new Promise(r => setTimeout(r, 100));
    this.bot.setControlState('jump', false);

    // 4. Activar cohete
    await new Promise(r => setTimeout(r, 100));
    this.bot.activateItem(); // Consume cohete
    this.isFlying = true;
    this.bot.chat('[Elytras] ¡En vuelo! Manteniendo altitud.');

    return true;
  }

  // Volar hacia un destino
  async flyTo(destination) {
    const started = await this.prepareAndTakeoff();
    if (!started) return;

    this.bot.chat(`[Elytras] Rumbo a X=${destination.x}, Z=${destination.z}...`);
    
    // Monitoreo de planeo y aterrizaje
    const interval = setInterval(async () => {
      const pos = this.bot.entity.position;
      const dist = Math.sqrt(Math.pow(pos.x - destination.x, 2) + Math.pow(pos.z - destination.z, 2));

      // Si nos acercamos a menos de 20 bloques, descender suavemente
      if (dist < 20 || pos.y < 70) {
        clearInterval(interval);
        this.safeLanding();
      } else {
        // Mirar hacia las coordenadas destino
        const angle = Math.atan2(-(destination.x - pos.x), -(destination.z - pos.z));
        this.bot.look(angle, -0.1, true); // Ligero picado para ganar velocidad de planeo
      }
    }, 1000);
  }

  // Maniobra de aterrizaje suave para no recibir daño de impacto cinético
  async safeLanding() {
    this.bot.chat('[Elytras] Aproximación final. Nivelando morro para aterrizaje suave.');
    // Elevar el ángulo (pitch) a 0.2 para frenar el impulso horizontal
    await this.bot.look(this.bot.entity.yaw, 0.2, true);
    this.isFlying = false;
  }
}

module.exports = { ElytraController };
