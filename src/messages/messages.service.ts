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
import { UpdateDto } from './dto/update.dto'
import { v4 } from 'uuid'
import {
	successResponse,
	errorResponse,
} from '@/common/helpers/api.response.helper'
import { ClientProxy } from '@nestjs/microservices'
import * as cron from 'node-cron'
import { EReadIt, ELineStat } from './messages.type'
import { SendMsgsTcpPatterns } from './messages.type'
import { UpdateMicroPartnerDto } from './dto/update-partner.micro.dto'
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
		@Inject('MESSAGES_SERVICE') private readonly wsClient: ClientProxy
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
			const { chatId } = findDto

			this.logger.debug(`Получение сообщений для чата ${chatId}`, this.CONTEXT)

			const messagesKey = `chat:${chatId}:messages`
			const orderKey = `chat:${chatId}:order`

			// Получаем упорядоченный список ID сообщений
			const messageIdsResponse = await this.redisService.getZRevRange(
				orderKey,
				0,
				100 // Можно параметризовать или получать из dto
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

			// Оповещаем WebSocket сервер о новом сообщении
			this.wsClient.emit('newMessage', {
				chatId,
				messageId,
				senderId: fromUser,
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

			// Оповещаем WebSocket сервер об обновлении сообщения
			this.wsClient.emit(SendMsgsTcpPatterns.UpdateMsg, {
				roomName: message.toUser, // Предполагаем, что получатель находится в комнате с его ID
				telegramId: message.fromUser,
				chatId,
				msgId,
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
	async delete(msgId: string): Promise<any> {
		try {
			// Нужно определить к какому чату относится сообщение
			// Предполагаем, что формат msgId содержит информацию о чате
			// или нужно предоставить дополнительный параметр chatId
			const parts = msgId.split('_')
			const chatId = parts[0] // Предполагаем такой формат, либо нужно изменить логику

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

			// Удаляем сообщение из хеша
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

			// Оповещаем WebSocket сервер об удалении сообщения
			this.wsClient.emit(SendMsgsTcpPatterns.UpdateMsg, {
				roomName: message.toUser,
				telegramId: message.fromUser,
				chatId,
				msgId,
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
				{ msgId, error }
			)
			return errorResponse('Ошибка при удалении сообщения', error)
		}
	}

	/**
	 * Обновление статуса собеседника (печатает/не печатает, онлайн/оффлайн)
	 */
	async updatePartnerStatus(updateDto: UpdateMicroPartnerDto): Promise<any> {
		try {
			const { telegramId, roomName } = updateDto

			this.logger.debug(
				`Обновление статуса собеседника для пользователя ${telegramId} в комнате ${roomName}`,
				this.CONTEXT
			)

			// Оповещаем WebSocket сервер об обновлении статуса
			this.wsClient.emit(SendMsgsTcpPatterns.UpdatePartner, updateDto)

			return successResponse(true, 'Статус собеседника обновлен')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при обновлении статуса собеседника`,
				error?.stack,
				this.CONTEXT,
				{ updateDto, error }
			)
			return errorResponse('Ошибка при обновлении статуса собеседника', error)
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

			// Формируем архив
			const archiveData = {
				chatId,
				messages,
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

	/**
	 * WebSocket методы
	 */

	/**
	 * Обработка подключения к комнате
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
				ELineStat.Online,
				3600
			)
			await this.redisService.setKey(
				`user:${connectionDto.telegramId}:room`,
				connectionDto.roomName,
				3600
			)

			// Оповещаем других пользователей о статусе "онлайн"
			this.wsClient.emit(SendMsgsTcpPatterns.UpdatePartner, {
				roomName: connectionDto.roomName,
				telegramId: connectionDto.telegramId,
				newLineStat: ELineStat.Online,
			})

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
	 * Обработка отключения от комнаты
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
				ELineStat.Offline,
				3600
			)
			await this.redisService.deleteKey(`user:${connectionDto.telegramId}:room`)

			// Оповещаем других пользователей о статусе "оффлайн"
			this.wsClient.emit(SendMsgsTcpPatterns.UpdatePartner, {
				roomName: connectionDto.roomName,
				telegramId: connectionDto.telegramId,
				newLineStat: ELineStat.Offline,
			})

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
	 * Обработка обновления статуса собеседника
	 */
	async handleUpdatePartner(updateDto: UpdateMicroPartnerDto) {
		try {
			this.logger.debug(
				`WS: Обновление статуса собеседника ${updateDto.telegramId}`,
				this.CONTEXT
			)

			// Получаем комнату пользователя
			const userRoomResponse = await this.redisService.getKey(
				`user:${updateDto.telegramId}:room`
			)

			if (!userRoomResponse.success || !userRoomResponse.data) {
				this.logger.warn(
					`Пользователь ${updateDto.telegramId} не находится в комнате`,
					this.CONTEXT
				)
				return {
					message: 'Пользователь не в комнате',
					status: ConnectionStatus.Error,
				}
			}

			return updateDto
		} catch (error: any) {
			this.logger.error(
				`Ошибка при обновлении статуса собеседника`,
				error?.stack,
				this.CONTEXT,
				{ error, updateDto }
			)
			return {
				message: 'Ошибка при обновлении статуса собеседника',
				status: ConnectionStatus.Error,
			}
		}
	}

	/**
	 * Обработка изменения статуса сообщения (прочитано/не прочитано)
	 */
	async handleMessageRead(data: any) {
		try {
			const { chatId, userId, messageId } = data

			this.logger.debug(
				`WS: Обработка прочтения сообщения ${messageId} в чате ${chatId}`,
				this.CONTEXT
			)

			// Обновляем статус сообщения
			const messagesKey = `chat:${chatId}:messages`
			const messageResponse = await this.redisService.getHashField(
				messagesKey,
				messageId
			)

			if (messageResponse.success && messageResponse.data) {
				const message = JSON.parse(messageResponse.data)

				// Обновляем статус прочтения
				if (message.toUser === userId) {
					message.readStat = EReadIt.Readed
					message.updated_at = Date.now()

					await this.redisService.setHashField(
						messagesKey,
						messageId,
						JSON.stringify(message)
					)

					// Продлеваем TTL
					await this.extendMessagesTTL(chatId)

					// Оповещаем отправителя о прочтении
					const senderRoom = await this.redisService.getKey(
						`user:${message.fromUser}:room`
					)

					if (senderRoom.success && senderRoom.data) {
						this.wsClient.emit(SendMsgsTcpPatterns.UpdateMsg, {
							roomName: senderRoom.data,
							telegramId: message.fromUser,
							chatId,
							msgId: messageId,
							isReaded: true,
						})
					}
				}
			}

			return true
		} catch (error: any) {
			this.logger.error(
				`Ошибка при обработке прочтения сообщения`,
				error?.stack,
				this.CONTEXT,
				{ error, data }
			)
			return false
		}
	}

	/**
	 * Обработка обновления сообщения
	 */
	async handleUpdateMessage(data: any) {
		try {
			const { chatId, msgId, newMsgData, isReaded } = data

			this.logger.debug(
				`WS: Обработка обновления сообщения ${msgId} в чате ${chatId}`,
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
				return false
			}

			const message = JSON.parse(messageResponse.data)
			let updated = false

			// Обновляем текст сообщения
			if (newMsgData) {
				if (newMsgData.msg !== undefined) {
					message.text = newMsgData.msg
					message.updated_at = newMsgData.time || Date.now()
					updated = true
				}

				if (newMsgData.isDeleted) {
					message.text = '[Сообщение удалено]'
					message.isDeleted = true
					message.updated_at = newMsgData.time || Date.now()
					updated = true
				}
			}

			// Обновляем статус прочтения
			if (isReaded !== undefined) {
				message.readStat = isReaded ? EReadIt.Readed : EReadIt.Unreaded
				updated = true
			}

			if (updated) {
				// Сохраняем обновленное сообщение
				await this.redisService.setHashField(
					messagesKey,
					msgId,
					JSON.stringify(message)
				)

				// Продлеваем TTL
				await this.extendMessagesTTL(chatId)
			}

			return true
		} catch (error: any) {
			this.logger.error(
				`Ошибка при обработке обновления сообщения`,
				error?.stack,
				this.CONTEXT,
				{ error, data }
			)
			return false
		}
	}

	/**
	 * Получение статуса собеседника (онлайн/оффлайн, печатает/не печатает)
	 */
	async getPartnerStatus(userId: string): Promise<any> {
		try {
			this.logger.debug(
				`Получение статуса пользователя ${userId}`,
				this.CONTEXT
			)

			const statusResponse = await this.redisService.getKey(
				`user:${userId}:status`
			)
			const lineStatus =
				statusResponse.success && statusResponse.data
					? statusResponse.data
					: ELineStat.Offline

			const writeStatusResponse = await this.redisService.getKey(
				`user:${userId}:writing`
			)
			const isWriting =
				writeStatusResponse.success && writeStatusResponse.data === 'true'

			return successResponse(
				{
					userId,
					lineStatus,
					isWriting,
				},
				'Статус пользователя получен'
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при получении статуса пользователя`,
				error?.stack,
				this.CONTEXT,
				{ userId, error }
			)
			return errorResponse('Ошибка при получении статуса пользователя', error)
		}
	}

	/**
	 * Установка статуса "печатает"
	 */
	async setWritingStatus(
		userId: string,
		chatId: string,
		isWriting: boolean
	): Promise<any> {
		try {
			this.logger.debug(
				`Установка статуса "печатает" для пользователя ${userId} в чате ${chatId}: ${isWriting}`,
				this.CONTEXT
			)

			// Сохраняем статус в Redis
			await this.redisService.setKey(
				`user:${userId}:writing`,
				isWriting ? 'true' : 'false',
				60 // Статус "печатает" действителен 60 секунд
			)

			// Получаем информацию о чате
			const chatKey = `chat:${chatId}`
			const chatDataResponse = await this.redisService.getKey(chatKey)

			if (!chatDataResponse.success || !chatDataResponse.data) {
				this.logger.warn(
					`Чат ${chatId} не найден при установке статуса "печатает"`,
					this.CONTEXT
				)
				return errorResponse('Чат не найден')
			}

			const chat = JSON.parse(chatDataResponse.data)

			// Находим собеседника
			const partner = chat.participants.find((id: string) => id !== userId)

			if (!partner) {
				this.logger.warn(`Не найден собеседник в чате ${chatId}`, this.CONTEXT)
				return errorResponse('Собеседник не найден')
			}

			// Получаем комнату собеседника
			const partnerRoomResponse = await this.redisService.getKey(
				`user:${partner}:room`
			)

			if (partnerRoomResponse.success && partnerRoomResponse.data) {
				// Оповещаем собеседника о статусе "печатает"
				this.wsClient.emit(SendMsgsTcpPatterns.UpdatePartner, {
					roomName: partnerRoomResponse.data,
					telegramId: userId,
					newWriteStat: isWriting ? 'Write' : 'None',
				})
			}

			return successResponse(true, 'Статус "печатает" установлен')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при установке статуса "печатает"`,
				error?.stack,
				this.CONTEXT,
				{ userId, chatId, isWriting, error }
			)
			return errorResponse('Ошибка при установке статуса "печатает"', error)
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

			// Продлеваем TTL
			await this.extendMessagesTTL(chatId)

			// Оповещаем WebSocket сервер о новом сообщении
			this.wsClient.emit('newMessage', {
				chatId,
				messageId,
				senderId: fromUser,
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
}
