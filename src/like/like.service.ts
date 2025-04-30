import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { AppLogger } from '../common/logger/logger.service'
import {
	errorResponse,
	successResponse,
} from '../common/helpers/api.response.helper'
import { CreateLikeDto } from './dto/create-like.dto'
import { UserService } from '../user/user.service'
import { GetLikesDto } from './dto/get-likes.dto'
import { ChatsService } from '../chats/chats.service'
import { LikeTriggerDto } from './dto/like-trigger.dto'
import { SendMatchTcpPatterns } from './like.types'
import { RedisService } from '../redis/redis.service'
import { ClientProxy } from '@nestjs/microservices'

@Injectable()
export class LikeService {
	private readonly CONTEXT = 'LikeService'

	constructor(
		private prisma: PrismaService,
		private userService: UserService,
		private chatsService: ChatsService,
		private logger: AppLogger,
		private redisService: RedisService,
		@Inject('LIKE_SERVICE') private readonly wsClient: ClientProxy
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

				// Отправляем уведомление о матче через WebSocket
				try {
					// Получаем комнату получателя
					const receiverRoomResponse = await this.redisService.getKey(
						`user:${dto.toUserId}:room`
					)

					if (receiverRoomResponse.success && receiverRoomResponse.data) {
						const likeTriggerDto: LikeTriggerDto = {
							roomName: receiverRoomResponse.data,
							telegramId: dto.toUserId,
							isTrigger: true,
							fromUser: {
								id: dto.fromUserId,
								avatar: avatarKey,
								name: fromUser.name,
							},
						}

						this.wsClient.emit(SendMatchTcpPatterns.Trigger, likeTriggerDto)

						this.logger.debug(
							`Отправлено уведомление о матче для пользователя ${dto.toUserId}`,
							this.CONTEXT
						)
					} else {
						this.logger.debug(
							`Пользователь ${dto.toUserId} не в комнате, уведомление о матче не отправлено`,
							this.CONTEXT
						)
					}
				} catch (wsError: any) {
					this.logger.error(
						`Ошибка при отправке уведомления о матче через WebSocket`,
						wsError?.stack,
						this.CONTEXT,
						{ error: wsError }
					)
					// Не прерываем выполнение, так как основная операция успешна
				}

				// Создаем чат в Redis для матча
				const chatCreationResult = await this.createChatForMatch(
					dto.fromUserId,
					dto.toUserId
				)

				if (!chatCreationResult.success) {
					this.logger.error(
						`Ошибка при создании чата для матча`,
						undefined,
						this.CONTEXT,
						{ error: chatCreationResult.message, dto }
					)
				}

				return successResponse(
					{ like, isMatch: true, chatId: chatCreationResult.data?.chatId },
					'Симпатия взаимна! Теперь вы можете общаться'
				)
			}

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

			let likes
			let message

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
									photos: { take: 1 },
								},
							},
						},
					})
					message = 'Отправленные симпатии получены'
					break
				case 'received':
					likes = await this.prisma.like.findMany({
						where: { toUserId: telegramId },
						include: {
							fromUser: {
								select: {
									telegramId: true,
									name: true,
									age: true,
									town: true,
									photos: { take: 1 },
								},
							},
						},
					})
					message = 'Полученные симпатии получены'
					break
				case 'matches':
					likes = await this.prisma.like.findMany({
						where: {
							OR: [
								{ fromUserId: telegramId, isMatch: true },
								{ toUserId: telegramId, isMatch: true },
							],
						},
						include: {
							fromUser: {
								select: {
									telegramId: true,
									name: true,
									age: true,
									town: true,
									photos: { take: 1 },
								},
							},
							toUser: {
								select: {
									telegramId: true,
									name: true,
									age: true,
									town: true,
									photos: { take: 1 },
								},
							},
						},
					})

					// Обогащаем данные информацией о чатах
					if (likes.length > 0) {
						for (const like of likes) {
							// Определяем второго участника
							const otherUserId =
								like.fromUserId === telegramId ? like.toUserId : like.fromUserId

							// Проверяем существование чата в Redis
							const chatId = await this.findChatBetweenUsers(
								telegramId,
								otherUserId
							)

							if (chatId) {
								// @ts-ignore - добавляем chatId к объекту
								like.chatId = chatId
							}
						}
					}

					message = 'Взаимные симпатии получены'
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
}
