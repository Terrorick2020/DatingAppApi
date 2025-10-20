import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'
import { RedisService } from '../../redis/redis.service'
import { AppLogger } from '../logger/logger.service'

@Injectable()
export class RedisPubSubService implements OnModuleInit, OnModuleDestroy {
	private readonly publisher: Redis
	private readonly CONTEXT = 'RedisPubSubService'

	constructor(
		private readonly logger: AppLogger,
		private readonly configService: ConfigService,
		private readonly redisService: RedisService
	) {
		this.publisher = new Redis({
			host: this.configService.get('REDIS_HOST', 'localhost'),
			port: parseInt(this.configService.get('REDIS_PORT', '6379')),
			password: this.configService.get('REDIS_PASSWORD', ''),
			db: parseInt(this.configService.get('REDIS_DB', '0')),
		})
	}

	async onModuleInit() {
		this.logger.log('Redis Pub/Sub сервис инициализирован', this.CONTEXT)
	}

	async onModuleDestroy() {
		await this.publisher.quit()
		this.logger.log('Redis Pub/Sub соединение закрыто', this.CONTEXT)
	}

	/**
	 * Публикация события в канал Redis
	 */
	async publish(channel: string, message: any): Promise<void> {
		try {
			// Проверка типа сообщения и преобразование в JSON если нужно
			const messageString =
				typeof message === 'string' ? message : JSON.stringify(message)

			await this.publisher.publish(channel, messageString)
			this.logger.debug(
				`Событие опубликовано в канал ${channel}`,
				this.CONTEXT,
				{ messageType: typeof message }
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при публикации события в канал ${channel}`,
				error?.stack,
				this.CONTEXT,
				{ error, channel }
			)
		}
	}

	/**
	 * Публикация уведомления о новом сообщении
	 */
	async publishNewMessage(data: {
		chatId: string
		messageId: string
		senderId: string
		recipientId: string
		text: string
		timestamp: number
		media_type?: string
		media_url?: string
	}): Promise<void> {
		await this.publish('chat:newMessage', data)
	}

	/**
	 * Публикация уведомления о прочтении сообщения
	 */
	async publishMessageRead(data: {
		chatId: string
		userId: string
		messageIds: string[]
		timestamp: number
	}): Promise<void> {
		await this.publish('chat:messageRead', data)
	}

	/**
	 * Публикация уведомления о статусе набора текста
	 */
	async publishTypingStatus(data: {
		chatId: string
		userId: string
		isTyping: boolean
		participants: string[]
	}): Promise<void> {
		await this.publish('chat:typing', data)
	}

	/**
	 * Публикация уведомления о новом лайке
	 */
	async publishNewLike(data: {
		fromUserId: string
		toUserId: string
		timestamp: number
	}): Promise<void> {
		await this.publish('like:new', data)
	}

	/**
	 * Публикация уведомления о новом матче
	 */
	async publishNewMatch(data: {
		user1Id: string
		user2Id: string
		chatId: string
		timestamp: number
	}): Promise<void> {
		await this.publish('match:new', data)
	}

	/**
	 * Публикация уведомления об изменении статуса жалобы
	 */
	async publishComplaintUpdate(data: {
		id: string
		fromUserId: string
		reportedUserId: string
		status: string
		timestamp: number
	}): Promise<void> {
		await this.publish('complaint:update', data)
	}

	/**
	 * Публикация уведомления об изменении статуса пользователя (онлайн/оффлайн)
	 */
	async publishUserStatus(data: {
		userId: string
		status: 'online' | 'offline'
		notifyUsers: string[]
		timestamp: number
	}): Promise<void> {
		await this.publish('user:status', data)
	}

	/**
	 * Публикация уведомления об изменении статуса жалобы
	 */
	async publishBotNotify(data: {
		telegramId: string
		text: string
	}): Promise<void> {
		// Проверяем, онлайн ли пользователь
		const isOnline = await this.isUserOnline(data.telegramId)

		if (isOnline) {
			this.logger.debug(
				`Пользователь ${data.telegramId} онлайн, уведомление не отправляется`,
				this.CONTEXT
			)
			return
		}

		await this.publish('bot:notify', data)
	}

	/**
	 * Проверить, онлайн ли пользователь
	 */
	private async isUserOnline(telegramId: string): Promise<boolean> {
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
	 * Публикация уведомления об удалении чата другим пользователем
	 */
	async publishChatDeleted(data: {
		chatId: string
		deletedByUserId: string
		participants: string[]
		timestamp: number
	}): Promise<void> {
		await this.publish('chat:deleted', data)
	}
}
