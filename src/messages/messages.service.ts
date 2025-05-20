import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { PrismaService } from '~/prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import { StorageService } from '../storage/storage.service'
import { AppLogger } from '../common/logger/logger.service'
import { FindDto } from './dto/find.dto'
import { CreateDto } from './dto/create.dto'
import { UpdateDto } from './dto/update.dto'
import { RedisPubSubService } from '../common/redis-pub-sub/redis-pub-sub.service'
import { v4 } from 'uuid'
import {
	successResponse,
	errorResponse,
} from '@/common/helpers/api.response.helper'
import * as cron from 'node-cron'
import { EReadIt, ELineStat } from './messages.type'
import { ReadMessagesDto } from '../chats/dto/read-messages.dto'
import { ConnectionDto } from '../common/abstract/micro/dto/connection.dto'
import { ConnectionStatus } from '../common/abstract/micro/micro.type'

@Injectable()
export class MessegesService implements OnModuleInit, OnModuleDestroy {
	private readonly MESSAGE_TTL = 86400 // 24 часа в секундах
	private readonly CACHE_TTL = 900 // 15 минут в секундах для кэширования сообщений
	private cleanupTask: cron.ScheduledTask | null = null
	private readonly lockKey = 'message_cleanup_lock'
	private readonly lockDuration = 600 // 10 минут блокировки для очистки
	private readonly CONTEXT = 'MessagesService'

	constructor(
		private readonly prisma: PrismaService,
		private readonly redisService: RedisService,
		private readonly storageService: StorageService,
		private readonly logger: AppLogger,
		private readonly redisPubSub: RedisPubSubService
	) {}

	/**
	 * Инициализация сервиса сообщений
	 */
	async onModuleInit() {
		// Запускаем задачу очистки каждые 6 часов, но с проверкой блокировки
		this.cleanupTask = cron.schedule('0 */6 * * *', async () => {
			try {
				await this.runMessagesCleanupWithLock()
			} catch (error: any) {
				this.logger.error(
					'Ошибка при очистке устаревших сообщений',
					error?.stack,
					this.CONTEXT,
					{ error }
				)
			}
		})
		this.logger.log('Задача очистки сообщений инициализирована', this.CONTEXT)
	}

	/**
	 * Корректное завершение работы сервиса
	 */
	onModuleDestroy() {
		if (this.cleanupTask) {
			this.cleanupTask.stop()
			this.logger.log('Задача очистки сообщений остановлена', this.CONTEXT)
		}
	}

	/**
	 * Поиск всех сообщений в чате
	 */
	async findAll(findDto: FindDto): Promise<any> {
		try {
			const { chatId, limit = 50, offset = 0 } = findDto

			this.logger.debug(`Получение сообщений для чата ${chatId}`, this.CONTEXT)

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
					this.CONTEXT
				)
				return successResponse([], 'Сообщения не найдены')
			}

			const messageIds = messageIdsResponse.data

			// Если сообщений нет, возвращаем пустой массив
			if (messageIds.length === 0) {
				this.logger.debug(`В чате ${chatId} нет сообщений`, this.CONTEXT)
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
			const messages = messagesResponse.data
				.map(msgStr => {
					try {
						if (msgStr === null) return null
						const msg = JSON.parse(msgStr)
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
				.filter(Boolean)

			this.logger.debug(
				`Получено ${messages.length} сообщений для чата ${chatId}`,
				this.CONTEXT
			)

			// Обновляем TTL для ключей сообщений
			await this.extendMessagesTTL(chatId)

			return successResponse(messages, 'Сообщения чата получены')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при получении списка сообщений`,
				error?.stack,
				this.CONTEXT,
				{ findDto, error }
			)
			return errorResponse('Ошибка при получении списка сообщений', error)
		}
	}

	/**
	 * Создание нового сообщения
	 */
	async create(createDto: CreateDto): Promise<any> {
		try {
			const { chatId, toUser, msg } = createDto
			const fromUser = createDto.telegramId

			this.logger.debug(
				`Отправка сообщения в чат ${chatId} от пользователя ${fromUser}`,
				this.CONTEXT
			)

			// Проверяем существование чата
			const chatKey = `chat:${chatId}`
			const chatDataResponse = await this.redisService.getKey(chatKey)

			if (!chatDataResponse.success || !chatDataResponse.data) {
				this.logger.warn(
					`Попытка отправить сообщение в несуществующий чат ${chatId}`,
					this.CONTEXT
				)
				return errorResponse('Чат не найден')
			}

			const chat = JSON.parse(chatDataResponse.data)

			// Проверяем, является ли пользователь участником чата
			if (!chat.participants.includes(fromUser)) {
				this.logger.warn(
					`Пользователь ${fromUser} не является участником чата ${chatId}`,
					this.CONTEXT
				)
				return errorResponse('Вы не являетесь участником этого чата')
			}

			// Проверяем, не заблокирован ли пользователь
			const sender = await this.prisma.user.findUnique({
				where: { telegramId: fromUser, status: { not: 'Blocked' } },
				select: { telegramId: true },
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

			const message = {
				id: messageId,
				chatId,
				fromUser,
				toUser,
				text: msg,
				created_at: timestamp,
				updated_at: timestamp,
				readStat: EReadIt.Unreaded,
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

			// Обновляем метаданные чата с последним сообщением
			chat.last_message_id = messageId
			await this.redisService.setKey(
				chatKey,
				JSON.stringify(chat),
				this.MESSAGE_TTL
			)

			// Продлеваем TTL для всех ключей, связанных с сообщениями чата
			await this.extendMessagesTTL(chatId)

			// Отправляем уведомление через Redis Pub/Sub для WebSocket сервера
			await this.redisPubSub.publishNewMessage({
				chatId,
				messageId,
				senderId: fromUser,
				recipientId: toUser,
				text: msg,
				timestamp,
			})

			this.logger.debug(
				`Сообщение ${messageId} успешно отправлено в чат ${chatId}`,
				this.CONTEXT
			)

			return successResponse(message, 'Сообщение отправлено')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при создании сообщения`,
				error?.stack,
				this.CONTEXT,
				{ createDto, error }
			)
			return errorResponse('Ошибка при создании сообщения', error)
		}
	}

	/**
	 * Обновление сообщения
	 */
	async update(msgId: string, updateDto: UpdateDto): Promise<any> {
		try {
			const { chatId } = updateDto

			this.logger.debug(
				`Обновление сообщения ${msgId} в чате ${chatId}`,
				this.CONTEXT
			)

			// Получаем сообщение
			const messagesKey = `chat:${chatId}:messages`
			const messageResponse = await this.redisService.getHashField(
				messagesKey,
				msgId
			)

			if (!messageResponse.success || !messageResponse.data) {
				this.logger.warn(
					`Сообщение ${msgId} не найдено в чате ${chatId}`,
					this.CONTEXT
				)
				return errorResponse('Сообщение не найдено')
			}

			const message = JSON.parse(messageResponse.data)
			const timestamp = Date.now()

			// Обновляем поля сообщения
			if (updateDto.msg !== undefined) {
				message.text = updateDto.msg
				message.updated_at = timestamp
			}

			if (updateDto.isChecked !== undefined) {
				message.readStat = updateDto.isChecked
					? EReadIt.Readed
					: EReadIt.Unreaded
			}

			// Сохраняем обновленное сообщение
			await this.redisService.setHashField(
				messagesKey,
				msgId,
				JSON.stringify(message)
			)

			// Продлеваем TTL для всех ключей
			await this.extendMessagesTTL(chatId)

			// Отправляем уведомление через Redis Pub/Sub для WebSocket сервера
			await this.redisPubSub.publish('chat:updateMsg', {
				chatId,
				msgId,
				fromUser: message.fromUser,
				toUser: message.toUser,
				newMsgData: {
					msg: updateDto.msg,
					isDeleted: false,
					time: timestamp,
				},
				isReaded: updateDto.isChecked,
			})

			this.logger.debug(
				`Сообщение ${msgId} успешно обновлено в чате ${chatId}`,
				this.CONTEXT
			)

			return successResponse(message, 'Сообщение обновлено')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при обновлении сообщения`,
				error?.stack,
				this.CONTEXT,
				{ msgId, updateDto, error }
			)
			return errorResponse('Ошибка при обновлении сообщения', error)
		}
	}

	/**
	 * Удаление сообщения
	 */
	async delete(msgId: string, chatId: string): Promise<any> {
		try {
			this.logger.debug(
				`Удаление сообщения ${msgId} из чата ${chatId}`,
				this.CONTEXT
			)

			// Получаем сообщение
			const messagesKey = `chat:${chatId}:messages`
			const messageResponse = await this.redisService.getHashField(
				messagesKey,
				msgId
			)

			if (!messageResponse.success || !messageResponse.data) {
				this.logger.warn(
					`Сообщение ${msgId} не найдено в чате ${chatId}`,
					this.CONTEXT
				)
				return errorResponse('Сообщение не найдено')
			}

			const message = JSON.parse(messageResponse.data)

			// Удаляем сообщение из хеша (помечаем как удаленное)
			await this.redisService.setHashField(
				messagesKey,
				msgId,
				JSON.stringify({
					...message,
					isDeleted: true,
					text: '[Сообщение удалено]',
					updated_at: Date.now(),
				})
			)

			// Отправляем уведомление через Redis Pub/Sub для WebSocket сервера
			await this.redisPubSub.publish('chat:updateMsg', {
				chatId,
				msgId,
				fromUser: message.fromUser,
				toUser: message.toUser,
				newMsgData: {
					isDeleted: true,
					time: Date.now(),
				},
			})

			this.logger.debug(
				`Сообщение ${msgId} успешно помечено как удаленное в чате ${chatId}`,
				this.CONTEXT
			)

			return successResponse(null, 'Сообщение удалено')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при удалении сообщения`,
				error?.stack,
				this.CONTEXT,
				{ msgId, chatId, error }
			)
			return errorResponse('Ошибка при удалении сообщения', error)
		}
	}

	/**
	 * Отметка сообщений как прочитанные
	 */
	async readMessages(dto: ReadMessagesDto): Promise<any> {
		try {
			const { chatId, userId, lastReadMessageId } = dto

			this.logger.debug(
				`Отметка о прочтении сообщений в чате ${chatId} пользователем ${userId}`,
				this.CONTEXT
			)

			// Обновляем статус прочтения
			const readStatusKey = `chat:${chatId}:read_status`
			const readStatusResponse = await this.redisService.getKey(readStatusKey)

			// Исправляем объявление типа - используем Record для индексации по строке
			let readStatus: Record<string, string | null> = {}

			if (readStatusResponse.success && readStatusResponse.data) {
				try {
					readStatus = JSON.parse(readStatusResponse.data)
				} catch (e) {
					this.logger.warn(
						`Ошибка при парсинге статуса прочтения`,
						this.CONTEXT,
						{ error: e }
					)
				}
			}

			// Теперь это работает корректно с типами
			readStatus[userId] = lastReadMessageId
			await this.redisService.setKey(
				readStatusKey,
				JSON.stringify(readStatus),
				this.MESSAGE_TTL
			)

			// Продлеваем TTL для всех ключей
			await this.extendMessagesTTL(chatId)

			// Получаем сообщение для определения отправителя
			const messagesKey = `chat:${chatId}:messages`
			const msgResponse = await this.redisService.getHashField(
				messagesKey,
				lastReadMessageId
			)

			let senderId = null
			if (msgResponse.success && msgResponse.data) {
				const msg = JSON.parse(msgResponse.data)
				senderId = msg.fromUser
			}

			// Отправляем уведомление через Redis Pub/Sub для WebSocket сервера
			await this.redisPubSub.publishMessageRead({
				chatId,
				userId,
				messageIds: [lastReadMessageId],
				timestamp: Date.now(),
			})

			// Инвалидируем кеш превью чатов для пользователя
			await this.redisService.deleteKey(`user:${userId}:chats_preview`)

			return successResponse(true, 'Сообщения отмечены как прочитанные')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при отметке сообщений как прочитанные`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse(
				'Ошибка при отметке сообщений как прочитанные',
				error
			)
		}
	}

	/**
	 * Обновление статуса набора текста
	 */
	async setTypingStatus(
		userId: string,
		chatId: string,
		isTyping: boolean
	): Promise<any> {
		try {
			this.logger.debug(
				`Установка статуса набора текста для пользователя ${userId} в чате ${chatId}`,
				this.CONTEXT
			)

			// Получаем информацию о чате для определения участников
			const chatKey = `chat:${chatId}`
			const chatDataResponse = await this.redisService.getKey(chatKey)

			if (!chatDataResponse.success || !chatDataResponse.data) {
				return errorResponse('Чат не найден')
			}

			const chat = JSON.parse(chatDataResponse.data)

			// Отправляем уведомление через Redis Pub/Sub для WebSocket сервера
			await this.redisPubSub.publishTypingStatus({
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
				{ userId, chatId, isTyping, error }
			)
			return errorResponse('Ошибка при обновлении статуса набора текста', error)
		}
	}

	/**
	 * Отправка сообщения с медиафайлом
	 */
	async sendMessageWithMedia(
		chatId: string,
		fromUser: string,
		toUser: string,
		text: string,
		media_type: string,
		media_url: string
	): Promise<any> {
		try {
			this.logger.debug(
				`Отправка сообщения с медиафайлом в чат ${chatId} от пользователя ${fromUser}`,
				this.CONTEXT,
				{ media_type }
			)

			// Проверяем существование чата
			const chatKey = `chat:${chatId}`
			const chatDataResponse = await this.redisService.getKey(chatKey)

			if (!chatDataResponse.success || !chatDataResponse.data) {
				this.logger.warn(
					`Попытка отправить сообщение с медиафайлом в несуществующий чат ${chatId}`,
					this.CONTEXT
				)
				return errorResponse('Чат не найден')
			}

			const chat = JSON.parse(chatDataResponse.data)

			// Проверяем, является ли пользователь участником чата
			if (!chat.participants.includes(fromUser)) {
				this.logger.warn(
					`Пользователь ${fromUser} не является участником чата ${chatId}`,
					this.CONTEXT
				)
				return errorResponse('Вы не являетесь участником этого чата')
			}

			// Создаем новое сообщение
			const messageId = v4()
			const timestamp = Date.now()

			const message = {
				id: messageId,
				chatId,
				fromUser,
				toUser,
				text,
				created_at: timestamp,
				updated_at: timestamp,
				readStat: EReadIt.Unreaded,
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

			// Обновляем метаданные чата с последним сообщением
			chat.last_message_id = messageId
			await this.redisService.setKey(
				chatKey,
				JSON.stringify(chat),
				this.MESSAGE_TTL
			)

			// Продлеваем TTL для всех ключей
			await this.extendMessagesTTL(chatId)

			// Отправляем уведомление через Redis Pub/Sub для WebSocket сервера
			await this.redisPubSub.publishNewMessage({
				chatId,
				messageId,
				senderId: fromUser,
				recipientId: toUser,
				text,
				timestamp,
				media_type,
				media_url,
			})

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
				{ chatId, fromUser, toUser, media_type, error }
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
	): Promise<any> {
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
			const chatKey = `chat:${chatId}`
			const chatDataResponse = await this.redisService.getKey(chatKey)

			if (!chatDataResponse.success || !chatDataResponse.data) {
				this.logger.warn(
					`Попытка загрузить медиафайл в несуществующий чат ${chatId}`,
					this.CONTEXT
				)
				return errorResponse('Чат не найден')
			}

			const chat = JSON.parse(chatDataResponse.data)

			// Проверяем, является ли пользователь участником чата
			if (!chat.participants.includes(fromUser)) {
				this.logger.warn(
					`Пользователь ${fromUser} не является участником чата ${chatId}`,
					this.CONTEXT
				)
				return errorResponse('Вы не являетесь участником этого чата')
			}

			// Загружаем файл в хранилище
			const mediaType = file.mimetype
			const key = await this.storageService.uploadChatMedia(file)

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
	 * Обновление TTL для всех ключей, связанных с сообщениями
	 */
	private async extendMessagesTTL(chatId: string): Promise<void> {
		try {
			const keys = [`chat:${chatId}:messages`, `chat:${chatId}:order`]

			const promises = keys.map(key =>
				this.redisService.expireKey(key, this.MESSAGE_TTL)
			)
			await Promise.all(promises)

			this.logger.debug(
				`TTL для сообщений чата ${chatId} продлен на ${this.MESSAGE_TTL} секунд`,
				this.CONTEXT
			)
		} catch (error) {
			this.logger.warn(
				`Ошибка при продлении TTL для сообщений чата ${chatId}`,
				this.CONTEXT,
				{ error }
			)
		}
	}

	/**
	 * Выполнение задачи очистки сообщений с механизмом блокировки
	 */
	private async runMessagesCleanupWithLock(): Promise<void> {
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
				'Задача очистки сообщений уже выполняется другим процессом',
				this.CONTEXT
			)
			return
		}

		try {
			this.logger.log(
				'Начало задачи очистки устаревших сообщений',
				this.CONTEXT
			)
			await this.cleanupExpiredMessages()
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
				this.logger.debug(
					'Блокировка очистки сообщений освобождена',
					this.CONTEXT
				)
			} catch (error: any) {
				this.logger.error(
					'Ошибка при освобождении блокировки очистки сообщений',
					error?.stack,
					this.CONTEXT,
					{ error: error }
				)
			}
		}
	}

	/**
	 * Очистка устаревших сообщений
	 */
	private async cleanupExpiredMessages(): Promise<void> {
		try {
			// Получаем все ключи сообщений
			const messageKeys = await this.redisService.redis.keys('chat:*:messages')

			this.logger.log(
				`Найдено ${messageKeys.length} групп сообщений для проверки`,
				this.CONTEXT
			)

			let archivedCount = 0
			let errorCount = 0

			for (const key of messageKeys) {
				try {
					const chatId = key.split(':')[1]

					// Проверяем время последнего обновления чата
					const chatKey = `chat:${chatId}`
					const chatDataResponse = await this.redisService.getKey(chatKey)

					if (!chatDataResponse.success || !chatDataResponse.data) {
						// Если чат не найден, архивируем сообщения
						const archived = await this.archiveMessages(chatId)

						if (archived) {
							await this.redisService.deleteKey(key)
							await this.redisService.deleteKey(`chat:${chatId}:order`)
							archivedCount++
						}
					} else {
						// Проверяем TTL ключа сообщений
						const ttlResponse = await this.redisService.getTTL(key)

						if (
							ttlResponse.success &&
							ttlResponse.data &&
							ttlResponse.data < 0
						) {
							// Если TTL истек или не установлен, архивируем сообщения
							const archived = await this.archiveMessages(chatId)

							if (archived) {
								await this.redisService.deleteKey(key)
								await this.redisService.deleteKey(`chat:${chatId}:order`)
								archivedCount++
							}
						}
					}
				} catch (error: any) {
					errorCount++
					this.logger.error(
						`Ошибка при проверке сообщений`,
						error?.stack,
						this.CONTEXT,
						{ messageKey: key, error }
					)
				}
			}

			this.logger.log(
				`Завершена очистка сообщений. Архивировано: ${archivedCount}, ошибок: ${errorCount}`,
				this.CONTEXT
			)
		} catch (error: any) {
			this.logger.error(
				'Ошибка при очистке устаревших сообщений',
				error?.stack,
				this.CONTEXT,
				{ error }
			)
		}
	}

	/**
	 * Архивация сообщений чата в S3
	 */
	private async archiveMessages(chatId: string): Promise<boolean> {
		try {
			this.logger.debug(`Архивирование сообщений чата ${chatId}`, this.CONTEXT)

			// Получаем все сообщения чата
			const messagesKey = `chat:${chatId}:messages`
			const orderKey = `chat:${chatId}:order`

			const messageIdsResponse = await this.redisService.getZRevRange(
				orderKey,
				0,
				-1
			)

			if (
				!messageIdsResponse.success ||
				!messageIdsResponse.data ||
				messageIdsResponse.data.length === 0
			) {
				this.logger.debug(
					`Нет сообщений для архивации в чате ${chatId}`,
					this.CONTEXT
				)
				return false
			}

			const messageIds = messageIdsResponse.data

			// Получаем сообщения по их ID
			const messagesResponse = await this.redisService.getHashMultiple(
				messagesKey,
				messageIds
			)

			if (!messagesResponse.success || !messagesResponse.data) {
				this.logger.warn(
					`Ошибка при получении сообщений чата ${chatId} для архивации`,
					this.CONTEXT
				)
				return false
			}

			// Парсим сообщения
			const messages = messagesResponse.data
				.map(msgStr => (msgStr ? JSON.parse(msgStr) : null))
				.filter(Boolean)

			// Получаем метаданные чата
			const chatKey = `chat:${chatId}`
			const chatDataResponse = await this.redisService.getKey(chatKey)
			let chatData = null

			if (chatDataResponse.success && chatDataResponse.data) {
				try {
					chatData = JSON.parse(chatDataResponse.data)
				} catch (e) {
					this.logger.warn(`Ошибка при парсинге данных чата`, this.CONTEXT)
				}
			}

			// Получаем статусы прочтения
			const readStatusKey = `chat:${chatId}:read_status`
			const readStatusResponse = await this.redisService.getKey(readStatusKey)
			let readStatus = null

			if (readStatusResponse.success && readStatusResponse.data) {
				try {
					readStatus = JSON.parse(readStatusResponse.data)
				} catch (e) {
					this.logger.warn(
						`Ошибка при парсинге статусов прочтения`,
						this.CONTEXT
					)
				}
			}

			// Формируем архив
			const archiveData = {
				chatId,
				metadata: chatData,
				messages,
				readStatus,
				archivedAt: new Date().toISOString(),
			}

			// Сохраняем архив в S3
			const archiveKey = `chat_archives/messages_${chatId}_${Date.now()}.json`
			const archiveBuffer = Buffer.from(JSON.stringify(archiveData, null, 2))

			await this.storageService.uploadChatArchive(archiveKey, archiveBuffer)

			this.logger.debug(
				`Сообщения чата ${chatId} успешно архивированы в ${archiveKey}`,
				this.CONTEXT
			)
			return true
		} catch (error: any) {
			this.logger.error(
				`Ошибка при архивации сообщений чата`,
				error?.stack,
				this.CONTEXT,
				{ chatId, error }
			)
			return false
		}
	}
}
