#!/usr/bin/env bash
set -e

echo "============================================="
echo "   Instalador de TecnikBot (Mineflayer + Gemini)"
echo "   Servidor: Tecnik.exaroton.me:39098"
echo "============================================="

# 1. Comprobar Node.js
if ! command -v node &> /dev/null; then
    echo "[!] Node.js no está instalado. Por favor instala Node.js 18 o 20 LTS."
    exit 1
fi

echo "[+] Versión de Node detectada: $(node -v)"

# 2. Instalar dependencias
echo "[+] Instalando librerías de Minecraft y Gemini..."
npm install

# 3. Preparar .env si no existe
if [ ! -f .env ]; then
    echo "[+] Creando archivo .env desde .env.example..."
    cp .env.example .env
    echo "[!] ATENCIÓN: Edita el archivo .env y pon tu GEMINI_API_KEY antes de iniciar."
fi

# 4. Crear carpeta de logs
mkdir -p logs

echo ""
echo "============================================="
echo "¡Instalación completada con éxito!"
echo "Para arrancar el bot en primer plano:"
echo "   npm start"
echo ""
echo "Para mantenerlo 24/7 activo con PM2:"
echo "   npm install -g pm2"
echo "   npm run pm2"
echo "============================================="
