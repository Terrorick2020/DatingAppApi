import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import * as cron from 'node-cron'
import { PrismaService } from '../../prisma/prisma.service'
import { ChatsService } from '../chats/chats.service'
import { AppLogger } from '../common/logger/logger.service'
import { RedisService } from '../redis/redis.service'

@Injectable()
export class ExpiredMatchesService implements OnModuleInit, OnModuleDestroy {
	private readonly CONTEXT = 'ExpiredMatchesService'
	private cleanupTask: cron.ScheduledTask | null = null
	private readonly CHAT_TTL = 86400 // 24 часа в секундах

	constructor(
		private readonly prisma: PrismaService,
		private readonly logger: AppLogger,
		private readonly redisService: RedisService,
		private readonly chatsService: ChatsService
	) {}

	async onModuleInit() {
		// Запускаем задачу очистки каждые 6 часов
		this.cleanupTask = cron.schedule('0 */6 * * *', async () => {
			try {
				await this.cleanupExpiredMatches()
			} catch (error: any) {
				this.logger.error(
					'Ошибка при очистке истекших матчей',
					error?.stack,
					this.CONTEXT,
					{ error }
				)
			}
		})

		this.logger.log(
			'Задача очистки истекших матчей инициализирована',
			this.CONTEXT
		)
	}

	onModuleDestroy() {
		if (this.cleanupTask) {
			this.cleanupTask.stop()
			this.logger.log(
				'Задача очистки истекших матчей остановлена',
				this.CONTEXT
			)
		}
	}

	/**
	 * Очистка истекших матчей
	 */
	private async cleanupExpiredMatches(): Promise<void> {
		try {
			this.logger.debug('Начинаем очистку истекших матчей', this.CONTEXT)

			// Получаем все матчи из базы данных
			const matches = await this.prisma.like.findMany({
				where: {
					isMatch: true,
				},
				include: {
					fromUser: {
						select: {
							telegramId: true,
							name: true,
						},
					},
					toUser: {
						select: {
							telegramId: true,
							name: true,
						},
					},
				},
			})

			this.logger.debug(
				`Найдено ${matches.length} матчей для проверки`,
				this.CONTEXT
			)

			let processedCount = 0
			let expiredCount = 0
			let errorCount = 0

			for (const match of matches) {
				try {
					processedCount++

					// Проверяем, существует ли чат в Redis
					const chatExists = await this.checkChatExists(
						match.fromUserId,
						match.toUserId
					)

					if (!chatExists) {
						// Чат не существует, значит он истек - удаляем матч
						await this.removeExpiredMatch(match)
						expiredCount++

						this.logger.debug(
							`Удален истекший матч между ${match.fromUserId} и ${match.toUserId}`,
							this.CONTEXT
						)
					}
				} catch (error: any) {
					errorCount++
					this.logger.error(
						`Ошибка при обработке матча ${match.id}`,
						error?.stack,
						this.CONTEXT,
						{ matchId: match.id, error }
					)
				}
			}

			this.logger.log(
				`Завершена очистка истекших матчей. Обработано: ${processedCount}, удалено: ${expiredCount}, ошибок: ${errorCount}`,
				this.CONTEXT
			)
		} catch (error: any) {
			this.logger.error(
				'Ошибка при очистке истекших матчей',
				error?.stack,
				this.CONTEXT,
				{ error }
			)
		}
	}

	/**
	 * Проверка существования чата между пользователями
	 */
	private async checkChatExists(
		user1Id: string,
		user2Id: string
	): Promise<boolean> {
		try {
			// Пытаемся найти чат между пользователями
			const chatId = await this.findChatBetweenUsers(user1Id, user2Id)
			return !!chatId
		} catch (error: any) {
			this.logger.warn(
				`Ошибка при проверке существования чата между ${user1Id} и ${user2Id}`,
				this.CONTEXT,
				{ error }
			)
			return false
		}
	}

	/**
	 * Поиск чата между пользователями
	 */
	private async findChatBetweenUsers(
		user1Id: string,
		user2Id: string
	): Promise<string | null> {
		try {
			// Получаем список чатов первого пользователя
			const user1ChatsKey = `user:${user1Id}:chats`
			const user1ChatsRes = await this.redisService.getKey(user1ChatsKey)

			if (!user1ChatsRes.success || !user1ChatsRes.data) {
				return null
			}

			const user1ChatIds: string[] = JSON.parse(user1ChatsRes.data)

			// Проверяем каждый чат на наличие второго пользователя
			for (const chatId of user1ChatIds) {
				const chatMetadataRes = await this.chatsService.getChatMetadata(chatId)

				if (chatMetadataRes.success && chatMetadataRes.data) {
					const chat = chatMetadataRes.data
					if (
						chat.participants.includes(user1Id) &&
						chat.participants.includes(user2Id)
					) {
						return chatId
					}
				}
			}

			return null
		} catch (error: any) {
			this.logger.warn(
				`Ошибка при поиске чата между ${user1Id} и ${user2Id}`,
				this.CONTEXT,
				{ error }
			)
			return null
		}
	}

	/**
	 * Удаление истекшего матча
	 */
	private async removeExpiredMatch(match: any): Promise<void> {
		try {
			// Удаляем оба лайка (в обе стороны)
			await this.prisma.like.deleteMany({
				where: {
					OR: [
						{
							fromUserId: match.fromUserId,
							toUserId: match.toUserId,
						},
						{
							fromUserId: match.toUserId,
							toUserId: match.fromUserId,
						},
					],
				},
			})

			this.logger.debug(
				`Удалены лайки для истекшего матча между ${match.fromUserId} и ${match.toUserId}`,
				this.CONTEXT
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при удалении истекшего матча`,
				error?.stack,
				this.CONTEXT,
				{ match, error }
			)
		}
	}

	/**
	 * Ручная очистка истекших матчей (для тестирования)
	 */
	async cleanupExpiredMatchesManual(): Promise<void> {
		this.logger.log('Запуск ручной очистки истекших матчей', this.CONTEXT)
		await this.cleanupExpiredMatches()
	}
}
