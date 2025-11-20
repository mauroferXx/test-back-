📋 Requisitos Previos

Antes de comenzar, asegúrate de tener instalado:

- **Node.js** (versión 16 o superior) - [Descargar Node.js](https://nodejs.org/)
- **Git** - [Descargar Git](https://git-scm.com/downloads)
- **npm** (viene incluido con Node.js)

 **Instalar las dependencias**:


npm install



crear archivo .env 


DATABASE_URL=postgresql://test_mne3_user:bIFxwGqajWeFeEkT61KO6U2vYyyb7TaD@dpg-d4ecgdmmcj7s73ck7ko0-a.oregon-postgres.render.com/test_mne3
PORT=3000
NODE_ENV=development
OPEN_FOOD_FACTS_BASE_URL=https://world.openfoodfacts.org/api/v0
CARBON_INTERFACE_BASE_URL=https://www.carboninterface.com/api/v1

## Iniciar el Backend


# Modo desarrollo (con recarga automática)
npm run dev

# O modo producción
npm start


El servidor backend estará corriendo en: **http://localhost:3000**


