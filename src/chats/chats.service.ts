import {
	errorResponse,
	successResponse,
} from '@/common/helpers/api.response.helper'
import type { ApiResponse } from '@/common/interfaces/api-response.interface'
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import * as cron from 'node-cron'
import { v4 } from 'uuid'
import { PrismaService } from '~/prisma/prisma.service'
import { FindAllChatsUserFields } from '~/prisma/selects/chats.selects'
import { AppLogger } from '../common/logger/logger.service'
import { RedisPubSubService } from '../common/redis-pub-sub/redis-pub-sub.service'
import { PsychologistService } from '../psychologist/psychologist.service'
import { RedisService } from '../redis/redis.service'
import { StorageService } from '../storage/storage.service'
import type { ChatPreview, ResCreateChat } from './chats.types'
import { type Chat, type ChatMsg } from './chats.types'
import { CreateChatWithPsychologistDto } from './dto/create-chat-with-psychologist.dto'
import { CreateDto } from './dto/create.dto'
import { FindDto } from './dto/find.dto'
import { ReadMessagesDto } from './dto/read-messages.dto'
import { SendMessageWithMediaDto } from './dto/send-message-with-media.dto'
import { SendMessageDto } from './dto/send-messages.dto'
import { TypingStatusDto } from './dto/typing-status.dto'

@Injectable()
export class ChatsService implements OnModuleInit, OnModuleDestroy {
	private readonly CHAT_TTL = 86400 // 24 часа в секундах
	private readonly CACHE_TTL = 900 // 15 минут в секундах для превью чатов
	private cleanupTask: cron.ScheduledTask | null = null
	private readonly lockKey = 'chat_cleanup_lock'
	private readonly lockDuration = 600 // 10 минут блокировки для очистки
	private readonly CONTEXT = 'ChatsService'

	constructor(
		private readonly prismaService: PrismaService,
		private readonly redisService: RedisService,
		private readonly storageService: StorageService,
		private readonly logger: AppLogger,
		private readonly redisPubSubService: RedisPubSubService,
		private readonly psychologistService: PsychologistService
	) {}

	/**
	 * Инициализация сервиса чатов
	 */
	async onModuleInit() {
		// Запускаем задачу очистки каждые 6 часов, но с проверкой блокировки
		this.cleanupTask = cron.schedule('0 */6 * * *', async () => {
			try {
				await this.runChatCleanupWithLock()
			} catch (error: any) {
				this.logger.error(
					'Ошибка при очистке устаревших чатов',
					error?.stack,
					this.CONTEXT,
					{ error }
				)
			}
		})
		this.logger.log('Задача очистки чатов инициализирована', this.CONTEXT)
	}

	/**
	 * Корректное завершение работы сервиса
	 */
	onModuleDestroy() {
		if (this.cleanupTask) {
			this.cleanupTask.stop()
			this.logger.log('Задача очистки чатов остановлена', this.CONTEXT)
		}
	}

	/**
	 * Получение метаданных чата
	 */
	async getChatMetadata(chatId: string): Promise<ApiResponse<Chat>> {
		try {
			const chatKey = `chat:${chatId}`
			const chatData = await this.redisService.getKey(chatKey)

			if (!chatData.success || !chatData.data) {
				this.logger.debug(`Чат ${chatId} не найден`, this.CONTEXT)
				return errorResponse('Чат не найден')
			}

			const chat: Chat = JSON.parse(chatData.data)

			if (!chat || !chat.id || !Array.isArray(chat.participants)) {
				this.logger.warn(
					`Неверный формат данных чата ${chatId}`,
					this.CONTEXT,
					{ chat }
				)
				return errorResponse('Неверный формат данных чата')
			}

			this.logger.debug(
				`Метаданные чата ${chatId} успешно получены`,
				this.CONTEXT
			)
			return successResponse<Chat>(chat, 'Метаданные чата получены')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при получении метаданных чата ${chatId}`,
				error?.stack,
				this.CONTEXT,
				{ chatId, error }
			)
			return errorResponse('Ошибка при получении метаданных чата', error)
		}
	}

	/**
	 * Получение статуса прочтения для чата
	 */
	async getReadStatus(
		chatId: string
	): Promise<ApiResponse<Record<string, string | null>>> {
		try {
			const readStatusKey = `chat:${chatId}:read_status`
			const readStatus = await this.redisService.getKey(readStatusKey)

			if (!readStatus.success || !readStatus.data) {
				this.logger.debug(
					`Статус прочтения для чата ${chatId} не найден`,
					this.CONTEXT
				)
				return errorResponse('Статус прочтения не найден')
			}

			const readStatusData = JSON.parse(readStatus.data)
			this.logger.debug(
				`Статус прочтения для чата ${chatId} получен`,
				this.CONTEXT
			)
			return successResponse(readStatusData, 'Статус прочтения получен')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при получении статуса прочтения для чата ${chatId}`,
				error?.stack,
				this.CONTEXT,
				{ chatId, error }
			)
			return errorResponse('Ошибка при получении статуса прочтения', error)
		}
	}

	/**
	 * Получение сообщений чата
	 */
	async getChatMessages(
		chatId: string,
		limit: number = 50,
		offset: number = 0
	): Promise<ApiResponse<ChatMsg[]>> {
		try {
			const messagesKey = `chat:${chatId}:messages`
			const orderKey = `chat:${chatId}:order`

			// Получаем упорядоченный список ID сообщений
			const messageIdsResponse = await this.redisService.getZRevRange(
				orderKey,
				offset,
				offset + limit - 1
			)

			if (!messageIdsResponse.success || !messageIdsResponse.data) {
				this.logger.debug(
					`Сообщения для чата ${chatId} не найдены`,
					this.CONTEXT,
					{ limit, offset }
				)
				return errorResponse('Сообщения не найдены')
			}

			const messageIds = messageIdsResponse.data

			// Если сообщений нет, возвращаем пустой массив
			if (messageIds.length === 0) {
				this.logger.debug(`В чате ${chatId} нет сообщений`, this.CONTEXT, {
					limit,
					offset,
				})
				return successResponse([], 'Сообщения не найдены')
			}

			// Получаем сообщения по их ID
			const messagesResponse = await this.redisService.getHashMultiple(
				messagesKey,
				messageIds
			)

			if (!messagesResponse.success || !messagesResponse.data) {
				this.logger.warn(
					`Ошибка при получении сообщений чата ${chatId}`,
					this.CONTEXT,
					{ messageIds }
				)
				return errorResponse('Ошибка при получении сообщений')
			}

			// Парсим и валидируем сообщения
			const messages: ChatMsg[] = messagesResponse.data
				.map(msgStr => {
					try {
						// Проверка на null, так как некоторые сообщения могут отсутствовать
						if (msgStr === null) return null
						const msg: ChatMsg = JSON.parse(msgStr)
						if (!msg || !msg.id || !msg.chatId || !msg.fromUser) {
							this.logger.debug(`Сообщение не прошло валидацию`, this.CONTEXT, {
								msg,
							})
							return null
						}
						return msg
					} catch (e) {
						this.logger.debug(`Ошибка при парсинге сообщения`, this.CONTEXT, {
							error: e,
							msgStr,
						})
						return null
					}
				})
				.filter(Boolean) as ChatMsg[]

			this.logger.debug(
				`Получено ${messages.length} сообщений для чата ${chatId}`,
				this.CONTEXT,
				{ messageCount: messages.length, limit, offset }
			)
			return successResponse<ChatMsg[]>(
				messages.reverse(),
				'Сообщения чата получены'
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при получении сообщений чата ${chatId}`,
				error?.stack,
				this.CONTEXT,
				{ chatId, limit, offset, error }
			)
			return errorResponse('Ошибка при получении сообщений чата', error)
		}
	}

	/**
	 * Получение всех чатов пользователя с оптимизированным кешированием превью
	 */
	async findAll(findDto: FindDto): Promise<ApiResponse<ChatPreview[]>> {
		try {
			const { telegramId } = findDto
			this.logger.debug(
				`Получение списка чатов для пользователя ${telegramId}`,
				this.CONTEXT
			)

			const userChatsKey = `user:${telegramId}:chats`
			const previewCacheKey = `user:${telegramId}:chats_preview`

			const cachedPreviewsResponse =
				await this.redisService.getKey(previewCacheKey)
			if (cachedPreviewsResponse.success && cachedPreviewsResponse.data) {
				try {
					const cachedPreviews = JSON.parse(
						cachedPreviewsResponse.data
					) as ChatPreview[]
					this.logger.debug(
						`Получены кешированные превью чатов для пользователя ${telegramId}`,
						this.CONTEXT,
						{ count: cachedPreviews.length }
					)
					return successResponse(cachedPreviews, 'Список чатов получен из кеша')
				} catch (e) {
					this.logger.warn(
						`Ошибка при парсинге кеша превью для пользователя ${telegramId}`,
						this.CONTEXT,
						{ error: e }
					)
				}
			}

			const userChatsResponse = await this.redisService.getKey(userChatsKey)
			if (!userChatsResponse.success || !userChatsResponse.data) {
				this.logger.debug(
					`У пользователя ${telegramId} нет чатов`,
					this.CONTEXT
				)
				return successResponse([], 'У пользователя нет чатов')
			}

			const chatIds = JSON.parse(userChatsResponse.data)
			this.logger.debug(
				`Найдено ${chatIds.length} чатов для пользователя ${telegramId}: ${JSON.stringify(chatIds)}`,
				this.CONTEXT
			)

			if (!Array.isArray(chatIds) || chatIds.length === 0) {
				this.logger.debug(
					`У пользователя ${telegramId} пустой список чатов`,
					this.CONTEXT
				)
				return successResponse([], 'У пользователя нет чатов')
			}

			// Проверяем, является ли запрашивающий пользователем или психологом
			const [user, psychologist] = await Promise.all([
				this.prismaService.user.findUnique({
					where: {
						telegramId,
						status: { not: 'Blocked' },
					},
				}),
				this.prismaService.psychologist.findUnique({
					where: {
						telegramId,
						status: 'Active',
					},
				}),
			])

			if (!user && !psychologist) {
				this.logger.warn(
					`Пользователь ${telegramId} не найден или заблокирован`,
					this.CONTEXT
				)
				return errorResponse('Пользователь не найден или заблокирован')
			}

			this.logger.debug(
				`Загружаем метаданные для ${chatIds.length} чатов пользователя ${telegramId}`,
				this.CONTEXT
			)

			const metadataResults = await Promise.all(
				chatIds.map(chatId => this.getChatMetadata(chatId))
			)

			const validChats = metadataResults
				.filter(result => result.success && result.data)
				.map(result => result.data as Chat)

			this.logger.debug(
				`Получено ${validChats.length} валидных чатов из ${chatIds.length}`,
				this.CONTEXT
			)

			// Сортировка будет выполнена позже для chatPreviews

			const interlocutorIds = validChats
				.map(chat => chat.participants.find(id => id !== telegramId))
				.filter(Boolean) as string[]

			// Получаем обычных пользователей
			const users = await this.prismaService.user.findMany({
				where: {
					telegramId: { in: interlocutorIds },
					status: { not: 'Blocked' },
				},
				select: FindAllChatsUserFields,
			})

			// Получаем психологов
			const psychologists = await this.prismaService.psychologist.findMany({
				where: {
					telegramId: { in: interlocutorIds },
					status: 'Active',
				},
				select: {
					telegramId: true,
					name: true,
					about: true,
					photos: {
						select: {
							key: true,
						},
						take: 1,
					},
				},
			})

			// Объединяем пользователей и психологов
			const allInterlocutors = [
				...users.map(user => ({ ...user, type: 'user' })),
				...psychologists.map(psychologist => ({
					...psychologist,
					type: 'psychologist',
					age: null, // У психологов нет возраста
					interest: null, // У психологов нет интересов
				})),
			]

			this.logger.debug(
				`Получены данные ${allInterlocutors.length} собеседников (${users.length} пользователей, ${psychologists.length} психологов)`,
				this.CONTEXT
			)

			const usersMap = new Map<string, any>(
				allInterlocutors.map((interlocutor: any) => [
					interlocutor.telegramId,
					interlocutor,
				])
			)

			// Генерация URL-ов аватаров
			const photoUrlMap = new Map<string, { key: string; url: string }>()
			for (const interlocutor of allInterlocutors) {
				const key = interlocutor.photos[0]?.key || ''
				const url = key ? await this.storageService.getPresignedUrl(key) : ''
				photoUrlMap.set(interlocutor.telegramId, { key, url })
			}

			const readStatusResults = await Promise.all(
				validChats.map(chat => this.getReadStatus(chat.id))
			)

			const readStatusMap = new Map(
				readStatusResults
					.filter(result => result.success && result.data)
					.map((result, index) => [validChats[index].id, result.data])
			)

			const chatPreviews: ChatPreview[] = []

			for (const chat of validChats) {
				const interlocutorId = chat.participants.find(id => id !== telegramId)
				if (!interlocutorId) continue

				const user = usersMap.get(interlocutorId)!
				if (!user) continue

				const readStatus = readStatusMap.get(chat.id)
				const lastReadMessageId = readStatus?.[telegramId] || null

				let lastMessage: ChatMsg | null = null
				let unreadCount = 0

				if (chat.last_message_id) {
					const messageKey = `chat:${chat.id}:messages`
					const lastMessageResponse = await this.redisService.getHashField(
						messageKey,
						chat.last_message_id
					)

					if (lastMessageResponse.success && lastMessageResponse.data) {
						try {
							lastMessage = JSON.parse(lastMessageResponse.data)
						} catch {}
					}

					if (lastReadMessageId && lastReadMessageId !== chat.last_message_id) {
						const orderKey = `chat:${chat.id}:order`
						const messagesKey = `chat:${chat.id}:messages`

						// Получаем все сообщения после lastReadMessageId
						const unreadMessageIdsResponse =
							await this.redisService.getMessagesAfter(
								orderKey,
								messageKey,
								lastReadMessageId
							)

						if (
							unreadMessageIdsResponse.success &&
							Array.isArray(unreadMessageIdsResponse.data)
						) {
							const unreadIds = unreadMessageIdsResponse.data
							const messageIds = unreadIds.map(msg => msg.id)
							const unreadMessagesResponse =
								await this.redisService.getHashMultiple(messagesKey, messageIds)

							if (
								unreadMessagesResponse.success &&
								Array.isArray(unreadMessagesResponse.data)
							) {
								const unreadMsgs = unreadMessagesResponse.data
									.map(msgStr => {
										try {
											return msgStr ? JSON.parse(msgStr) : null
										} catch {
											return null
										}
									})
									.filter(
										(msg: ChatMsg | null): msg is ChatMsg =>
											msg !== null && msg.fromUser !== telegramId
									)

								unreadCount = unreadMsgs.length
							}
						}
					}
				}

				const photoInfo = photoUrlMap.get(interlocutorId) || {
					key: '',
					url: '',
				}

				chatPreviews.push({
					chatId: chat.id,
					toUser: {
						id: user.telegramId,
						name: user.name,
						age: user.age,
						avatarKey: photoInfo.key,
						avatarUrl: photoInfo.url,
						interest: user.interest?.label || null,
					},
					lastMsg: lastMessage?.text || '',
					created_at: chat.created_at,
					last_message_at: chat.last_message_at,
					unread_count: unreadCount,
				})
			}

			// Сортируем чаты по времени последнего сообщения (как в Telegram)
			// Чем позже было отправлено последнее сообщение - тем выше чат в списке
			chatPreviews.sort((a, b) => {
				// Если у обоих чатов есть сообщения, сортируем по last_message_at (новые сверху)
				if (a.last_message_at && b.last_message_at) {
					return b.last_message_at - a.last_message_at
				}
				// Если у одного есть сообщения, а у другого нет - чат с сообщениями выше
				if (a.last_message_at && !b.last_message_at) {
					return -1
				}
				if (!a.last_message_at && b.last_message_at) {
					return 1
				}
				// Если у обоих нет сообщений, сортируем по времени создания (новые сверху)
				return b.created_at - a.created_at
			})

			await this.redisService.setKey(
				previewCacheKey,
				JSON.stringify(chatPreviews),
				this.CACHE_TTL
			)

			return successResponse(chatPreviews, 'Список чатов получен')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при получении списка чатов для пользователя ${findDto.telegramId}`,
				error?.stack,
				this.CONTEXT,
				{ telegramId: findDto.telegramId, error }
			)
			return errorResponse('Ошибка при получении списка чатов', error)
		}
	}

	/**
	 * Создание нового чата
	 */
	async create(createDto: CreateDto): Promise<ApiResponse<ResCreateChat>> {
		try {
			const { telegramId, toUser } = createDto

			this.logger.debug(
				`Создание чата между пользователями ${telegramId} и ${toUser}`,
				this.CONTEXT
			)

			// Проверяем существование пользователей
			const [sender, receiver] = await Promise.all([
				this.prismaService.user.findUnique({
					where: { telegramId, status: { not: 'Blocked' } },
				}),
				this.prismaService.user.findUnique({
					where: { telegramId: toUser, status: { not: 'Blocked' } },
				}),
			])

			if (!sender) {
				this.logger.warn(
					`Отправитель ${telegramId} не найден или заблокирован`,
					this.CONTEXT
				)
				return errorResponse('Отправитель не найден или заблокирован')
			}

			if (!receiver) {
				this.logger.warn(
					`Получатель ${toUser} не найден или заблокирован`,
					this.CONTEXT
				)
				return errorResponse('Получатель не найден или заблокирован')
			}

			// Проверяем, существует ли уже чат между этими пользователями
			const existingChatId = await this.findExistingChat(telegramId, toUser)

			if (existingChatId) {
				this.logger.debug(
					`Найден существующий чат ${existingChatId} между пользователями ${telegramId} и ${toUser}`,
					this.CONTEXT
				)

				// Продлеваем TTL для существующего чата
				await this.extendChatTTL(existingChatId)

				// Инвалидируем кеш превью
				await this.invalidateChatsPreviewCache(telegramId)
				await this.invalidateChatsPreviewCache(toUser)

				return successResponse(
					{ chatId: existingChatId, toUser },
					'Чат уже существует'
				)
			}

			// Создаем новый чат
			const chatId = v4()
			const timestamp = Date.now()

			this.logger.debug(
				`Создание нового чата ${chatId} между пользователями ${telegramId} и ${toUser}`,
				this.CONTEXT
			)

			// Метаданные чата
			const chatMetadata: Chat = {
				id: chatId,
				participants: [telegramId, toUser],
				created_at: timestamp,
				last_message_id: null,
				last_message_at: timestamp, // Инициализируем временем создания чата
				typing: [], // Инициализируем пустой массив
			}

			// Статус прочтения
			const readStatus = {
				[telegramId]: null,
				[toUser]: null,
			}

			// Сохраняем данные в Redis с точным TTL
			await Promise.all([
				this.redisService.setKey(
					`chat:${chatId}`,
					JSON.stringify(chatMetadata),
					this.CHAT_TTL
				),
				this.redisService.setKey(
					`chat:${chatId}:read_status`,
					JSON.stringify(readStatus),
					this.CHAT_TTL
				),
			])

			// Добавляем чат в списки чатов пользователей
			await Promise.all([
				this.addChatToUserList(telegramId, chatId),
				this.addChatToUserList(toUser, chatId),
			])

			// Инвалидируем кеш превью
			await this.invalidateChatsPreviewCache(telegramId)
			await this.invalidateChatsPreviewCache(toUser)

			// Отправляем уведомления через Redis Pub/Sub для WebSocket сервера
			// Получаем данные для отправки в уведомлении
			const userData = await this.prismaService.user.findUnique({
				where: { telegramId },
				select: {
					name: true,
					photos: { take: 1 },
				},
			})

			const receiverData = await this.prismaService.user.findUnique({
				where: { telegramId: toUser },
				select: {
					name: true,
					photos: { take: 1 },
				},
			})

			// Публикуем событие создания чата для обоих участников
			for (const participant of [telegramId, toUser]) {
				// Определяем данные собеседника для этого участника
				const otherParticipant =
					participant === telegramId ? toUser : telegramId
				const otherUserData =
					participant === telegramId ? receiverData : userData

				await this.redisPubSubService.publish('chat:new', {
					userId: participant,
					chatId,
					withUser: {
						id: otherParticipant,
						name: otherUserData?.name || 'Unknown',
						avatar: otherUserData?.photos?.[0]?.key || '',
					},
					created_at: timestamp,
					timestamp,
				})
			}

			this.logger.debug(`Чат ${chatId} успешно создан`, this.CONTEXT)

			return successResponse({ chatId, toUser }, 'Чат успешно создан')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при создании чата`,
				error?.stack,
				this.CONTEXT,
				{ dto: createDto, error }
			)
			return errorResponse('Ошибка при создании чата', error)
		}
	}

	/**
	 * Отправка сообщения в чат
	 */
	async sendMessage(dto: SendMessageDto): Promise<ApiResponse<ChatMsg>> {
		try {
			const { chatId, fromUser, text } = dto

			this.logger.debug(
				`Отправка сообщения в чат ${chatId} от пользователя ${fromUser}`,
				this.CONTEXT
			)

			// Проверяем существование чата
			const chatMetadata = await this.getChatMetadata(chatId)

			if (!chatMetadata.success || !chatMetadata.data) {
				this.logger.warn(
					`Попытка отправить сообщение в несуществующий чат ${chatId}`,
					this.CONTEXT
				)
				return errorResponse('Чат не найден')
			}

			const chat = chatMetadata.data

			// Проверяем, является ли пользователь участником чата
			if (!chat.participants.includes(fromUser)) {
				this.logger.warn(
					`Пользователь ${fromUser} не является участником чата ${chatId}`,
					this.CONTEXT
				)
				return errorResponse('Вы не являетесь участником этого чата')
			}

			// Проверяем, не заблокирован ли пользователь или психолог
			const [userSender, psychologistSender] = await Promise.all([
				this.prismaService.user.findUnique({
					where: { telegramId: fromUser, status: { not: 'Blocked' } },
				}),
				this.prismaService.psychologist.findUnique({
					where: { telegramId: fromUser, status: 'Active' },
				}),
			])

			if (!userSender && !psychologistSender) {
				this.logger.warn(
					`Отправитель ${fromUser} не найден или заблокирован`,
					this.CONTEXT
				)
				return errorResponse('Отправитель не найден или заблокирован')
			}

			// Создаем новое сообщение
			const messageId = v4()
			const timestamp = Date.now()

			const message: ChatMsg = {
				id: messageId,
				chatId,
				fromUser,
				text,
				created_at: timestamp,
				updated_at: timestamp,
				is_read: false,
			}

			// Сохраняем сообщение
			const messagesKey = `chat:${chatId}:messages`
			await this.redisService.setHashField(
				messagesKey,
				messageId,
				JSON.stringify(message)
			)

			// Обновляем порядок сообщений
			const orderKey = `chat:${chatId}:order`
			await this.redisService.addToSortedSet(orderKey, timestamp, messageId)

			// Обновляем метаданные чата
			chat.last_message_id = messageId
			chat.last_message_at = timestamp // Обновляем время последнего сообщения

			// Если пользователь был в списке набирающих текст, удаляем его
			if (chat.typing && chat.typing.includes(fromUser)) {
				chat.typing = chat.typing.filter(id => id !== fromUser)
			}

			await this.redisService.setKey(
				`chat:${chatId}`,
				JSON.stringify(chat),
				this.CHAT_TTL
			)

			// Продлеваем TTL для всех ключей, связанных с чатом
			await this.extendChatTTL(chatId)

			// Инвалидируем кеш превью для обоих участников
			for (const userId of chat.participants) {
				await this.invalidateChatsPreviewCache(userId)
			}

			// Находим получателя сообщения
			const recipientId = chat.participants.find(id => id !== fromUser)

			// Отправляем уведомление через Redis Pub/Sub
			if (recipientId) {
				await this.redisPubSubService.publishNewMessage({
					chatId,
					messageId,
					senderId: fromUser,
					recipientId,
					text,
					timestamp,
					media_type: undefined,
					media_url: undefined,
				})
			}

			this.logger.debug(
				`Сообщение ${messageId} успешно отправлено в чат ${chatId}`,
				this.CONTEXT
			)

			return successResponse(message, 'Сообщение отправлено')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при отправке сообщения в чат`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse('Ошибка при отправке сообщения', error)
		}
	}

	/**
	 * Пометить сообщения как прочитанные
	 */
	async readMessages(dto: ReadMessagesDto): Promise<ApiResponse<boolean>> {
		try {
			const { chatId, userId, lastReadMessageId } = dto

			this.logger.debug(
				`Пометка сообщений как прочитанных в чате ${chatId} для пользователя ${userId}`,
				this.CONTEXT,
				{ lastReadMessageId }
			)

			// Проверка чата
			const chatMetadata = await this.getChatMetadata(chatId)

			if (!chatMetadata.success || !chatMetadata.data) {
				this.logger.warn(
					`Попытка пометить сообщения в несуществующем чате ${chatId}`,
					this.CONTEXT
				)
				return errorResponse('Чат не найден')
			}

			const chat = chatMetadata.data

			if (!chat.participants.includes(userId)) {
				this.logger.warn(
					`Пользователь ${userId} не является участником чата ${chatId}`,
					this.CONTEXT
				)
				return errorResponse('Вы не являетесь участником этого чата')
			}

			const readStatusKey = `chat:${chatId}:read_status`
			const readStatusResponse = await this.getReadStatus(chatId)

			// Получаем текущий статус прочтения или создаем новый
			let readStatus: Record<string, string | null> = {}

			if (readStatusResponse.success && readStatusResponse.data) {
				readStatus = readStatusResponse.data
			} else {
				// Если статус не найден, инициализируем для всех участников чата
				for (const participant of chat.participants) {
					readStatus[participant] = null
				}
			}

			// Обновляем статус для текущего пользователя
			readStatus[userId] = lastReadMessageId

			// Сохраняем обновленный статус
			await this.redisService.setKey(
				readStatusKey,
				JSON.stringify(readStatus),
				this.CHAT_TTL
			)

			await this.extendChatTTL(chatId)
			await this.invalidateChatsPreviewCache(userId)

			const messagesKey = `chat:${chatId}:messages`
			const orderKey = `chat:${chatId}:order`

			// Получение сообщения, чтобы узнать его score (timestamp)
			const lastMessageRaw = await this.redisService.getHashField(
				messagesKey,
				lastReadMessageId
			)

			let senderId: string | null = null
			let lastMsgScore: number | null = null

			if (lastMessageRaw.success && lastMessageRaw.data) {
				try {
					const lastMsg: ChatMsg = JSON.parse(lastMessageRaw.data)
					senderId = lastMsg.fromUser
					lastMsgScore = lastMsg.created_at ?? null
				} catch (e) {
					this.logger.warn(
						`Ошибка при парсинге сообщения ${lastReadMessageId}`,
						this.CONTEXT,
						{ error: e }
					)
				}
			}

			// Обновляем is_read у всех сообщений до текущего включительно
			this.logger.debug(
				`Обновление is_read для чата ${chatId}, lastMsgScore: ${lastMsgScore}, lastReadMessageId: ${lastReadMessageId}`,
				this.CONTEXT
			)

			if (lastMsgScore !== null) {
				const messageIdsResponse =
					await this.redisService.getSortedSetRangeByScore(
						orderKey,
						0,
						lastMsgScore + 1 // +1 чтобы включить сообщение с точным timestamp
					)

				if (!messageIdsResponse.success || !messageIdsResponse.data) {
					this.logger.warn(
						`Ошибка при получении сообщений для обновления в чате ${chatId}`,
						this.CONTEXT,
						{ error: messageIdsResponse.message }
					)
				} else {
					const messageIdsToUpdate = messageIdsResponse.data

					this.logger.debug(
						`Найдено ${messageIdsToUpdate.length} сообщений для обновления в чате ${chatId}`,
						this.CONTEXT,
						{ messageIds: messageIdsToUpdate }
					)

					let updatedCount = 0
					for (const msgId of messageIdsToUpdate) {
						const msgRaw = await this.redisService.getHashField(
							messagesKey,
							msgId
						)

						if (msgRaw.success && msgRaw.data) {
							const msg: ChatMsg = JSON.parse(msgRaw.data)
							// Помечаем как прочитанные ВСЕ сообщения (включая свои)
							// так как пользователь прочитал чат до этого момента
							if (!msg.is_read) {
								msg.is_read = true
								msg.updated_at = Date.now()

								await this.redisService.setHashField(
									messagesKey,
									msgId,
									JSON.stringify(msg)
								)
								updatedCount++
							}
						}
					}
					this.logger.debug(
						`Обновлено ${updatedCount} сообщений в чате ${chatId}`,
						this.CONTEXT
					)
				}
			} else {
				this.logger.warn(
					`lastMsgScore равен null для чата ${chatId}, сообщения не обновлены`,
					this.CONTEXT,
					{ lastReadMessageId }
				)
			}

			// Уведомление отправителя
			if (senderId && senderId !== userId) {
				await this.redisPubSubService.publishMessageRead({
					chatId,
					userId: senderId,
					messageIds: [lastReadMessageId],
					timestamp: Date.now(),
				})
			}

			this.logger.debug(
				`Статус прочтения для пользователя ${userId} в чате ${chatId} обновлен`,
				this.CONTEXT
			)

			return successResponse(true, 'Статус прочтения обновлен')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при обновлении статуса прочтения`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse('Ошибка при обновлении статуса прочтения', error)
		}
	}

	/**
	 * Удаление чата с архивацией в S3
	 */
	async delete(chatId: string): Promise<ApiResponse<boolean>> {
		try {
			this.logger.debug(`Удаление чата ${chatId}`, this.CONTEXT)

			// Проверяем существование чата
			const chatMetadata = await this.getChatMetadata(chatId)

			if (!chatMetadata.success || !chatMetadata.data) {
				this.logger.warn(
					`Попытка удалить несуществующий чат ${chatId}`,
					this.CONTEXT
				)
				return errorResponse('Чат не найден')
			}

			const chat = chatMetadata.data

			// Сохраняем архив чата в облачное хранилище перед удалением
			const archiveSuccess = await this.archiveChatToStorage(chatId)
			if (!archiveSuccess) {
				this.logger.warn(
					`Не удалось архивировать чат ${chatId} перед удалением`,
					this.CONTEXT
				)
			} else {
				this.logger.debug(
					`Чат ${chatId} успешно архивирован перед удалением`,
					this.CONTEXT
				)
			}

			// Удаляем все ключи, связанные с чатом
			await Promise.all([
				this.redisService.deleteKey(`chat:${chatId}`),
				this.redisService.deleteKey(`chat:${chatId}:read_status`),
				this.redisService.deleteKey(`chat:${chatId}:messages`),
				this.redisService.deleteKey(`chat:${chatId}:order`),
			])

			// Удаляем чат из списков чатов пользователей
			const removePromises = chat.participants.map(userId =>
				this.removeChatFromUserList(userId, chatId)
			)
			await Promise.all(removePromises)

			// Инвалидируем кеш превью для всех участников
			const invalidatePromises = chat.participants.map(userId =>
				this.invalidateChatsPreviewCache(userId)
			)
			await Promise.all(invalidatePromises)

			// Удаляем лайки между участниками чата (если это был матч)
			if (chat.participants.length === 2) {
				const [user1, user2] = chat.participants
				try {
					await this.prismaService.like.deleteMany({
						where: {
							OR: [
								{
									fromUserId: user1,
									toUserId: user2,
								},
								{
									fromUserId: user2,
									toUserId: user1,
								},
							],
						},
					})
					this.logger.debug(
						`Удалены лайки между ${user1} и ${user2} при удалении чата ${chatId}`,
						this.CONTEXT
					)
				} catch (error: any) {
					this.logger.warn(
						`Ошибка при удалении лайков для чата ${chatId}`,
						this.CONTEXT,
						{ error }
					)
				}
			}

			// Отправляем уведомления об удалении чата через Redis Pub/Sub
			for (const userId of chat.participants) {
				await this.redisPubSubService.publish('chat:delete', {
					userId,
					chatId,
					timestamp: Date.now(),
				})
			}

			this.logger.debug(`Чат ${chatId} успешно удален`, this.CONTEXT)

			return successResponse(true, 'Чат удален')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при удалении чата`,
				error?.stack,
				this.CONTEXT,
				{ chatId, error }
			)
			return errorResponse('Ошибка при удалении чата', error)
		}
	}

	/**
	 * Обработка статуса набора текста
	 */
	async updateTypingStatus(
		dto: TypingStatusDto
	): Promise<ApiResponse<boolean>> {
		try {
			const { chatId, userId, isTyping } = dto

			this.logger.debug(
				`Обновление статуса набора текста в чате ${chatId} для пользователя ${userId}`,
				this.CONTEXT,
				{ isTyping }
			)

			// Проверяем существование чата
			const chatMetadata = await this.getChatMetadata(chatId)

			if (!chatMetadata.success || !chatMetadata.data) {
				this.logger.warn(
					`Попытка обновить статус набора текста в несуществующем чате ${chatId}`,
					this.CONTEXT
				)
				return errorResponse('Чат не найден')
			}

			const chat = chatMetadata.data

			// Проверяем, является ли пользователь участником чата
			if (!chat.participants.includes(userId)) {
				this.logger.warn(
					`Пользователь ${userId} не является участником чата ${chatId}`,
					this.CONTEXT
				)
				return errorResponse('Вы не являетесь участником этого чата')
			}

			// Находим получателя
			const recipientId = chat.participants.find(id => id !== userId)

			if (!recipientId) {
				this.logger.warn(
					`Не найден получатель для чата ${chatId}`,
					this.CONTEXT
				)
				return errorResponse('Получатель не найден')
			}

			// Отправляем уведомление через Redis Pub/Sub
			await this.redisPubSubService.publishTypingStatus({
				chatId,
				userId,
				isTyping,
				participants: chat.participants,
			})

			return successResponse(true, 'Статус набора текста обновлен')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при обновлении статуса набора текста`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse('Ошибка при обновлении статуса набора текста', error)
		}
	}

	/**
	 * Отправка сообщения с медиафайлом
	 */
	async sendMessageWithMedia(
		dto: SendMessageWithMediaDto
	): Promise<ApiResponse<ChatMsg>> {
		try {
			const { chatId, fromUser, text, media_type, media_url } = dto

			this.logger.debug(
				`Отправка сообщения с медиафайлом в чат ${chatId} от пользователя ${fromUser}`,
				this.CONTEXT,
				{ media_type }
			)

			// Проверяем существование чата
			const chatMetadata = await this.getChatMetadata(chatId)

			if (!chatMetadata.success || !chatMetadata.data) {
				this.logger.warn(
					`Попытка отправить сообщение с медиафайлом в несуществующий чат ${chatId}`,
					this.CONTEXT
				)
				return errorResponse('Чат не найден')
			}

			const chat = chatMetadata.data

			// Проверяем, является ли пользователь участником чата
			if (!chat.participants.includes(fromUser)) {
				this.logger.warn(
					`Пользователь ${fromUser} не является участником чата ${chatId}`,
					this.CONTEXT
				)
				return errorResponse('Вы не являетесь участником этого чата')
			}

			// Проверяем, не заблокирован ли пользователь или психолог
			const [userSender, psychologistSender] = await Promise.all([
				this.prismaService.user.findUnique({
					where: { telegramId: fromUser, status: { not: 'Blocked' } },
				}),
				this.prismaService.psychologist.findUnique({
					where: { telegramId: fromUser, status: 'Active' },
				}),
			])

			if (!userSender && !psychologistSender) {
				this.logger.warn(
					`Отправитель ${fromUser} не найден или заблокирован`,
					this.CONTEXT
				)
				return errorResponse('Отправитель не найден или заблокирован')
			}

			// Создаем новое сообщение с медиафайлом
			const messageId = v4()
			const timestamp = Date.now()

			const message: ChatMsg = {
				id: messageId,
				chatId,
				fromUser,
				text,
				created_at: timestamp,
				updated_at: timestamp,
				is_read: false,
				media_type,
				media_url,
			}

			// Сохраняем сообщение
			const messagesKey = `chat:${chatId}:messages`
			await this.redisService.setHashField(
				messagesKey,
				messageId,
				JSON.stringify(message)
			)

			// Обновляем порядок сообщений
			const orderKey = `chat:${chatId}:order`
			await this.redisService.addToSortedSet(orderKey, timestamp, messageId)

			// Обновляем метаданные чата
			chat.last_message_id = messageId
			chat.last_message_at = timestamp // Обновляем время последнего сообщения

			// Если пользователь был в списке набирающих текст, удаляем его
			if (chat.typing && chat.typing.includes(fromUser)) {
				chat.typing = chat.typing.filter(id => id !== fromUser)
			}

			await this.redisService.setKey(
				`chat:${chatId}`,
				JSON.stringify(chat),
				this.CHAT_TTL
			)

			// Продлеваем TTL для всех ключей, связанных с чатом
			await this.extendChatTTL(chatId)

			// Инвалидируем кеш превью для обоих участников
			for (const userId of chat.participants) {
				await this.invalidateChatsPreviewCache(userId)
			}

			// Находим получателя сообщения
			const recipientId = chat.participants.find(id => id !== fromUser)

			// Отправляем уведомление через Redis Pub/Sub
			if (recipientId) {
				await this.redisPubSubService.publishNewMessage({
					chatId,
					messageId,
					senderId: fromUser,
					recipientId,
					text,
					timestamp,
					media_type,
					media_url,
				})
			}

			this.logger.debug(
				`Сообщение ${messageId} с медиафайлом успешно отправлено в чат ${chatId}`,
				this.CONTEXT,
				{ media_type }
			)

			return successResponse(message, 'Сообщение с медиафайлом отправлено')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при отправке сообщения с медиафайлом`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse('Ошибка при отправке сообщения с медиафайлом', error)
		}
	}

	/**
	 * Архивация чата в S3
	 */
	private async archiveChatToStorage(chatId: string): Promise<boolean> {
		try {
			this.logger.debug(`Архивирование чата ${chatId}`, this.CONTEXT)

			// Получаем все данные чата
			const [chatMetadata, chatMessages, readStatus] = await Promise.all([
				this.getChatMetadata(chatId),
				this.getChatMessages(chatId, 10000, 0), // Получаем все сообщения
				this.getReadStatus(chatId),
			])

			if (!chatMetadata.success || !chatMetadata.data) {
				this.logger.warn(
					`Не удалось получить метаданные чата ${chatId} для архивации`,
					this.CONTEXT
				)
				return false
			}

			const chat = chatMetadata.data
			const messages = chatMessages.success ? chatMessages.data || [] : []
			const readStatusData = readStatus.success ? readStatus.data : {}

			// Формируем архив
			const archiveData = {
				metadata: chat,
				messages: messages,
				readStatus: readStatusData,
				archivedAt: new Date().toISOString(),
			}

			// Сохраняем архив в S3
			const archiveKey = `chat_archives/${chatId}_${Date.now()}.json`
			const archiveBuffer = Buffer.from(JSON.stringify(archiveData, null, 2))

			await this.storageService.uploadChatArchive(archiveKey, archiveBuffer)

			this.logger.debug(
				`Чат ${chatId} успешно архивирован в ${archiveKey}`,
				this.CONTEXT
			)
			return true
		} catch (error: any) {
			this.logger.error(
				`Ошибка при архивации чата`,
				error?.stack,
				this.CONTEXT,
				{ chatId, error }
			)
			return false
		}
	}

	/**
	 * Обновление TTL для всех ключей, связанных с чатом
	 */
	private async extendChatTTL(chatId: string): Promise<void> {
		try {
			const keys = [
				`chat:${chatId}`,
				`chat:${chatId}:read_status`,
				`chat:${chatId}:messages`,
				`chat:${chatId}:order`,
			]

			const promises = keys.map(key =>
				this.redisService.expireKey(key, this.CHAT_TTL)
			)
			await Promise.all(promises)

			this.logger.debug(
				`TTL для чата ${chatId} продлен на ${this.CHAT_TTL} секунд`,
				this.CONTEXT
			)
		} catch (error) {
			this.logger.warn(
				`Ошибка при продлении TTL для чата ${chatId}`,
				this.CONTEXT,
				{ error }
			)
		}
	}

	/**
	 * Поиск существующего чата между двумя пользователями
	 */
	private async findExistingChat(
		user1: string,
		user2: string
	): Promise<string | null> {
		try {
			const userChatsKey = `user:${user1}:chats`
			const userChatsResponse = await this.redisService.getKey(userChatsKey)

			if (!userChatsResponse.success || !userChatsResponse.data) {
				return null
			}

			const chatIds = JSON.parse(userChatsResponse.data)

			if (!Array.isArray(chatIds) || chatIds.length === 0) {
				return null
			}

			this.logger.debug(
				`Поиск существующего чата между пользователями ${user1} и ${user2}`,
				this.CONTEXT,
				{ chatCount: chatIds.length }
			)

			// Получаем метаданные всех чатов в одном пакете
			const metadataPromises = chatIds.map(chatId =>
				this.getChatMetadata(chatId)
			)
			const metadataResults = await Promise.all(metadataPromises)

			// Ищем чат с обоими пользователями
			for (const result of metadataResults) {
				if (!result.success || !result.data) continue

				const chat = result.data

				// Если оба пользователя являются участниками чата
				if (
					chat.participants.includes(user1) &&
					chat.participants.includes(user2)
				) {
					this.logger.debug(
						`Найден существующий чат ${chat.id} между пользователями ${user1} и ${user2}`,
						this.CONTEXT
					)
					return chat.id
				}
			}

			this.logger.debug(
				`Не найден существующий чат между пользователями ${user1} и ${user2}`,
				this.CONTEXT
			)
			return null
		} catch (error: any) {
			this.logger.error(
				`Ошибка при поиске существующего чата`,
				error?.stack,
				this.CONTEXT,
				{ user1, user2, error }
			)
			return null
		}
	}

	/**
	 * Добавление чата в список чатов пользователя
	 */
	private async addChatToUserList(
		userId: string,
		chatId: string
	): Promise<void> {
		try {
			const userChatsKey = `user:${userId}:chats`
			const userChatsResponse = await this.redisService.getKey(userChatsKey)

			let chatIds = []

			if (userChatsResponse.success && userChatsResponse.data) {
				try {
					chatIds = JSON.parse(userChatsResponse.data)

					if (!Array.isArray(chatIds)) {
						chatIds = []
					}
				} catch (e) {
					this.logger.warn(
						`Ошибка при парсинге списка чатов пользователя ${userId}`,
						this.CONTEXT,
						{ error: e }
					)
					chatIds = []
				}
			}

			// Добавляем чат в список, если его там еще нет
			if (!chatIds.includes(chatId)) {
				chatIds.push(chatId)
				await this.redisService.setKey(
					userChatsKey,
					JSON.stringify(chatIds),
					this.CHAT_TTL
				)

				this.logger.debug(
					`Чат ${chatId} добавлен в список чатов пользователя ${userId}`,
					this.CONTEXT
				)
			}
		} catch (error: any) {
			this.logger.error(
				`Ошибка при добавлении чата в список пользователя`,
				error?.stack,
				this.CONTEXT,
				{ userId, chatId, error }
			)
		}
	}

	/**
	 * Удаление чата из списка чатов пользователя
	 */
	private async removeChatFromUserList(
		userId: string,
		chatId: string
	): Promise<void> {
		try {
			const userChatsKey = `user:${userId}:chats`
			const userChatsResponse = await this.redisService.getKey(userChatsKey)

			if (!userChatsResponse.success || !userChatsResponse.data) {
				return
			}

			try {
				const chatIds = JSON.parse(userChatsResponse.data)

				if (!Array.isArray(chatIds)) {
					return
				}

				// Удаляем чат из списка
				const updatedChatIds = chatIds.filter(id => id !== chatId)

				if (updatedChatIds.length === 0) {
					// Если список пуст, удаляем ключ
					await this.redisService.deleteKey(userChatsKey)
					this.logger.debug(
						`Удален пустой список чатов пользователя ${userId}`,
						this.CONTEXT
					)
				} else {
					// Иначе обновляем список
					await this.redisService.setKey(
						userChatsKey,
						JSON.stringify(updatedChatIds),
						this.CHAT_TTL
					)
					this.logger.debug(
						`Чат ${chatId} удален из списка чатов пользователя ${userId}`,
						this.CONTEXT
					)
				}
			} catch (e: any) {
				this.logger.error(
					`Ошибка при парсинге списка чатов пользователя`,
					e?.stack,
					this.CONTEXT,
					{ userId, error: e }
				)
			}
		} catch (error: any) {
			this.logger.error(
				`Ошибка при удалении чата из списка пользователя`,
				error?.stack,
				this.CONTEXT,
				{ userId, chatId, error }
			)
		}
	}

	/**
	 * Инвалидация кеша превью чатов пользователя
	 */
	private async invalidateChatsPreviewCache(userId: string): Promise<void> {
		try {
			const previewCacheKey = `user:${userId}:chats_preview`
			await this.redisService.deleteKey(previewCacheKey)
			this.logger.debug(
				`Кеш превью чатов для пользователя ${userId} инвалидирован`,
				this.CONTEXT
			)
		} catch (error) {
			this.logger.warn(
				`Ошибка при инвалидации кеша превью чатов`,
				this.CONTEXT,
				{ userId, error }
			)
		}
	}

	/**
	 * Выполнение задачи очистки чатов с механизмом блокировки
	 */
	private async runChatCleanupWithLock(): Promise<void> {
		// Пытаемся получить блокировку
		const lockId = v4()
		const lockResult = await this.redisService.redis.set(
			this.lockKey,
			lockId,
			'EX',
			this.lockDuration,
			'NX'
		)

		if (!lockResult) {
			this.logger.log(
				'Задача очистки чатов уже выполняется другим процессом',
				this.CONTEXT
			)
			return
		}

		try {
			this.logger.log('Начало задачи очистки устаревших чатов', this.CONTEXT)
			await this.cleanupExpiredChats()
		} finally {
			// Освобождаем блокировку, только если она всё ещё принадлежит нам
			try {
				const script = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `
				await this.redisService.redis.eval(script, 1, this.lockKey, lockId)
				this.logger.debug('Блокировка очистки чатов освобождена', this.CONTEXT)
			} catch (error: any) {
				this.logger.error(
					'Ошибка при освобождении блокировки очистки чатов',
					error?.stack,
					this.CONTEXT,
					{ error: error }
				)
			}
		}
	}

	/**
	 * Очистка устаревших чатов
	 */
	private async cleanupExpiredChats(): Promise<void> {
		try {
			// Получаем все ключи чатов
			const chatKeys = await this.redisService.redis.keys('chat:*:*')
			const metadataKeysSet = new Set<string>()

			// Извлекаем ID чатов из ключей
			for (const key of chatKeys) {
				const parts = key.split(':')
				if (parts.length >= 3) {
					metadataKeysSet.add(`chat:${parts[1]}`)
				}
			}

			const metadataKeys = Array.from(metadataKeysSet)
			this.logger.log(
				`Найдено ${metadataKeys.length} потенциальных чатов для проверки`,
				this.CONTEXT
			)

			let archivedCount = 0
			let errorCount = 0

			for (const key of metadataKeys) {
				try {
					const chatId = key.split(':')[1]

					// Получаем метаданные чата
					const chatData = await this.redisService.getKey(key)

					if (!chatData.success || !chatData.data) {
						continue
					}

					const chat: Chat = JSON.parse(chatData.data)
					const currentTime = Date.now()

					// Если чат старше 24 часов, архивируем и удаляем его
					if (currentTime - chat.created_at > this.CHAT_TTL * 1000) {
						this.logger.debug(
							`Чат ${chatId} устарел, подготовка к архивации`,
							this.CONTEXT,
							{
								age: (currentTime - chat.created_at) / 1000,
								participants: chat.participants,
							}
						)

						// Архивируем чат перед удалением
						const archived = await this.archiveChatToStorage(chatId)

						if (archived) {
							// Удаляем чат из Redis
							await this.delete(chatId)
							archivedCount++
							this.logger.log(
								`Архивирован и удален устаревший чат: ${chatId}`,
								this.CONTEXT
							)
						}
					}
				} catch (error: any) {
					errorCount++
					this.logger.error(
						`Ошибка при проверке чата`,
						error?.stack,
						this.CONTEXT,
						{ chatKey: key, error }
					)
				}
			}

			this.logger.log(
				`Завершена очистка чатов. Архивировано: ${archivedCount}, ошибок: ${errorCount}`,
				this.CONTEXT
			)
		} catch (error: any) {
			this.logger.error(
				'Ошибка при очистке устаревших чатов',
				error?.stack,
				this.CONTEXT,
				{ error }
			)
		}
	}

	async countUnreadMessages(
		chatId: string,
		userId: string,
		lastReadMessageId: string
	): Promise<ApiResponse<number>> {
		try {
			const messagesKey = `chat:${chatId}:messages`
			const orderKey = `chat:${chatId}:order`

			// Получаем timestamp по lastReadMessageId
			const raw = await this.redisService.getHashField(
				messagesKey,
				lastReadMessageId
			)
			if (!raw.success || !raw.data) {
				return successResponse(
					0,
					'Нет данных о последнем прочитанном сообщение'
				)
			}
			const lastMsg: ChatMsg = JSON.parse(raw.data)
			const lastScore = lastMsg.created_at ?? 0

			// Получаем все messageId до этой отметки
			const ids = await this.redisService.getSortedSetRangeByScore(
				orderKey,
				0,
				lastScore
			)
			if (!Array.isArray(ids)) {
				return successResponse(0, 'Нет новых сообщений')
			}

			let count = 0
			for (const msgId of ids) {
				const mRaw = await this.redisService.getHashField(messagesKey, msgId)
				if (mRaw.success && mRaw.data) {
					const msg: ChatMsg = JSON.parse(mRaw.data)
					if (!msg.is_read && msg.fromUser !== userId) {
						count++
					}
				}
			}

			return successResponse(count, 'Количество непрочитанных сообщений')
		} catch (err: any) {
			return errorResponse('Ошибка при подсчете непрочитанных', err)
		}
	}

	async getChatsWithUnread(telegramId: string): Promise<ApiResponse<string[]>> {
		try {
			const userChatsKey = `user:${telegramId}:chats`
			const userChatsRes = await this.redisService.getKey(userChatsKey)

			if (!userChatsRes.success || !userChatsRes.data) {
				return successResponse([], 'У пользователя нет чатов')
			}

			const chatIds: string[] = JSON.parse(userChatsRes.data)
			const unreadChats: string[] = []

			for (const chatId of chatIds) {
				const readStatusRes = await this.getReadStatus(chatId)
				const readStatus = readStatusRes.success && readStatusRes.data
				const lastReadId: string | null = readStatus
					? readStatus[telegramId]
					: null

				const orderKey = `chat:${chatId}:order`
				let messagesAfterRead: string[] = []

				if (lastReadId) {
					// Получаем timestamp последнего прочитанного
					const msgRaw = await this.redisService.getHashField(
						`chat:${chatId}:messages`,
						lastReadId
					)

					if (msgRaw.success && msgRaw.data) {
						const msg: ChatMsg = JSON.parse(msgRaw.data)
						const ts = msg.created_at ?? 0

						// Все сообщения после прочитанного
						const zrangeRes = await this.redisService.getSortedSetRangeByScore(
							orderKey,
							ts + 1,
							'+inf'
						)
						if (zrangeRes.success && Array.isArray(zrangeRes.data)) {
							messagesAfterRead = zrangeRes.data
						}
					}
				} else {
					// Все сообщения — ничего не читали
					const zrangeRes = await this.redisService.getSortedSetRangeByScore(
						orderKey,
						'-inf',
						'+inf'
					)
					if (zrangeRes.success && Array.isArray(zrangeRes.data)) {
						messagesAfterRead = zrangeRes.data
					}
				}

				// Проверяем: есть ли хоть одно входящее сообщение
				for (const msgId of messagesAfterRead) {
					const msgRaw = await this.redisService.getHashField(
						`chat:${chatId}:messages`,
						msgId
					)

					if (msgRaw.success && msgRaw.data) {
						const msg: ChatMsg = JSON.parse(msgRaw.data)
						if (msg.fromUser !== telegramId) {
							unreadChats.push(chatId)
							break // достаточно одного входящего
						}
					}
				}
			}

			return successResponse(
				unreadChats,
				'Чаты с входящими непрочитанными сообщениями'
			)
		} catch (error: any) {
			return errorResponse('Ошибка при поиске непрочитанных чатов', error)
		}
	}

	/**
	 * Получение всех пользователей с непрочитанными сообщениями
	 */
	async getUsersWithUnreadMessages(): Promise<
		ApiResponse<{ telegramId: string; unreadCount: number }[]>
	> {
		try {
			// Получаем всех пользователей из базы данных
			const users = await this.prismaService.user.findMany({
				where: { status: { not: 'Blocked' } },
				select: { telegramId: true },
			})

			const usersWithUnread: { telegramId: string; unreadCount: number }[] = []

			for (const user of users) {
				try {
					// Получаем чаты с непрочитанными сообщениями для пользователя
					const unreadChatsRes = await this.getChatsWithUnread(user.telegramId)

					if (
						unreadChatsRes.success &&
						unreadChatsRes.data &&
						unreadChatsRes.data.length > 0
					) {
						// Подсчитываем общее количество непрочитанных сообщений
						let totalUnreadCount = 0

						for (const chatId of unreadChatsRes.data) {
							const readStatusRes = await this.getReadStatus(chatId)
							const readStatus = readStatusRes.success && readStatusRes.data
							const lastReadId: string | null = readStatus
								? readStatus[user.telegramId]
								: null

							if (lastReadId) {
								const msgRaw = await this.redisService.getHashField(
									`chat:${chatId}:messages`,
									lastReadId
								)

								if (msgRaw.success && msgRaw.data) {
									const msg: ChatMsg = JSON.parse(msgRaw.data)
									const ts = msg.created_at ?? 0

									const messagesAfterRead =
										await this.redisService.getSortedSetRangeByScore(
											`chat:${chatId}:order`,
											ts + 1,
											'+inf'
										)

									if (
										messagesAfterRead.success &&
										Array.isArray(messagesAfterRead.data)
									) {
										for (const msgId of messagesAfterRead.data) {
											const msgData = await this.redisService.getHashField(
												`chat:${chatId}:messages`,
												msgId
											)

											if (msgData.success && msgData.data) {
												const message: ChatMsg = JSON.parse(msgData.data)
												if (
													!message.is_read &&
													message.fromUser !== user.telegramId
												) {
													totalUnreadCount++
												}
											}
										}
									}
								}
							} else {
								// Если ничего не читали, считаем все входящие сообщения
								const allMessages =
									await this.redisService.getSortedSetRangeByScore(
										`chat:${chatId}:order`,
										'-inf',
										'+inf'
									)

								if (allMessages.success && Array.isArray(allMessages.data)) {
									for (const msgId of allMessages.data) {
										const msgData = await this.redisService.getHashField(
											`chat:${chatId}:messages`,
											msgId
										)

										if (msgData.success && msgData.data) {
											const message: ChatMsg = JSON.parse(msgData.data)
											if (message.fromUser !== user.telegramId) {
												totalUnreadCount++
											}
										}
									}
								}
							}
						}

						if (totalUnreadCount > 0) {
							usersWithUnread.push({
								telegramId: user.telegramId,
								unreadCount: totalUnreadCount,
							})
						}
					}
				} catch (error: any) {
					this.logger.warn(
						`Ошибка при проверке непрочитанных сообщений для пользователя ${user.telegramId}`,
						this.CONTEXT,
						{ telegramId: user.telegramId, error }
					)
				}
			}

			this.logger.debug(
				`Найдено ${usersWithUnread.length} пользователей с непрочитанными сообщениями`,
				this.CONTEXT
			)

			return successResponse(
				usersWithUnread,
				'Пользователи с непрочитанными сообщениями получены'
			)
		} catch (error: any) {
			this.logger.error(
				'Ошибка при получении пользователей с непрочитанными сообщениями',
				error?.stack,
				this.CONTEXT,
				{ error }
			)
			return errorResponse(
				'Ошибка при получении пользователей с непрочитанными сообщениями',
				error
			)
		}
	}

	/**
	 * Создание чата с психологом
	 */
	async createWithPsychologist(
		dto: CreateChatWithPsychologistDto
	): Promise<ApiResponse<ResCreateChat>> {
		try {
			const { telegramId, psychologistId } = dto

			this.logger.debug(
				`Создание чата между пользователем ${telegramId} и психологом ${psychologistId}`,
				this.CONTEXT
			)

			// Проверяем существование пользователя
			const sender = await this.prismaService.user.findUnique({
				where: { telegramId, status: { not: 'Blocked' } },
			})

			if (!sender) {
				this.logger.warn(
					`Пользователь ${telegramId} не найден или заблокирован`,
					this.CONTEXT
				)
				return errorResponse('Пользователь не найден или заблокирован')
			}

			// Проверяем существование психолога
			const psychologistResponse =
				await this.psychologistService.findByTelegramId(psychologistId)
			if (!psychologistResponse.success || !psychologistResponse.data) {
				this.logger.warn(
					`Психолог с telegramId ${psychologistId} не найден`,
					this.CONTEXT
				)
				return errorResponse('Психолог не найден')
			}

			const psychologist = psychologistResponse.data

			// Удаляем существующий чат с психологом (если есть)
			await this.deleteExistingPsychologistChat(telegramId)

			// Привязываем психолога к пользователю
			await this.prismaService.user.update({
				where: { telegramId },
				data: { assignedPsychologistId: psychologist.telegramId },
			})

			this.logger.debug(
				`Психолог ${psychologist.telegramId} привязан к пользователю ${telegramId}`,
				this.CONTEXT
			)

			// Проверяем, существует ли уже чат между этими пользователями
			const existingChatId = await this.findExistingChat(
				telegramId,
				psychologist.telegramId
			)

			if (existingChatId) {
				this.logger.debug(
					`Найден существующий чат ${existingChatId} между пользователем ${telegramId} и психологом ${psychologist.telegramId}`,
					this.CONTEXT
				)

				// Продлеваем TTL для существующего чата
				await this.extendChatTTL(existingChatId)

				// Инвалидируем кеш превью
				await this.invalidateChatsPreviewCache(telegramId)
				await this.invalidateChatsPreviewCache(psychologist.telegramId)

				return successResponse(
					{ chatId: existingChatId, toUser: psychologist.telegramId },
					'Чат уже существует'
				)
			}

			// Создаем новый чат
			const chatId = v4()
			const timestamp = Date.now()

			this.logger.debug(
				`Создание нового чата ${chatId} между пользователем ${telegramId} и психологом ${psychologist.telegramId}`,
				this.CONTEXT
			)

			// Метаданные чата
			const chatMetadata: Chat = {
				id: chatId,
				participants: [telegramId, psychologist.telegramId],
				created_at: timestamp,
				last_message_id: null,
				last_message_at: timestamp,
				typing: [],
			}

			// Статус прочтения
			const readStatus = {
				[telegramId]: null,
				[psychologist.telegramId]: null,
			}

			// Сохраняем данные в Redis с точным TTL
			await Promise.all([
				this.redisService.setKey(
					`chat:${chatId}`,
					JSON.stringify(chatMetadata),
					this.CHAT_TTL
				),
				this.redisService.setKey(
					`chat:${chatId}:read_status`,
					JSON.stringify(readStatus),
					this.CHAT_TTL
				),
			])

			// Добавляем чат в списки чатов пользователей
			await Promise.all([
				this.addChatToUserList(telegramId, chatId),
				this.addChatToUserList(psychologist.telegramId, chatId),
			])

			// Получаем данные для отправки в уведомлении
			const userData = await this.prismaService.user.findUnique({
				where: { telegramId },
				select: {
					name: true,
					photos: { take: 1 },
				},
			})

			// Публикуем событие создания чата для обоих участников
			for (const participant of [telegramId, psychologist.telegramId]) {
				const otherParticipant =
					participant === telegramId ? psychologist.telegramId : telegramId
				const otherUserData =
					participant === telegramId ? psychologist : userData

				// Определяем аватар в зависимости от типа данных
				let avatar = ''
				if (participant === telegramId) {
					// Для пользователя: данные психолога с .url
					const photo = otherUserData?.photos?.[0] as any
					avatar = photo?.url || ''
				} else {
					// Для психолога: данные пользователя с .key
					const photo = otherUserData?.photos?.[0] as any
					avatar = photo?.key || ''
				}

				await this.redisPubSubService.publish('chat:new', {
					userId: participant,
					chatId,
					withUser: {
						id: otherParticipant,
						name: otherUserData?.name || 'Unknown',
						avatar,
					},
					created_at: timestamp,
					timestamp,
				})
			}

			// Инвалидируем кеш превью после всех операций
			await this.invalidateChatsPreviewCache(telegramId)
			await this.invalidateChatsPreviewCache(psychologist.telegramId)

			this.logger.debug(`Чат ${chatId} успешно создан`, this.CONTEXT)

			return successResponse(
				{ chatId, toUser: psychologist.telegramId },
				'Чат успешно создан'
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при создании чата с психологом`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse('Ошибка при создании чата с психологом', error)
		}
	}

	/**
	 * Удаление существующего чата с психологом для пользователя
	 */
	private async deleteExistingPsychologistChat(
		userTelegramId: string
	): Promise<void> {
		try {
			this.logger.debug(
				`Поиск существующего чата с психологом для пользователя ${userTelegramId}`,
				this.CONTEXT
			)

			// Получаем список чатов пользователя
			const userChatsKey = `user:${userTelegramId}:chats`
			const userChatsData = await this.redisService.getKey(userChatsKey)

			if (!userChatsData.success || !userChatsData.data) {
				this.logger.debug(
					`Список чатов пользователя ${userTelegramId} не найден`,
					this.CONTEXT
				)
				return
			}

			const userChats: string[] = JSON.parse(userChatsData.data)

			// Ищем чат с психологом
			for (const chatId of userChats) {
				const chatData = await this.redisService.getKey(`chat:${chatId}`)

				if (chatData.success && chatData.data) {
					const chat: Chat = JSON.parse(chatData.data)

					// Проверяем, является ли один из участников психологом
					const hasPsychologist = chat.participants.some(participant =>
						participant.startsWith('psychologist_')
					)

					if (hasPsychologist) {
						this.logger.debug(
							`Найден существующий чат с психологом ${chatId}, удаляем`,
							this.CONTEXT
						)

						// Удаляем чат
						await this.delete(chatId)
						break // Удаляем только первый найденный чат с психологом
					}
				}
			}
		} catch (error: any) {
			this.logger.error(
				`Ошибка при удалении существующего чата с психологом`,
				error?.stack,
				this.CONTEXT,
				{ userTelegramId, error }
			)
		}
	}

	/**
	 * Удаление чата конкретным пользователем
	 */
	async deleteByUser(
		chatId: string,
		deletedByUserId: string
	): Promise<ApiResponse<boolean>> {
		try {
			this.logger.debug(
				`Удаление чата ${chatId} пользователем ${deletedByUserId}`,
				this.CONTEXT
			)

			// Проверяем существование чата
			const chatMetadata = await this.getChatMetadata(chatId)

			if (!chatMetadata.success || !chatMetadata.data) {
				this.logger.warn(
					`Попытка удалить несуществующий чат ${chatId}`,
					this.CONTEXT
				)
				return errorResponse('Чат не найден')
			}

			const chat = chatMetadata.data

			// Проверяем, является ли пользователь участником чата
			if (!chat.participants.includes(deletedByUserId)) {
				this.logger.warn(
					`Пользователь ${deletedByUserId} не является участником чата ${chatId}`,
					this.CONTEXT
				)
				return errorResponse('Вы не являетесь участником этого чата')
			}

			// Сохраняем архив чата в облачное хранилище перед удалением
			const archiveSuccess = await this.archiveChatToStorage(chatId)
			if (!archiveSuccess) {
				this.logger.warn(
					`Не удалось архивировать чат ${chatId} перед удалением`,
					this.CONTEXT
				)
			} else {
				this.logger.debug(
					`Чат ${chatId} успешно архивирован перед удалением`,
					this.CONTEXT
				)
			}

			// Удаляем все ключи, связанные с чатом
			await Promise.all([
				this.redisService.deleteKey(`chat:${chatId}`),
				this.redisService.deleteKey(`chat:${chatId}:read_status`),
				this.redisService.deleteKey(`chat:${chatId}:messages`),
				this.redisService.deleteKey(`chat:${chatId}:order`),
			])

			// Удаляем чат из списков чатов пользователей
			const removePromises = chat.participants.map(userId =>
				this.removeChatFromUserList(userId, chatId)
			)
			await Promise.all(removePromises)

			// Инвалидируем кеш превью для всех участников
			const invalidatePromises = chat.participants.map(userId =>
				this.invalidateChatsPreviewCache(userId)
			)
			await Promise.all(invalidatePromises)

			// Проверяем, является ли чат чатом с психологом
			const hasPsychologist = chat.participants.some(participant =>
				participant.startsWith('psychologist_')
			)

			// Если это чат с психологом, отвязываем психолога от пользователя
			if (hasPsychologist) {
				const userParticipant = chat.participants.find(
					participant => !participant.startsWith('psychologist_')
				)

				if (userParticipant) {
					try {
						await this.prismaService.user.update({
							where: { telegramId: userParticipant },
							data: { assignedPsychologistId: null },
						})

						this.logger.debug(
							`Психолог отвязан от пользователя ${userParticipant} при удалении чата ${chatId}`,
							this.CONTEXT
						)
					} catch (error: any) {
						this.logger.warn(
							`Ошибка при отвязке психолога от пользователя ${userParticipant}`,
							this.CONTEXT,
							{ error }
						)
					}
				}
			}

			// Удаляем лайки между участниками чата (если это был матч)
			if (chat.participants.length === 2) {
				const [user1, user2] = chat.participants
				try {
					await this.prismaService.like.deleteMany({
						where: {
							OR: [
								{
									fromUserId: user1,
									toUserId: user2,
								},
								{
									fromUserId: user2,
									toUserId: user1,
								},
							],
						},
					})
					this.logger.debug(
						`Удалены лайки между ${user1} и ${user2} при удалении чата ${chatId}`,
						this.CONTEXT
					)
				} catch (error: any) {
					this.logger.warn(
						`Ошибка при удалении лайков для чата ${chatId}`,
						this.CONTEXT,
						{ error }
					)
				}
			}

			// Отправляем уведомления об удалении чата через Redis Pub/Sub
			await this.redisPubSubService.publishChatDeleted({
				chatId,
				deletedByUserId,
				participants: chat.participants,
				timestamp: Date.now(),
			})

			this.logger.debug(
				`Чат ${chatId} успешно удален пользователем ${deletedByUserId}`,
				this.CONTEXT
			)

			return successResponse(true, 'Чат удален')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при удалении чата пользователем`,
				error?.stack,
				this.CONTEXT,
				{ chatId, deletedByUserId, error }
			)
			return errorResponse('Ошибка при удалении чата', error)
		}
	}

	/**
	 * Получение закрепленного психолога для пользователя
	 */
	async getAssignedPsychologist(
		telegramId: string
	): Promise<ApiResponse<{ psychologistId: string | null }>> {
		try {
			this.logger.debug(
				`Запрос на получение закрепленного психолога для пользователя ${telegramId}`,
				this.CONTEXT
			)

			// Проверяем существование пользователя
			const user = await this.prismaService.user.findUnique({
				where: { telegramId },
				select: { assignedPsychologistId: true },
			})

			if (!user) {
				this.logger.warn(`Пользователь ${telegramId} не найден`, this.CONTEXT)
				return errorResponse('Пользователь не найден')
			}

			return successResponse(
				{ psychologistId: user.assignedPsychologistId },
				'Закрепленный психолог получен'
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при получении закрепленного психолога`,
				error?.stack,
				this.CONTEXT,
				{ telegramId, error }
			)
			return errorResponse(
				'Ошибка при получении закрепленного психолога',
				error
			)
		}
	}
}
