import { Injectable } from '@nestjs/common'
import Redis from 'ioredis'
import { AppLogger } from '../common/logger/logger.service'

@Injectable()
export class RedisErrorHandler {
	private readonly CONTEXT = 'RedisErrorHandler'

	constructor(private readonly logger: AppLogger) {}

	/**
	 * Подключение обработчиков событий к Redis-клиенту
	 */
	attachErrorHandlers(redisClient: Redis): void {
		redisClient.on('error', (error: Error) => {
			this.logger.error(
				'Ошибка подключения к Redis',
				error?.stack,
				this.CONTEXT,
				{ error }
			)
		})

		redisClient.on('connect', () => {
			this.logger.log('Подключение к Redis установлено', this.CONTEXT)
		})

		redisClient.on('reconnecting', (delay: number) => {
			this.logger.warn(`Переподключение к Redis через ${delay}ms`, this.CONTEXT)
		})

		redisClient.on('end', () => {
			this.logger.warn('Соединение с Redis закрыто', this.CONTEXT)
		})
	}

	/**
	 * Обработка ошибок Redis для более информативной обратной связи
	 */
	handleRedisError(error: Error, operation: string, key?: string): string {
		let errorMessage = `Ошибка Redis при операции "${operation}"`

		if (key) {
			errorMessage += ` с ключом "${key}"`
		}

		this.logger.error(errorMessage, error?.stack, this.CONTEXT, {
			operation,
			key,
			error,
		})

		// Преобразуем специфические ошибки Redis в более понятные сообщения
		if (error.name === 'ReplyError') {
			const errorMsg = error.message || ''
			if (errorMsg.includes('WRONGTYPE')) {
				return 'Несовместимый тип данных для запрошенной операции'
			} else if (errorMsg.includes('NOSCRIPT')) {
				return 'Запрошенный скрипт не найден в кеше скриптов'
			}
		}

		return error.message || 'Неизвестная ошибка Redis'
	}
}
