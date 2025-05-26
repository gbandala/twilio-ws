import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import axios from 'axios';

/**
 * Interfaz para errores personalizados de la aplicación
 */
export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

/**
 * Middleware para capturar errores y enviar una respuesta estandarizada
 */
export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Error interno del servidor';
  const code = err.code || 'INTERNAL_SERVER_ERROR';

  // Manejar errores de Axios específicamente para la API de Retell
  if (axios.isAxiosError(err)) {
    const axiosError = err;
    
    if (axiosError.response) {
      // La API respondió con un código de error
      const statusCode = axiosError.response.status;
      const responseData = axiosError.response.data;
      
      logger.error(`API Error (${statusCode}): ${JSON.stringify(responseData)}`);
      
      res.status(statusCode).json({
        success: false,
        error: {
          code: `RETELL_API_ERROR_${statusCode}`,
          message: responseData.message || axiosError.message,
          details: responseData
        }
      });
      return;
    } else if (axiosError.request) {
      // La petición fue realizada pero no se recibió respuesta
      logger.error(`API Request Error: No response received - ${axiosError.message}`);
      
      res.status(503).json({
        success: false,
        error: {
          code: 'RETELL_API_SERVICE_UNAVAILABLE',
          message: 'No se pudo conectar con la API de Retell',
          details: axiosError.message
        }
      });
      return;
    }
  }

  // Log del error
  logger.error(`Error (${statusCode}): ${message}`);
  if (err.stack) {
    logger.error(`Stack Trace: ${err.stack}`);
  }

  // Enviar respuesta
  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message
    }
  });
};

/**
 * Middleware para manejar rutas no encontradas
 */
export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const error: AppError = new Error(`Ruta no encontrada - ${req.originalUrl}`);
  error.statusCode = 404;
  error.code = 'NOT_FOUND';
  next(error);
};

/**
 * Función para crear y lanzar errores personalizados
 */
export const createError = (
  message: string,
  statusCode: number,
  code?: string
): AppError => {
  const error: AppError = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
};