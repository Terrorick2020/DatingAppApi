import {
	Injectable,
	OnModuleInit,
	OnModuleDestroy,
	Inject,
} from '@nestjs/common'
import { PrismaService } from '~/prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import { StorageService } from '../storage/storage.service'
import { AppLogger } from '../common/logger/logger.service'
import { FindDto } from './dto/find.dto'
import { CreateDto } from './dto/create.dto'
import { SendMessageDto } from './dto/send-messages.dto'
import { ReadMessagesDto } from './dto/read-messages.dto'
// import { ArkErrors } from 'arktype'
import { v4 } from 'uuid'
import {
	successResponse,
	errorResponse,
} from '@/common/helpers/api.response.helper'
import { FindAllChatsUserFields } from '~/prisma/selects/chats.selects'
import { GetKeyType } from '@/redis/redis.types'
import * as cron from 'node-cron'
import type {
	ResUpdatedChat,
	ResCreateChat,
	ResFindAllChats,
	ChatPreview,
} from './chats.types'
import type { ApiResponse } from '@/common/interfaces/api-response.interface'
import {
	type Chat,
	type UserChat,
	type ChatMsg,
} from './chats.types'
import { TypingStatusDto } from './dto/typing-status.dto'
import { SendMessageWithMediaDto } from './dto/send-message-with-media.dto'
import { firstValueFrom } from 'rxjs'
import { ClientProxy } from '@nestjs/microservices'
import { DeleteChatDto } from './dto/delete-chat.dto'
import { AddChatMicroDto } from './dto/add-chat.micro.dto'
import { UpdateChatMicroDto } from './dto/update-chat.micro.dto'
import { DeleteChatMicroDto } from './dto/delete-chat.micro.dto'
import { ConnectionDto } from '../common/abstract/micro/dto/connection.dto'
import { ConnectionStatus } from '../common/abstract/micro/micro.type'

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
		@Inject('CHATS_SERVICE') private readonly wsClient: ClientProxy
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
		limit = 50,
		offset = 0
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
			return successResponse<ChatMsg[]>(messages, 'Сообщения чата получены')
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

			// Пробуем получить кешированные превью
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
					// В случае ошибки парсинга продолжаем и загружаем превью заново
					this.logger.warn(
						`Ошибка при парсинге кеша превью для пользователя ${telegramId}`,
						this.CONTEXT,
						{ error: e }
					)
				}
			}

			// Получаем список ID чатов пользователя
			const userChatsResponse = await this.redisService.getKey(userChatsKey)

			if (!userChatsResponse.success || !userChatsResponse.data) {
				this.logger.debug(
					`У пользователя ${telegramId} нет чатов`,
					this.CONTEXT
				)
				return successResponse([], 'У пользователя нет чатов')
			}

			const chatIds = JSON.parse(userChatsResponse.data)

			if (!Array.isArray(chatIds) || chatIds.length === 0) {
				this.logger.debug(
					`У пользователя ${telegramId} пустой список чатов`,
					this.CONTEXT
				)
				return successResponse([], 'У пользователя нет чатов')
			}

			// Проверяем существование пользователя перед загрузкой чатов
			const user = await this.prismaService.user.findUnique({
				where: {
					telegramId,
					status: {
						not: 'Blocked',
					},
				},
			})

			if (!user) {
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

			// Получаем превью для каждого чата (пакетный запрос для оптимизации)
			const metadataPromises = chatIds.map(chatId =>
				this.getChatMetadata(chatId)
			)
			const metadataResults = await Promise.all(metadataPromises)

			// Фильтруем только успешные результаты
			const validChats = metadataResults
				.filter(result => result.success && result.data)
				.map(result => result.data as Chat)

			this.logger.debug(
				`Получено ${validChats.length} валидных чатов из ${chatIds.length}`,
				this.CONTEXT
			)

			// Получаем все ID собеседников
			const interlocutorIds = validChats
				.map(chat => chat.participants.find(id => id !== telegramId))
				.filter(Boolean) as string[]

			// Получаем данные всех собеседников одним запросом
			const users = await this.prismaService.user.findMany({
				where: {
					telegramId: {
						in: interlocutorIds,
					},
					status: {
						not: 'Blocked',
					},
				},
				select: FindAllChatsUserFields,
			})

			this.logger.debug(
				`Получены данные ${users.length} собеседников`,
				this.CONTEXT
			)

			// Создаем словарь пользователей для быстрого доступа
			const usersMap = new Map(users.map(user => [user.telegramId, user]))

			// Получаем все статусы прочтения одним запросом
			const readStatusPromises = validChats.map(chat =>
				this.getReadStatus(chat.id)
			)
			const readStatusResults = await Promise.all(readStatusPromises)

			// Создаем словарь статусов прочтения
			const readStatusMap = new Map(
				readStatusResults
					.filter(result => result.success && result.data)
					.map((result, index) => [validChats[index].id, result.data])
			)

			// Получаем последние сообщения (можно оптимизировать пакетным запросом)
			const chatPreviews: ChatPreview[] = []

			for (const chat of validChats) {
				// Находим другого участника
				const interlocutorId = chat.participants.find(id => id !== telegramId)
				if (!interlocutorId) {
					this.logger.debug(
						`Не найден собеседник в чате ${chat.id}`,
						this.CONTEXT
					)
					continue
				}

				// Получаем данные собеседника из кеша
				const user = usersMap.get(interlocutorId)
				if (!user) {
					this.logger.debug(
						`Не найдены данные пользователя ${interlocutorId} для чата ${chat.id}`,
						this.CONTEXT
					)
					continue
				}

				// Получаем статус прочтения из кеша
				const readStatus = readStatusMap.get(chat.id)
				const lastReadMessageId = readStatus?.[telegramId] || null

				// Получаем последнее сообщение
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
						} catch (e) {
							this.logger.debug(
								`Ошибка при парсинге последнего сообщения в чате ${chat.id}`,
								this.CONTEXT,
								{ error: e }
							)
						}
					}

					// Считаем непрочитанные сообщения
					if (lastReadMessageId && lastReadMessageId !== chat.last_message_id) {
						const orderKey = `chat:${chat.id}:order`
						const unreadMessagesResponse =
							await this.redisService.countMessagesAfter(
								orderKey,
								lastReadMessageId
							)

						if (unreadMessagesResponse.success && unreadMessagesResponse.data) {
							unreadCount = unreadMessagesResponse.data
						}
					}
				}

				// Формируем превью чата
				chatPreviews.push({
					chatId: chat.id,
					toUser: {
						id: user.telegramId,
						avatar: user.photos[0]?.key || '',
						name: user.name,
					},
					lastMsg: lastMessage?.text || '',
					created_at: chat.created_at,
					unread_count: unreadCount,
				})
			}

			// Сортируем по дате последнего сообщения (по убыванию)
			chatPreviews.sort((a, b) => b.created_at - a.created_at)

			this.logger.debug(
				`Сформировано ${chatPreviews.length} превью чатов для пользователя ${telegramId}`,
				this.CONTEXT
			)

			// Кешируем результат на 15 минут
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

			// Проверяем, не заблокирован ли пользователь
			const sender = await this.prismaService.user.findUnique({
				where: { telegramId: fromUser, status: { not: 'Blocked' } },
			})

			if (!sender) {
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

			// Проверяем существование чата
			const chatMetadata = await this.getChatMetadata(chatId)

			if (!chatMetadata.success || !chatMetadata.data) {
				this.logger.warn(
					`Попытка пометить сообщения в несуществующем чате ${chatId}`,
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

			// Обновляем статус прочтения
			const readStatusKey = `chat:${chatId}:read_status`
			const readStatusResponse = await this.getReadStatus(chatId)

			if (!readStatusResponse.success || !readStatusResponse.data) {
				this.logger.debug(
					`Создаем новый статус прочтения для чата ${chatId}`,
					this.CONTEXT
				)
				// Если статус прочтения не найден, создаем новый
				const newReadStatus = {
					[userId]: lastReadMessageId,
				}

				await this.redisService.setKey(
					readStatusKey,
					JSON.stringify(newReadStatus),
					this.CHAT_TTL
				)
			} else {
				// Обновляем существующий статус прочтения
				const readStatus = readStatusResponse.data
				readStatus[userId] = lastReadMessageId

				await this.redisService.setKey(
					readStatusKey,
					JSON.stringify(readStatus),
					this.CHAT_TTL
				)
			}

			// Продлеваем TTL для всех ключей, связанных с чатом
			await this.extendChatTTL(chatId)

			// Инвалидируем кеш превью для пользователя
			await this.invalidateChatsPreviewCache(userId)

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

	/**
	 * Обновление статуса набора текста
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

			// Инициализируем массив набирающих текст, если его нет
			if (!chat.typing) {
				chat.typing = []
			}

			if (isTyping) {
				// Добавляем пользователя в список набирающих текст
				if (!chat.typing.includes(userId)) {
					chat.typing.push(userId)
					this.logger.debug(
						`Пользователь ${userId} добавлен в список набирающих текст в чате ${chatId}`,
						this.CONTEXT
					)
				}
			} else {
				// Удаляем пользователя из списка набирающих текст
				chat.typing = chat.typing.filter(id => id !== userId)
				this.logger.debug(
					`Пользователь ${userId} удален из списка набирающих текст в чате ${chatId}`,
					this.CONTEXT
				)
			}

			// Обновляем метаданные чата
			await this.redisService.setKey(
				`chat:${chatId}`,
				JSON.stringify(chat),
				this.CHAT_TTL
			)

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
	 * Получение статуса набора текста
	 */
	async getTypingStatus(
		chatId: string,
		userId: string
	): Promise<ApiResponse<string[]>> {
		try {
			this.logger.debug(
				`Получение статуса набора текста для чата ${chatId} пользователем ${userId}`,
				this.CONTEXT
			)

			// Проверяем существование чата
			const chatMetadata = await this.getChatMetadata(chatId)

			if (!chatMetadata.success || !chatMetadata.data) {
				this.logger.warn(
					`Попытка получить статус набора текста в несуществующем чате ${chatId}`,
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

			// Возвращаем список пользователей, набирающих текст, кроме запрашивающего
			const typingUsers = chat.typing?.filter(id => id !== userId) || []

			this.logger.debug(
				`В чате ${chatId} набирают текст ${typingUsers.length} пользователей`,
				this.CONTEXT,
				{ typingUsers }
			)

			return successResponse(typingUsers, 'Статус набора текста получен')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при получении статуса набора текста`,
				error?.stack,
				this.CONTEXT,
				{ chatId, userId, error }
			)
			return errorResponse('Ошибка при получении статуса набора текста', error)
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

			// Проверяем, не заблокирован ли пользователь
			const sender = await this.prismaService.user.findUnique({
				where: { telegramId: fromUser, status: { not: 'Blocked' } },
			})

			if (!sender) {
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
	 * Загрузка медиафайла для сообщения
	 */
	async uploadMediaFile(
		file: Express.Multer.File,
		chatId: string,
		fromUser: string
	): Promise<ApiResponse<{ media_url: string; media_type: string }>> {
		try {
			this.logger.debug(
				`Загрузка медиафайла для чата ${chatId} от пользователя ${fromUser}`,
				this.CONTEXT,
				{
					filename: file?.originalname,
					filesize: file?.size,
					mimetype: file?.mimetype,
				}
			)

			// Проверяем существование чата
			const chatMetadata = await this.getChatMetadata(chatId)

			if (!chatMetadata.success || !chatMetadata.data) {
				this.logger.warn(
					`Попытка загрузить медиафайл в несуществующий чат ${chatId}`,
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

			// Проверяем, не заблокирован ли пользователь
			const sender = await this.prismaService.user.findUnique({
				where: { telegramId: fromUser, status: { not: 'Blocked' } },
			})

			if (!sender) {
				this.logger.warn(
					`Отправитель ${fromUser} не найден или заблокирован`,
					this.CONTEXT
				)
				return errorResponse('Отправитель не найден или заблокирован')
			}

			// Загружаем файл в хранилище
			const mediaType = file.mimetype
			const key = await this.storageService.uploadChatMedia(file)

			// Продлеваем TTL для всех ключей, связанных с чатом
			await this.extendChatTTL(chatId)

			this.logger.debug(
				`Медиафайл успешно загружен для чата ${chatId}`,
				this.CONTEXT,
				{ key, mediaType }
			)

			return successResponse(
				{
					media_url: key,
					media_type: mediaType,
				},
				'Медиафайл успешно загружен'
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при загрузке медиафайла для чата`,
				error?.stack,
				this.CONTEXT,
				{ chatId, fromUser, error }
			)
			return errorResponse('Ошибка при загрузке медиафайла', error)
		}
	}

	/**
	 * Получение списка архивов чатов пользователя
	 */
	async getChatArchives(
		telegramId: string
	): Promise<ApiResponse<{ key: string; date: string }[]>> {
		try {
			this.logger.debug(
				`Получение списка архивов чатов для пользователя ${telegramId}`,
				this.CONTEXT
			)

			// Проверяем, существует ли пользователь
			const user = await this.prismaService.user.findUnique({
				where: { telegramId, status: { not: 'Blocked' } },
			})

			if (!user) {
				this.logger.warn(
					`Пользователь ${telegramId} не найден или заблокирован`,
					this.CONTEXT
				)
				return errorResponse('Пользователь не найден или заблокирован')
			}

			// Получаем список архивов из S3
			const archiveKeys = await this.storageService.listChatArchives(telegramId)

			this.logger.debug(
				`Получено ${archiveKeys.length} архивов чатов для пользователя ${telegramId}`,
				this.CONTEXT
			)

			// Форматируем результат
			const archives = archiveKeys.map(key => {
				const dateMatch = key.match(/_(\d+)\.json$/)
				const timestamp = dateMatch ? parseInt(dateMatch[1]) : 0
				const date = new Date(timestamp).toISOString()

				return { key, date }
			})

			return successResponse(archives, 'Список архивов чатов получен')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при получении архивов чатов`,
				error?.stack,
				this.CONTEXT,
				{ telegramId, error }
			)
			return errorResponse('Ошибка при получении архивов чатов', error)
		}
	}

	/**
	 * === WebSocket методы ===
	 */

	/**
	 * Обработка подключения к комнате для WebSocket
	 */
	async joinRoom(connectionDto: ConnectionDto) {
		try {
			this.logger.debug(
				`WS: Пользователь ${connectionDto.telegramId} присоединяется к комнате ${connectionDto.roomName}`,
				this.CONTEXT
			)

			// Обновляем статус пользователя в Redis
			await this.redisService.setKey(
				`user:${connectionDto.telegramId}:status`,
				'online',
				3600
			)
			await this.redisService.setKey(
				`user:${connectionDto.telegramId}:room`,
				connectionDto.roomName,
				3600
			)

			return {
				roomName: connectionDto.roomName,
				telegramId: connectionDto.telegramId,
				status: ConnectionStatus.Success,
			}
		} catch (error: any) {
			this.logger.error(
				`Ошибка при подключении к комнате`,
				error?.stack,
				this.CONTEXT,
				{ error, connectionDto }
			)
			return {
				message: 'Ошибка при подключении к комнате',
				status: ConnectionStatus.Error,
			}
		}
	}

	/**
	 * Обработка отключения от комнаты для WebSocket
	 */
	async leaveRoom(connectionDto: ConnectionDto) {
		try {
			this.logger.debug(
				`WS: Пользователь ${connectionDto.telegramId} покидает комнату ${connectionDto.roomName}`,
				this.CONTEXT
			)

			// Обновляем статус пользователя в Redis
			await this.redisService.setKey(
				`user:${connectionDto.telegramId}:status`,
				'offline',
				3600
			)
			await this.redisService.deleteKey(`user:${connectionDto.telegramId}:room`)

			return {
				roomName: connectionDto.roomName,
				telegramId: connectionDto.telegramId,
				status: ConnectionStatus.Success,
			}
		} catch (error: any) {
			this.logger.error(
				`Ошибка при отключении от комнаты`,
				error?.stack,
				this.CONTEXT,
				{ error, connectionDto }
			)
			return {
				message: 'Ошибка при отключении от комнаты',
				status: ConnectionStatus.Error,
			}
		}
	}

	/**
	 * Обработка обновления чата для WebSocket
	 */
	async updateChat(updateDto: UpdateChatMicroDto) {
		try {
			this.logger.debug(`WS: Обновление чата ${updateDto.chatId}`, this.CONTEXT)

			// Получаем метаданные чата
			const chatMetadataResponse = await this.getChatMetadata(updateDto.chatId)

			if (!chatMetadataResponse.success || !chatMetadataResponse.data) {
				return {
					message: 'Чат не найден',
					status: ConnectionStatus.Error,
				}
			}

			const chat = chatMetadataResponse.data

			// Обновляем данные чата
			let updated = false

			if (updateDto.newLastMsgId) {
				chat.last_message_id = updateDto.newLastMsgId
				updated = true
			}

			if (updated) {
				// Сохраняем обновленные метаданные
				await this.redisService.setKey(
					`chat:${updateDto.chatId}`,
					JSON.stringify(chat),
					this.CHAT_TTL
				)

				// Продлеваем TTL для всех ключей чата
				await this.extendChatTTL(updateDto.chatId)

				// Инвалидируем кеш превью для всех участников
				for (const userId of chat.participants) {
					await this.invalidateChatsPreviewCache(userId)
				}
			}

			return updateDto
		} catch (error: any) {
			this.logger.error(
				`Ошибка при обновлении чата через WebSocket`,
				error?.stack,
				this.CONTEXT,
				{ error, updateDto }
			)
			return {
				message: 'Ошибка при обновлении чата',
				status: ConnectionStatus.Error,
			}
		}
	}

	/**
	 * Обработка добавления чата для WebSocket
	 */
	async addChat(addChatDto: AddChatMicroDto) {
		try {
			this.logger.debug(
				`WS: Добавление чата ${addChatDto.chatId}`,
				this.CONTEXT
			)

			// Проверяем существование чата
			const chatExists = await this.getChatMetadata(addChatDto.chatId)

			if (chatExists.success && chatExists.data) {
				this.logger.debug(
					`Чат ${addChatDto.chatId} уже существует`,
					this.CONTEXT
				)

				// Продлеваем TTL для существующего чата
				await this.extendChatTTL(addChatDto.chatId)

				return addChatDto
			}

			// Создаем новый чат
			const timestamp = addChatDto.created_at || Date.now()

			// Метаданные чата
			const chatMetadata: Chat = {
				id: addChatDto.chatId,
				participants: [addChatDto.telegramId, addChatDto.toUser.id],
				created_at: timestamp,
				last_message_id: null,
				typing: [],
			}

			// Статус прочтения
			const readStatus = {
				[addChatDto.telegramId]: null,
				[addChatDto.toUser.id]: null,
			}

			// Сохраняем данные в Redis
			await Promise.all([
				this.redisService.setKey(
					`chat:${addChatDto.chatId}`,
					JSON.stringify(chatMetadata),
					this.CHAT_TTL
				),
				this.redisService.setKey(
					`chat:${addChatDto.chatId}:read_status`,
					JSON.stringify(readStatus),
					this.CHAT_TTL
				),
			])

			// Добавляем чат в списки пользователей
			await Promise.all([
				this.addChatToUserList(addChatDto.telegramId, addChatDto.chatId),
				this.addChatToUserList(addChatDto.toUser.id, addChatDto.chatId),
			])

			// Инвалидируем кеш превью
			await Promise.all([
				this.invalidateChatsPreviewCache(addChatDto.telegramId),
				this.invalidateChatsPreviewCache(addChatDto.toUser.id),
			])

			this.logger.debug(
				`Чат ${addChatDto.chatId} успешно добавлен`,
				this.CONTEXT
			)

			return addChatDto
		} catch (error: any) {
			this.logger.error(
				`Ошибка при добавлении чата через WebSocket`,
				error?.stack,
				this.CONTEXT,
				{ error, addChatDto }
			)
			return {
				message: 'Ошибка при добавлении чата',
				status: ConnectionStatus.Error,
			}
		}
	}

	/**
	 * Обработка удаления чата для WebSocket
	 */
	async deleteChat(deleteChatDto: DeleteChatMicroDto) {
		try {
			this.logger.debug(
				`WS: Удаление чата ${deleteChatDto.chatId}`,
				this.CONTEXT
			)

			// Удаляем чат через существующий метод
			const result = await this.delete(deleteChatDto.chatId)

			if (result.success) {
				return deleteChatDto
			} else {
				return {
					message: result.message || 'Ошибка при удалении чата',
					status: ConnectionStatus.Error,
				}
			}
		} catch (error: any) {
			this.logger.error(
				`Ошибка при удалении чата через WebSocket`,
				error?.stack,
				this.CONTEXT,
				{ error, deleteChatDto }
			)
			return {
				message: 'Ошибка при удалении чата',
				status: ConnectionStatus.Error,
			}
		}
	}

	/**
	 * Получение чатов пользователя для WebSocket
	 */
	async getUserChats(userId: string) {
		try {
			this.logger.debug(
				`WS: Получение чатов пользователя ${userId}`,
				this.CONTEXT
			)

			// Используем существующий метод для получения чатов
			const findResult = await this.findAll({ telegramId: userId })

			return findResult.success ? findResult.data : []
		} catch (error: any) {
			this.logger.error(
				`Ошибка при получении чатов пользователя через WebSocket`,
				error?.stack,
				this.CONTEXT,
				{ error, userId }
			)
			return []
		}
	}

	/**
	 * Получение деталей чата для WebSocket
	 */
	async getChatDetailsWs(chatId: string) {
		try {
			this.logger.debug(`WS: Получение деталей чата ${chatId}`, this.CONTEXT)

			// Получаем метаданные чата
			const chatMetadataResponse = await this.getChatMetadata(chatId)

			if (!chatMetadataResponse.success || !chatMetadataResponse.data) {
				return null
			}

			const chat = chatMetadataResponse.data

			// Получаем статус прочтения
			const readStatusResponse = await this.getReadStatus(chatId)
			const readStatus = readStatusResponse.success
				? readStatusResponse.data
				: {}

			// Получаем последнее сообщение
			let lastMessage = null
			if (chat.last_message_id) {
				const messagesKey = `chat:${chatId}:messages`
				const lastMessageResponse = await this.redisService.getHashField(
					messagesKey,
					chat.last_message_id
				)

				if (lastMessageResponse.success && lastMessageResponse.data) {
					try {
						lastMessage = JSON.parse(lastMessageResponse.data)
					} catch (e) {
						this.logger.debug(
							`Ошибка при парсинге последнего сообщения чата ${chatId}`,
							this.CONTEXT
						)
					}
				}
			}

			return {
				id: chatId,
				metadata: chat,
				readStatus,
				lastMessage,
			}
		} catch (error: any) {
			this.logger.error(
				`Ошибка при получении деталей чата через WebSocket`,
				error?.stack,
				this.CONTEXT,
				{ error, chatId }
			)
			return null
		}
	}

	/**
	 * Обработка нового сообщения для оповещения через WebSocket
	 */
	async handleNewMessage(data: any) {
		try {
			this.logger.debug(
				`WS: Обработка нового сообщения в чате ${data.chatId}`,
				this.CONTEXT
			)

			const { chatId, messageId, senderId, text } = data

			// Получаем метаданные чата
			const chatMetadataResponse = await this.getChatMetadata(chatId)

			if (!chatMetadataResponse.success || !chatMetadataResponse.data) {
				return false
			}

			const chat = chatMetadataResponse.data

			// Отправляем уведомления всем участникам чата через WebSocket
			for (const userId of chat.participants) {
				if (userId !== senderId) {
					// Получаем комнату пользователя
					const roomResponse = await this.redisService.getKey(
						`user:${userId}:room`
					)

					if (roomResponse.success && roomResponse.data) {
						const room = roomResponse.data

						// Отправляем событие обновления чата
						this.wsClient.emit('UpdatedChat', {
							roomName: room,
							telegramId: userId,
							chatId,
							newLastMsgId: messageId,
						})
					}
				}
			}

			return true
		} catch (error: any) {
			this.logger.error(
				`Ошибка при обработке нового сообщения для WebSocket`,
				error?.stack,
				this.CONTEXT,
				{ error, data }
			)
			return false
		}
	}

	/**
	 * Обработка прочтения сообщений для оповещения через WebSocket
	 */
	async handleMessageRead(data: any) {
		try {
			this.logger.debug(
				`WS: Обработка прочтения сообщений в чате ${data.chatId}`,
				this.CONTEXT
			)

			const { chatId, userId } = data

			// Получаем метаданные чата
			const chatMetadataResponse = await this.getChatMetadata(chatId)

			if (!chatMetadataResponse.success || !chatMetadataResponse.data) {
				return false
			}

			const chat = chatMetadataResponse.data

			// Отправляем уведомление другому участнику чата через WebSocket
			for (const participantId of chat.participants) {
				if (participantId !== userId) {
					// Получаем комнату другого участника
					const roomResponse = await this.redisService.getKey(
						`user:${participantId}:room`
					)

					if (roomResponse.success && roomResponse.data) {
						const room = roomResponse.data

						// Отправляем событие обновления статуса прочтения
						this.wsClient.emit('messageReadUpdate', {
							roomName: room,
							telegramId: participantId,
							chatId,
							readerUserId: userId,
						})
					}
				}
			}

			return true
		} catch (error: any) {
			this.logger.error(
				`Ошибка при обработке прочтения сообщений для WebSocket`,
				error?.stack,
				this.CONTEXT,
				{ error, data }
			)
			return false
		}
	}
}
