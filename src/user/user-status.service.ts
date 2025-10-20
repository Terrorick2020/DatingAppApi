import { Injectable } from '@nestjs/common'
import { AppLogger } from '../common/logger/logger.service'
import { RedisPubSubService } from '../common/redis-pub-sub/redis-pub-sub.service'
import { RedisService } from '../redis/redis.service'

@Injectable()
export class UserStatusService {
	private readonly CONTEXT = 'UserStatusService'
	private readonly ONLINE_TTL = 300 // 5 минут в секундах

	constructor(
		private readonly redisService: RedisService,
		private readonly logger: AppLogger,
		private readonly redisPubSubService: RedisPubSubService
	) {}

	/**
	 * Установить пользователя как онлайн
	 */
	async setUserOnline(telegramId: string): Promise<void> {
		try {
			const key = `user:${telegramId}:status`
			await this.redisService.setKey(key, 'online', this.ONLINE_TTL)

			this.logger.debug(
				`Пользователь ${telegramId} установлен как онлайн`,
				this.CONTEXT
			)

			await this.redisPubSubService.publishUserStatus({
				userId: telegramId,
				status: 'online',
				notifyUsers: [],
				timestamp: Date.now(),
			})
		} catch (error: any) {
			this.logger.error(
				`Ошибка при установке пользователя ${telegramId} как онлайн`,
				error?.stack,
				this.CONTEXT,
				{ error }
			)
		}
	}

	/**
	 * Установить пользователя как оффлайн
	 */
	async setUserOffline(telegramId: string): Promise<void> {
		try {
			const key = `user:${telegramId}:status`
			await this.redisService.deleteKey(key)

			this.logger.debug(
				`Пользователь ${telegramId} установлен как оффлайн`,
				this.CONTEXT
			)

			// Публикуем событие об изменении статуса
			await this.redisPubSubService.publishUserStatus({
				userId: telegramId,
				status: 'offline',
				notifyUsers: [],
				timestamp: Date.now(),
			})
		} catch (error: any) {
			this.logger.error(
				`Ошибка при установке пользователя ${telegramId} как оффлайн`,
				error?.stack,
				this.CONTEXT,
				{ error }
			)
		}
	}

	/**
	 * Проверить, онлайн ли пользователь
	 */
	async isUserOnline(telegramId: string): Promise<boolean> {
		try {
			const key = `user:${telegramId}:status`
			const result = await this.redisService.getKey(key)
			return result.success && result.data === 'online'
		} catch (error: any) {
			this.logger.error(
				`Ошибка при проверке статуса пользователя ${telegramId}`,
				error?.stack,
				this.CONTEXT,
				{ error }
			)
			return false
		}
	}

	/**
	 * Обновить время последней активности (продлить онлайн статус)
	 */
	async updateUserActivity(telegramId: string): Promise<void> {
		try {
			const key = `user:${telegramId}:status`
			const isOnline = await this.isUserOnline(telegramId)

			if (isOnline) {
				await this.redisService.setKey(key, 'online', this.ONLINE_TTL)
			}
		} catch (error: any) {
			this.logger.error(
				`Ошибка при обновлении активности пользователя ${telegramId}`,
				error?.stack,
				this.CONTEXT,
				{ error }
			)
		}
	}

	/**
	 * Получить список онлайн пользователей
	 */
	async getOnlineUsers(): Promise<string[]> {
		try {
			const pattern = 'user:*:status'
			const keysResult = await this.redisService.getKeysByPattern(pattern)

			if (!keysResult.success || !keysResult.data) {
				return []
			}

			const onlineUsers: string[] = []

			for (const key of keysResult.data) {
				const result = await this.redisService.getKey(key)
				if (result.success && result.data === 'online') {
					const telegramId = key.replace('user:', '').replace(':status', '')
					onlineUsers.push(telegramId)
				}
			}

			return onlineUsers
		} catch (error: any) {
			this.logger.error(
				`Ошибка при получении списка онлайн пользователей`,
				error?.stack,
				this.CONTEXT,
				{ error }
			)
			return []
		}
	}
}
