import { ApiResponse } from '../interfaces/api-response.interface'
import { AppLogger } from '../logger/logger.service'

// Инициализируем логгер глобально, чтобы использовать его в хелперах
let appLogger: AppLogger | null = null

/**
 * Устанавливает экземпляр логгера для использования в хелперах
 */
export const setResponseLogger = (logger: AppLogger): void => {
	appLogger = logger
}

/**
 * Форматирует успешный ответ API
 */
export const successResponse = <T>(
	data: T,
	message = 'OK',
	meta?: any
): ApiResponse<T> => ({
	success: true,
	message,
	data,
	meta,
})

/**
 * Форматирует ответ с ошибкой и логирует её
 */
export const errorResponse = (
	message: string,
	errors?: any,
	context?: string
): ApiResponse => {
	// Если установлен логгер и есть ошибка, логируем её
	if (appLogger && errors) {
		appLogger.error(message, errors?.stack, context || 'API', { errors })
	} else if (errors) {
		// Запасной вариант, если логгер не настроен
		console.error('[API Error]', message, errors)
	}

	return {
		success: false,
		message,
		errors,
	}
}

/**
 * Форматирует и логирует предупреждение в API
 */
export const warningResponse = <T>(
	data: T,
	message: string,
	meta?: any,
	context?: string
): ApiResponse<T> => {
	if (appLogger) {
		appLogger.warn(message, context || 'API', { data, meta })
	}

	return {
		success: true,
		message,
		data,
		meta,
		warning: true,
	}
}
