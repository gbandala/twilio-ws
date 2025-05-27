import { Sequelize, SequelizeOptions } from "sequelize-typescript";
import * as dotenv from "dotenv";
import { WebSocketConfig } from "../models/wsModel";
import  { logger } from '../utils/logger';

dotenv.config();

// Enum para entornos si no existe en el proyecto
export enum Environment {
  DEVELOPMENT = "development",
  PRODUCTION = "production",
  TEST = "test"
}

class Database {
  public sequelize: Sequelize | undefined;

  constructor() {
    this.connectToPostgreSQL();
  }

  private async connectToPostgreSQL() {
    try {
      // Validar variables de entorno críticas
      if (!process.env.DB_NAME) {
        throw new Error("La variable de entorno DB_NAME es requerida");
      }
      if (!process.env.DB_HOST) {
        throw new Error("La variable de entorno DB_HOST es requerida");
      }
      if (!process.env.DB_USER) {
        throw new Error("La variable de entorno DB_USER es requerida");
      }
      if (!process.env.DB_PASSWORD) {
        throw new Error("La variable de entorno DB_PASSWORD es requerida");
      }

      const connection: SequelizeOptions = {
        database: process.env.DB_NAME,
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
        dialect: "postgres",
        logging: false,
        models: [WebSocketConfig], // Agregamos nuestro modelo aquí
      };

      if (process.env.ENV === Environment.PRODUCTION) {
        connection.dialectOptions = {
          ssl: {
            require: true,
            rejectUnauthorized: false,
          },
        };
      }

      this.sequelize = new Sequelize(connection);

      await this.sequelize.authenticate();
      logger.detailed('info',
        "✅ PostgreSQL Connection has been established successfully for database: " + process.env.DB_NAME
      );
      
      // Sincronizar modelos con la base de datos (solo en desarrollo)
      if (process.env.ENV !== Environment.PRODUCTION && process.env.DB_SYNC === 'true') {
        await this.sequelize.sync({ alter: true });
        logger.detailed('info',
          "Base de datos sincronizada exitosamente"
        );
      }
    } catch (err) {
      logger.critical('error',
        "❌ Unable to connect to the PostgreSQL database: " + process.env.DB_NAME,
        err
      );
      throw err;
    }
  }
}

export default Database;