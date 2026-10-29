/**
 * Gemini AI Brain para Minecraft
 * Usa el SDK oficial @google/genai para transformar órdenes de chat en planes técnicos de Mineflayer.
 */

const { GoogleGenAI, Type } = require('@google/genai');

class GeminiBrain {
  constructor(apiKey, bot) {
    this.bot = bot;
    this.ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }

  getBotContext() {
    const pos = this.bot.entity?.position;
    const health = this.bot.health;
    const food = this.bot.food;
    const dimension = this.bot.game?.dimension || 'overworld';
    
    // Resumen del inventario
    const items = this.bot.inventory.items().map(i => `${i.name}x${i.count}`).slice(0, 15).join(', ');

    return {
      coords: pos ? { x: Math.round(pos.x), y: Math.round(pos.y), z: Math.round(pos.z) } : null,
      health,
      food,
      dimension,
      inventory: items || 'Vacío',
      heldItem: this.bot.heldItem ? this.bot.heldItem.name : 'Mano vacía'
    };
  }

  async processPlayerCommand(username, message, modules) {
    const context = this.getBotContext();

    const systemInstruction = `Eres "BOT", un bot inteligente de Minecraft Java jugando en un servidor técnico Paper/Spigot. Respondes cuando te llamen "bot" o "BOT".
Tienes control total sobre el bot a través de Mineflayer.
Tu personalidad es la de un jugador de Minecraft técnico experto (SciCraft / Hermitcraft), educado, eficiente y servicial.

Estado del bot:
- Posición: X=${context.coords?.x}, Y=${context.coords?.y}, Z=${context.coords?.z}
- Dimensión: ${context.dimension}
- Salud: ${context.health}/20, Comida: ${context.food}/20
- Ítem en mano: ${context.heldItem}
- Inventario: ${context.inventory}

Determina la intención del usuario y clasifica la acción en una de las siguientes:
1. GATHER: Recolectar recursos (madera, hierro, carbón, diamante, trigo, etc.).
2. FARM_IRON: Ir a la granja de hierro a vaciar cofres o AFK spot.
3. ELYTRA: Equipar elytras y volar usando cohetes de fuegos artificiales.
4. DIMENSION: Navegar de forma segura hacia el Nether o End, o buscar portal.
5. DEFEND: Combatir monstruos cercanos o proteger al jugador.
6. FOLLOW: Seguir al jugador manteniendo distancia humana.
7. CHAT: Pregunta general, saludo, cálculo o estado.

Devuelve SIEMPRE un JSON estructurado.`;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `El jugador "${username}" dice: "${message}"`,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: {
                type: Type.STRING,
                description: 'Respuesta breve y natural para el chat de Minecraft en español.'
              },
              action: {
                type: Type.STRING,
                description: 'GATHER, FARM_IRON, ELYTRA, DIMENSION, DEFEND, FOLLOW, CHAT'
              },
              targetResource: {
                type: Type.STRING,
                description: 'Nombre del recurso si aplica (ej: oak_log, iron_ore, diamond)'
              },
              quantity: {
                type: Type.INTEGER,
                description: 'Cantidad solicitada'
              },
              destinationCoords: {
                type: Type.OBJECT,
                properties: {
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  z: { type: Type.NUMBER }
                }
              }
            },
            required: ['reply', 'action']
          }
        }
      });

      const decision = JSON.parse(response.text || '{}');
      console.log('[Gemini Decision]:', decision);

      // Ejecutar la acción técnica en el bot
      this.executeAction(decision, username, modules);

      return decision;
    } catch (err) {
      console.error('[Error Gemini]:', err);
      return {
        reply: 'Disculpa, hubo un micro-lag en mi conexión neuronal con Gemini.',
        action: 'CHAT'
      };
    }
  }

  async executeAction(decision, username, modules) {
    const { farming, gatherer, dimensions, elytra, humanizer } = modules;

    switch (decision.action) {
      case 'GATHER':
        if (decision.targetResource) {
          gatherer.gather(decision.targetResource, decision.quantity || 16);
        } else {
          gatherer.gather('oak_log', 16);
        }
        break;

      case 'FARM_IRON':
        farming.operateIronFarm();
        break;

      case 'ELYTRA':
        if (decision.destinationCoords) {
          elytra.flyTo(decision.destinationCoords);
        } else {
          elytra.prepareAndTakeoff();
        }
        break;

      case 'DIMENSION':
        dimensions.prepareDimensionTravel('the_nether');
        break;

      case 'FOLLOW':
        humanizer.followPlayer(username);
        break;

      case 'DEFEND':
        humanizer.defendArea();
        break;

      default:
        // Solo responder en chat
        break;
    }
  }
}

module.exports = { GeminiBrain };
