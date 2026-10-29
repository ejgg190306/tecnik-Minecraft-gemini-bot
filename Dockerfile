FROM node:20-alpine

# Instalar dependencias del sistema requeridas por Mineflayer si hicieran falta
RUN apk add --no-cache python3 make g++ git

WORKDIR /app

# Copiar manifiestos
COPY package*.json ./

# Instalar paquetes limpios de producción
RUN npm install --omit=dev

# Copiar el código del bot
COPY . .

# Variables de entorno por defecto
ENV NODE_ENV=production

# Ejecutar el bot
CMD ["node", "index.js"]
