import { Injectable } from '@nestjs/common'
import { PrismaService } from '~/prisma/prisma.service'
import { ChatsService } from '../chats/chats.service'
import {
	errorResponse,
	successResponse,
} from '../common/helpers/api.response.helper'
import { AppLogger } from '../common/logger/logger.service'
import { RedisPubSubService } from '../common/redis-pub-sub/redis-pub-sub.service'
import { RedisService } from '../redis/redis.service'
import { StorageService } from '../storage/storage.service'
import { UserService } from '../user/user.service'
import { CreateLikeDto } from './dto/create-like.dto'
import { GetLikesDto } from './dto/get-likes.dto'
import { MarkLikesReadDto } from './dto/mark-likes-read.dto'

@Injectable()
export class LikeService {
	private readonly CONTEXT = 'LikeService'

	constructor(
		private readonly prisma: PrismaService,
		private readonly userService: UserService,
		private readonly chatsService: ChatsService,
		private readonly logger: AppLogger,
		private readonly redisService: RedisService,
		private readonly redisPubSubService: RedisPubSubService,
		private readonly storageService: StorageService
	) {}

	async createLike(dto: CreateLikeDto) {
		try {
			this.logger.debug(
				`Создание симпатии от ${dto.fromUserId} к ${dto.toUserId}`,
				this.CONTEXT
			)

			const fromUserResponse = await this.userService.findByTelegramId(
				dto.fromUserId
			)
			const toUserResponse = await this.userService.findByTelegramId(
				dto.toUserId
			)

			if (
				!fromUserResponse.success ||
				!toUserResponse.success ||
				!fromUserResponse.data ||
				!toUserResponse.data
			) {
				this.logger.warn(
					`Пользователь не найден при создании симпатии`,
					this.CONTEXT,
					{ dto }
				)
				return errorResponse('Пользователь не найден')
			}

			const fromUser = fromUserResponse.data
			const toUser = toUserResponse.data

			// Проверяем, что пользователи не заблокированы
			if (fromUser.status === 'Blocked') {
				this.logger.warn(
					`Отправитель симпатии заблокирован: ${dto.fromUserId}`,
					this.CONTEXT
				)
				return errorResponse('Ваш аккаунт заблокирован')
			}

			if (toUser.status === 'Blocked') {
				this.logger.warn(
					`Получатель симпатии заблокирован: ${dto.toUserId}`,
					this.CONTEXT
				)
				return errorResponse('Пользователь недоступен')
			}

			const existingLike = await this.prisma.like.findUnique({
				where: {
					fromUserId_toUserId: {
						fromUserId: dto.fromUserId,
						toUserId: dto.toUserId,
					},
				},
			})

			if (existingLike) {
				this.logger.debug(
					`Симпатия уже существует: ${dto.fromUserId} -> ${dto.toUserId}`,
					this.CONTEXT
				)
				return errorResponse('Вы уже проявили симпатию к этому пользователю')
			}

			const reverseLike = await this.prisma.like.findUnique({
				where: {
					fromUserId_toUserId: {
						fromUserId: dto.toUserId,
						toUserId: dto.fromUserId,
					},
				},
			})

			const like = await this.prisma.like.create({
				data: {
					fromUserId: dto.fromUserId,
					toUserId: dto.toUserId,
					isMatch: !!reverseLike,
				},
			})

			this.logger.debug(
				`Симпатия создана: ${dto.fromUserId} -> ${dto.toUserId}`,
				this.CONTEXT,
				{ likeId: like.id }
			)

			// Отправка уведомления о новом лайке (всегда)
			await this.redisPubSubService.publishNewLike({
				fromUserId: dto.fromUserId,
				toUserId: dto.toUserId,
				timestamp: Date.now(),
			})

			if (reverseLike) {
				// Обновляем обратный лайк до статуса матча
				const avatarKey =
					fromUser.photos && fromUser.photos.length > 0
						? fromUser.photos[0].key
						: ''

				await this.prisma.like.update({
					where: { id: reverseLike.id },
					data: { isMatch: true },
				})

				this.logger.debug(
					`Обнаружен взаимный матч: ${dto.fromUserId} <-> ${dto.toUserId}`,
					this.CONTEXT
				)

				// Создаем чат в Redis для матча
				const chatCreationResult = await this.createChatForMatch(
					dto.fromUserId,
					dto.toUserId
				)

				// Отправляем уведомление о матче через Redis Pub/Sub
				await this.redisPubSubService.publishNewMatch({
					user1Id: dto.fromUserId,
					user2Id: dto.toUserId,
					chatId: chatCreationResult.success
						? chatCreationResult.data?.chatId || ''
						: '',
					timestamp: Date.now(),
				})

				await this.redisPubSubService.publishBotNotify({
					telegramId: toUserResponse.data.telegramId,
					text: `У вас новый матч с ${fromUserResponse.data.name}! Теперь вы можете общаться!`,
				})

				return successResponse(
					{
						like,
						isMatch: true,
						chatId: chatCreationResult.data?.chatId,
					},
					'Симпатия взаимна! Теперь вы можете общаться!'
				)
			}

			await this.redisPubSubService.publishBotNotify({
				telegramId: toUserResponse.data.telegramId,
				text: `Пользователь ${fromUserResponse.data.name} хочет с вами познакомиться!`,
			})
			return successResponse(like, 'Симпатия отправлена')
		} catch (error: any) {
			this.logger.error(
				'Ошибка при создании симпатии',
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse('Ошибка при создании симпатии:', error)
		}
	}

	async getLikes(dto: GetLikesDto) {
		try {
			const { telegramId, type } = dto

			this.logger.debug(
				`Получение симпатий типа ${type} для пользователя ${telegramId}`,
				this.CONTEXT
			)

			const userResponse = await this.userService.findByTelegramId(telegramId)
			if (!userResponse.success || !userResponse.data) {
				this.logger.warn(
					`Пользователь ${telegramId} не найден при получении симпатий`,
					this.CONTEXT
				)
				return errorResponse('Пользователь не найден')
			}

			let likes = []
			let message

			const enrichWithPhotoUrl = async (user: any) => {
				const photo = user.photos?.[0]
				const url = photo
					? await this.storageService.getPresignedUrl(photo.key)
					: null
				return {
					...user,
					photoUrl: url,
				}
			}

			const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

			switch (type) {
				case 'sent':
					likes = await this.prisma.like.findMany({
						where: { fromUserId: telegramId },
						include: {
							toUser: {
								select: {
									telegramId: true,
									name: true,
									age: true,
									town: true,
									photos: { take: 1, select: { key: true } },
								},
							},
						},
					})

					for (const like of likes) {
						like.toUser = await enrichWithPhotoUrl(like.toUser)
					}

					message = 'Отправленные симпатии получены'
					break

				case 'received':
					likes = await this.prisma.like.findMany({
						where: {
							isMatch: false,
							toUserId: telegramId,
							createdAt: { gte: twentyFourHoursAgo },
						},
						include: {
							fromUser: {
								select: {
									telegramId: true,
									name: true,
									age: true,
									town: true,
									photos: { take: 1, select: { key: true } },
								},
							},
						},
						orderBy: {
							createdAt: 'desc',
						},
					})

					for (const like of likes) {
						like.fromUser = await enrichWithPhotoUrl(like.fromUser)
					}

					message = 'Полученные симпатии получены'
					break

				case 'matches':
					likes = await this.prisma.like.findMany({
						where: {
							isMatch: true,
							createdAt: { gte: twentyFourHoursAgo },
							OR: [{ fromUserId: telegramId }, { toUserId: telegramId }],
						},
						include: {
							fromUser: {
								select: {
									telegramId: true,
									name: true,
									age: true,
									town: true,
									photos: { take: 1, select: { key: true } },
								},
							},
							toUser: {
								select: {
									telegramId: true,
									name: true,
									age: true,
									town: true,
									photos: { take: 1, select: { key: true } },
								},
							},
						},
					})

					for (const like of likes) {
						like.fromUser = await enrichWithPhotoUrl(like.fromUser)
						like.toUser = await enrichWithPhotoUrl(like.toUser)

						const otherUserId =
							like.fromUserId === telegramId ? like.toUserId : like.fromUserId

						const chatId = await this.findChatBetweenUsers(
							telegramId,
							otherUserId
						)
						if (chatId) {
							// @ts-ignore
							like.chatId = chatId
						}
					}

					message = 'Взаимные симпатии за последние 24 часа получены'
					break

				default:
					this.logger.warn(`Неизвестный тип симпатий: ${type}`, this.CONTEXT, {
						dto,
					})
					return errorResponse('Неизвестный тип запроса симпатий')
			}

			this.logger.debug(
				`Получено ${likes.length} симпатий типа ${type} для пользователя ${telegramId}`,
				this.CONTEXT
			)

			return successResponse(likes, message)
		} catch (error: any) {
			this.logger.error(
				'Ошибка при получении симпатий',
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse('Ошибка при получении симпатий:', error)
		}
	}

	async deleteLike(fromUserId: string, toUserId: string) {
		try {
			this.logger.debug(
				`Удаление симпатии от ${fromUserId} к ${toUserId}`,
				this.CONTEXT
			)

			const like = await this.prisma.like.findUnique({
				where: {
					fromUserId_toUserId: {
						fromUserId,
						toUserId,
					},
				},
			})

			if (!like) {
				this.logger.warn(
					`Симпатия не найдена: ${fromUserId} -> ${toUserId}`,
					this.CONTEXT
				)
				return errorResponse('Симпатия не найдена')
			}

			// Проверяем, есть ли матч
			const isMatch = like.isMatch

			// Удаляем лайк
			await this.prisma.like.delete({
				where: { id: like.id },
			})

			this.logger.debug(
				`Симпатия удалена: ${fromUserId} -> ${toUserId}`,
				this.CONTEXT,
				{ likeId: like.id }
			)

			// Если был матч, обновляем обратный лайк
			if (isMatch) {
				const reverseLike = await this.prisma.like.findUnique({
					where: {
						fromUserId_toUserId: {
							fromUserId: toUserId,
							toUserId: fromUserId,
						},
					},
				})

				if (reverseLike) {
					await this.prisma.like.update({
						where: { id: reverseLike.id },
						data: { isMatch: false },
					})

					this.logger.debug(
						`Обновлен статус обратной симпатии: ${toUserId} -> ${fromUserId}`,
						this.CONTEXT,
						{ reverseLikeId: reverseLike.id }
					)
				}

				// Публикуем событие об отмене матча
				await this.redisPubSubService.publish('match:cancel', {
					user1Id: fromUserId,
					user2Id: toUserId,
					timestamp: Date.now(),
				})

				// Удаляем чат при отмене матча
				const chatDeletionResult = await this.removeChat(fromUserId, toUserId)

				if (!chatDeletionResult.success) {
					this.logger.warn(
						`Проблема при удалении чата: ${chatDeletionResult.message}`,
						this.CONTEXT,
						{ error: chatDeletionResult.message }
					)
				}
			}

			return successResponse(null, 'Симпатия удалена')
		} catch (error: any) {
			this.logger.error(
				'Ошибка при удалении симпатии',
				error?.stack,
				this.CONTEXT,
				{ fromUserId, toUserId, error }
			)
			return errorResponse('Ошибка при удалении симпатии:', error)
		}
	}

	// Метод для проверки существования чата между пользователями
	private async findChatBetweenUsers(
		user1Id: string,
		user2Id: string
	): Promise<string | null> {
		try {
			// Получаем список чатов для первого пользователя
			const userChatsResponse = await this.chatsService.findAll({
				telegramId: user1Id,
			})

			if (
				!userChatsResponse.success ||
				!userChatsResponse.data ||
				!Array.isArray(userChatsResponse.data)
			) {
				return null
			}

			// Ищем чат со вторым пользователем
			const chatWithUser = userChatsResponse.data.find(
				chat => chat.toUser && chat.toUser.id === user2Id
			)

			return chatWithUser ? chatWithUser.chatId : null
		} catch (error: any) {
			this.logger.error(
				`Ошибка при поиске чата между пользователями ${user1Id} и ${user2Id}`,
				error?.stack,
				this.CONTEXT,
				{ error }
			)
			return null
		}
	}

	// Приватный метод для создания чата при матче
	private async createChatForMatch(user1Id: string, user2Id: string) {
		try {
			this.logger.debug(
				`Создание чата для матча между ${user1Id} и ${user2Id}`,
				this.CONTEXT
			)

			// Проверяем, существует ли уже чат между пользователями
			const existingChatId = await this.findChatBetweenUsers(user1Id, user2Id)
			if (existingChatId) {
				this.logger.debug(
					`Чат между ${user1Id} и ${user2Id} уже существует: ${existingChatId}`,
					this.CONTEXT
				)
				return successResponse({ chatId: existingChatId }, 'Чат уже существует')
			}

			// Создаем чат в Redis
			const chatResult = await this.chatsService.create({
				telegramId: user1Id,
				toUser: user2Id,
			})

			if (!chatResult.success) {
				this.logger.error(
					`Не удалось создать чат в Redis для матча`,
					undefined,
					this.CONTEXT,
					{ error: chatResult.message, user1Id, user2Id }
				)
				return errorResponse('Ошибка при создании чата для матча')
			}

			const chatId = chatResult.data?.chatId

			// Отправляем первое системное сообщение
			if (chatId) {
				const welcomeMessage = await this.chatsService.sendMessage({
					chatId,
					fromUser: user1Id,
					text: 'Поздравляем с взаимной симпатией! Теперь вы можете общаться.',
				})

				if (!welcomeMessage.success) {
					this.logger.warn(
						`Не удалось отправить приветственное сообщение в чат`,
						this.CONTEXT,
						{ error: welcomeMessage.message, chatId }
					)
				}
			}

			return successResponse({ chatId }, 'Чат для матча создан')
		} catch (error: any) {
			this.logger.error(
				'Ошибка при создании чата для матча',
				error?.stack,
				this.CONTEXT,
				{ user1Id, user2Id, error }
			)
			return errorResponse('Ошибка при создании чата для матча:', error)
		}
	}

	// Приватный метод для удаления чата при отмене матча
	private async removeChat(user1Id: string, user2Id: string) {
		try {
			this.logger.debug(
				`Удаление чата при отмене матча между ${user1Id} и ${user2Id}`,
				this.CONTEXT
			)

			// Находим чат между пользователями в Redis
			const chatId = await this.findChatBetweenUsers(user1Id, user2Id)

			if (!chatId) {
				this.logger.debug(
					`Чат между пользователями ${user1Id} и ${user2Id} не найден`,
					this.CONTEXT
				)
				return successResponse(false, 'Чат не найден')
			}

			// Удаляем чат
			const deleteResult = await this.chatsService.delete(chatId)

			if (!deleteResult.success) {
				this.logger.error(
					`Не удалось удалить чат ${chatId}`,
					undefined,
					this.CONTEXT,
					{ error: deleteResult.message, chatId }
				)
				return errorResponse('Ошибка при удалении чата')
			}

			return successResponse(true, 'Чат успешно удален')
		} catch (error: any) {
			this.logger.error(
				'Ошибка при удалении чата при отмене матча',
				error?.stack,
				this.CONTEXT,
				{ user1Id, user2Id, error }
			)
			return errorResponse('Ошибка при удалении чата:', error)
		}
	}

	/**
	 * Отметить все непрочитанные лайки как прочитанные
	 */
	async markLikesAsRead(dto: MarkLikesReadDto) {
		try {
			const { telegramId } = dto

			this.logger.debug(
				`Отметка всех непрочитанных лайков как прочитанных для пользователя ${telegramId}`,
				this.CONTEXT
			)

			// Проверяем существование пользователя
			const userResponse = await this.userService.findByTelegramId(telegramId)
			if (!userResponse.success || !userResponse.data) {
				this.logger.warn(
					`Пользователь ${telegramId} не найден при отметке лайков как прочитанных`,
					this.CONTEXT
				)
				return errorResponse('Пользователь не найден')
			}

			// Отмечаем ВСЕ непрочитанные лайки пользователя как прочитанные одним запросом
			const updateResult = await this.prisma.like.updateMany({
				where: {
					toUserId: telegramId,
					isRead: false,
					isMatch: false, // Исключаем матчи, так как они уже обработаны
				},
				data: {
					isRead: true,
				},
			})

			this.logger.debug(
				`Отмечено ${updateResult.count} лайков как прочитанных для пользователя ${telegramId}`,
				this.CONTEXT
			)

			// Отправляем уведомление через Redis Pub/Sub об обновлении счетчика
			await this.redisPubSubService.publish('likes:read', {
				userId: telegramId,
				count: updateResult.count,
				timestamp: Date.now(),
			})

			return successResponse(
				{ updatedCount: updateResult.count },
				`Отмечено ${updateResult.count} лайков как прочитанных`
			)
		} catch (error: any) {
			this.logger.error(
				'Ошибка при отметке лайков как прочитанных',
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse('Ошибка при отметке лайков как прочитанных:', error)
		}
	}

	/**
	 * Получить количество непрочитанных лайков
	 */
	async getUnreadLikesCount(telegramId: string) {
		try {
			this.logger.debug(
				`Получение количества непрочитанных лайков для пользователя ${telegramId}`,
				this.CONTEXT
			)

			// Проверяем существование пользователя
			const userResponse = await this.userService.findByTelegramId(telegramId)
			if (!userResponse.success || !userResponse.data) {
				this.logger.warn(
					`Пользователь ${telegramId} не найден при получении количества непрочитанных лайков`,
					this.CONTEXT
				)
				return errorResponse('Пользователь не найден')
			}

			const count = await this.prisma.like.count({
				where: {
					toUserId: telegramId,
					isRead: false,
					isMatch: false, // Исключаем матчи, так как они уже обработаны
				},
			})

			this.logger.debug(
				`Найдено ${count} непрочитанных лайков для пользователя ${telegramId}`,
				this.CONTEXT
			)

			return successResponse(
				{ count },
				`Количество непрочитанных лайков: ${count}`
			)
		} catch (error: any) {
			this.logger.error(
				'Ошибка при получении количества непрочитанных лайков',
				error?.stack,
				this.CONTEXT,
				{ telegramId, error }
			)
			return errorResponse(
				'Ошибка при получении количества непрочитанных лайков:',
				error
			)
		}
	}

	/**
	 * Получить непрочитанные лайки с деталями
	 */
	async getUnreadLikes(telegramId: string) {
		try {
			this.logger.debug(
				`Получение непрочитанных лайков для пользователя ${telegramId}`,
				this.CONTEXT
			)

			// Проверяем существование пользователя
			const userResponse = await this.userService.findByTelegramId(telegramId)

			if (!userResponse.success || !userResponse.data) {
				this.logger.warn(
					`Пользователь ${telegramId} не найден при получении непрочитанных лайков`,
					this.CONTEXT
				)
				return errorResponse('Пользователь не найден')
			}

			const likes = await this.prisma.like.findMany({
				where: {
					toUserId: telegramId,
					isRead: false,
					isMatch: false, // Исключаем матчи
				},
				include: {
					fromUser: {
						select: {
							telegramId: true,
							name: true,
							age: true,
							town: true,
							photos: { take: 1, select: { key: true } },
						},
					},
				},
				orderBy: {
					createdAt: 'desc',
				},
			})

			// Обогащаем данные URL фотографий
			for (const like of likes) {
				like.fromUser = await this.enrichUserWithPhotoUrl(like.fromUser)
			}

			this.logger.debug(
				`Получено ${likes.length} непрочитанных лайков для пользователя ${telegramId}`,
				this.CONTEXT
			)

			return successResponse(likes, 'Непрочитанные лайки получены')
		} catch (error: any) {
			this.logger.error(
				'Ошибка при получении непрочитанных лайков',
				error?.stack,
				this.CONTEXT,
				{ telegramId, error }
			)
			return errorResponse('Ошибка при получении непрочитанных лайков:', error)
		}
	}

	/**
	 * Вспомогательный метод для обогащения пользователя URL фотографии
	 */
	private async enrichUserWithPhotoUrl(user: any) {
		const photo = user.photos?.[0]
		const url = photo
			? await this.storageService.getPresignedUrl(photo.key)
			: null
		return {
			...user,
			photoUrl: url,
		}
	}
}
