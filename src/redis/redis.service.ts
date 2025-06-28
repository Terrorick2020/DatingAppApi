import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import Redis from 'ioredis'
import { ConfigService } from '@nestjs/config'
import {
	successResponse,
	errorResponse,
} from '@/common/helpers/api.response.helper'
import { GetKeyType } from './redis.types'
import { AppLogger } from '@/common/logger/logger.service'
import {
	ConnectionStatus,
	ResTcpConnection,
} from '@/common/abstract/micro/micro.type'
import { ConnectionDto } from '@/common/abstract/micro/dto/connection.dto'
import { CreateRoomDto } from './dto/create-room.dto'
import { RedisErrorHandler } from './redis.error-handler'
import type { ApiResponse } from '@/common/interfaces/api-response.interface'
import { ChatMsg } from '../chats/chats.types'

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
	public readonly redis: Redis
	private readonly CONTEXT = 'RedisService'

	constructor(
		private readonly configService: ConfigService,
		private readonly logger: AppLogger,
		private readonly errorHandler: RedisErrorHandler
	) {
		this.redis = new Redis({
			host: this.configService.get('REDIS_HOST'),
			port: this.configService.get('REDIS_PORT'),
			password: this.configService.get('REDIS_PASSWORD'),
			retryStrategy: (times: number) => {
				const delay = Math.min(times * 50, 2000)
				this.logger.warn(
					`Попытка переподключения к Redis: ${times}, задержка: ${delay}ms`,
					this.CONTEXT
				)
				return delay
			},
			maxRetriesPerRequest: 3,
			enableReadyCheck: true,
			autoResubscribe: true,
		})
	}

	getClient(): Redis {
		return this.redis
	}

	async onModuleInit() {
		// Подключение обработчиков ошибок
		this.errorHandler.attachErrorHandlers(this.redis)
		this.logger.log('Redis сервис инициализирован', this.CONTEXT)
	}

	async onModuleDestroy() {
		try {
			await this.redis.quit()
			this.logger.log('Redis соединение корректно закрыто', this.CONTEXT)
		} catch (error: any) {
			// Явно указываем any, так как мы не знаем точного типа ошибки
			this.logger.error(
				'Ошибка при закрытии соединения с Redis',
				error?.stack,
				this.CONTEXT,
				{ error }
			)
		}
	}

	/**
	 * Получение значения по ключу
	 */
	async getKey(
		key: string,
		type: GetKeyType = GetKeyType.String
	): Promise<ApiResponse<any>> {
		try {
			this.logger.debug(`Получение значения для ключа: ${key}`, this.CONTEXT)
			const value = await this.redis.get(key)

			if (!value) {
				this.logger.debug(`Ключ не найден: ${key}`, this.CONTEXT)
				return errorResponse('Ключ не найден')
			}

			if (type === GetKeyType.Array) {
				try {
					const array = JSON.parse(value)
					this.logger.debug(`Массив получен для ключа: ${key}`, this.CONTEXT)
					return successResponse(array, 'Массив успешно получен')
				} catch (error: any) {
					this.logger.warn(
						`Ошибка парсинга массива для ключа: ${key}`,
						this.CONTEXT,
						{ error }
					)
					return errorResponse('Ошибка парсинга массива')
				}
			}

			return successResponse(value, 'Значение успешно получено')
		} catch (error: any) {
			const errorMessage = this.errorHandler.handleRedisError(
				error,
				'getKey',
				key
			)
			return errorResponse(errorMessage, error)
		}
	}

	/**
	 * Установка значения по ключу
	 */
	async setKey(
		key: string,
		value: string,
		ttl?: number
	): Promise<ApiResponse<boolean>> {
		try {
			if (ttl) {
				this.logger.debug(
					`Установка значения для ключа: ${key} с TTL: ${ttl}`,
					this.CONTEXT
				)
				await this.redis.set(key, value, 'EX', ttl)
			} else {
				this.logger.debug(
					`Установка значения для ключа: ${key} без TTL`,
					this.CONTEXT
				)
				await this.redis.set(key, value)
			}

			return successResponse(true, 'Значение успешно установлено')
		} catch (error: any) {
			const errorMessage = this.errorHandler.handleRedisError(
				error,
				'setKey',
				key
			)
			return errorResponse(errorMessage, error)
		}
	}

	/**
	 * Удаление ключа
	 */
	async deleteKey(key: string): Promise<ApiResponse<boolean>> {
		try {
			this.logger.debug(`Удаление ключа: ${key}`, this.CONTEXT)
			await this.redis.del(key)
			return successResponse(true, 'Ключ успешно удален')
		} catch (error: any) {
			const errorMessage = this.errorHandler.handleRedisError(
				error,
				'deleteKey',
				key
			)
			return errorResponse(errorMessage, error)
		}
	}

	/**
	 * Установка времени жизни ключа
	 */
	async expireKey(key: string, ttl: number): Promise<ApiResponse<boolean>> {
		try {
			this.logger.debug(`Установка TTL: ${ttl} для ключа: ${key}`, this.CONTEXT)
			await this.redis.expire(key, ttl)
			return successResponse(true, 'TTL успешно установлен')
		} catch (error: any) {
			const errorMessage = this.errorHandler.handleRedisError(
				error,
				'expireKey',
				key
			)
			return errorResponse(errorMessage, error)
		}
	}

	/**
	 * Получение поля из хеша
	 */
	async getHashField(key: string, field: string): Promise<ApiResponse<string>> {
		try {
			this.logger.debug(
				`Получение поля: ${field} из хеша: ${key}`,
				this.CONTEXT
			)
			const value = await this.redis.hget(key, field)

			if (!value) {
				this.logger.debug(
					`Поле: ${field} не найдено в хеше: ${key}`,
					this.CONTEXT
				)
				return errorResponse('Поле не найдено')
			}

			return successResponse(value, 'Поле успешно получено')
		} catch (error: any) {
			const errorMessage = this.errorHandler.handleRedisError(
				error,
				'getHashField',
				`${key}:${field}`
			)
			return errorResponse(errorMessage, error)
		}
	}

	/**
	 * Получение нескольких полей из хеша
	 */
	async getHashMultiple(
		key: string,
		fields: string[]
	): Promise<ApiResponse<(string | null)[]>> {
		try {
			this.logger.debug(
				`Получение ${fields.length} полей из хеша: ${key}`,
				this.CONTEXT
			)
			const values = await this.redis.hmget(key, ...fields)
			return successResponse(values, 'Поля успешно получены')
		} catch (error: any) {
			const errorMessage = this.errorHandler.handleRedisError(
				error,
				'getHashMultiple',
				key
			)
			return errorResponse(errorMessage, error)
		}
	}

	/**
	 * Установка поля в хеше
	 */
	async setHashField(
		key: string,
		field: string,
		value: string
	): Promise<ApiResponse<boolean>> {
		try {
			this.logger.debug(`Установка поля: ${field} в хеше: ${key}`, this.CONTEXT)
			await this.redis.hset(key, field, value)
			return successResponse(true, 'Поле успешно установлено')
		} catch (error: any) {
			const errorMessage = this.errorHandler.handleRedisError(
				error,
				'setHashField',
				`${key}:${field}`
			)
			return errorResponse(errorMessage, error)
		}
	}

	/**
	 * Добавление элемента в отсортированное множество
	 */
	async addToSortedSet(
		key: string,
		score: number,
		value: string
	): Promise<ApiResponse<boolean>> {
		try {
			this.logger.debug(
				`Добавление элемента с score: ${score} в sorted set: ${key}`,
				this.CONTEXT
			)
			await this.redis.zadd(key, score, value)
			return successResponse(true, 'Элемент успешно добавлен')
		} catch (error: any) {
			const errorMessage = this.errorHandler.handleRedisError(
				error,
				'addToSortedSet',
				key
			)
			return errorResponse(errorMessage, error)
		}
	}

	/**
	 * Получение элементов из отсортированного множества (в обратном порядке)
	 */
	async getZRevRange(
		key: string,
		start: number,
		stop: number
	): Promise<ApiResponse<string[]>> {
		try {
			this.logger.debug(
				`Получение элементов из sorted set: ${key} от ${start} до ${stop}`,
				this.CONTEXT
			)
			const values = await this.redis.zrevrange(key, start, stop)
			return successResponse(values, 'Элементы успешно получены')
		} catch (error: any) {
			const errorMessage = this.errorHandler.handleRedisError(
				error,
				'getZRevRange',
				key
			)
			return errorResponse(errorMessage, error)
		}
	}

	async getSortedSetScore(key: string, member: string) {
		return this.redis.zscore(key, member)
	}

	async getSortedSetRangeByScore(
		key: string,
		min: number | string,
		max: number | string
	): Promise<ApiResponse<string[]>> {
		try {
			const data = await this.redis.zrangebyscore(key, min, max)
			return successResponse(data)
		} catch (error: any) {
			return errorResponse(
				'Ошибка при получении диапазона из sorted set',
				error
			)
		}
	}

	/**
	 * Подсчет количества сообщений после указанного
	 */
	async countMessagesAfter(
		orderKey: string,
		messageId: string
	): Promise<ApiResponse<number>> {
		try {
			this.logger.debug(
				`Подсчет сообщений после ID: ${messageId} в ключе: ${orderKey}`,
				this.CONTEXT
			)
			// Получаем позицию сообщения в отсортированном множестве
			const rank = await this.redis.zrevrank(orderKey, messageId)

			if (rank === null) {
				this.logger.debug(
					`Сообщение ${messageId} не найдено в ключе: ${orderKey}`,
					this.CONTEXT
				)
				return errorResponse('Сообщение не найдено')
			}

			// Считаем количество сообщений до указанного (т.е. более новых)
			return successResponse(
				rank,
				'Количество непрочитанных сообщений получено'
			)
		} catch (error: any) {
			const errorMessage = this.errorHandler.handleRedisError(
				error,
				'countMessagesAfter',
				orderKey
			)
			return errorResponse(errorMessage, error)
		}
	}

	async getMessagesAfter(
		orderKey: string,
		messagesKey: string,
		messageId: string,
		limit: number = 50
	): Promise<ApiResponse<ChatMsg[]>> {
		try {
			this.logger.debug(
				`Получение сообщений после ID: ${messageId} в ключе: ${orderKey}`,
				this.CONTEXT,
				{ limit }
			)

			// Получаем позицию сообщения
			const rank = await this.redis.zrevrank(orderKey, messageId)

			if (rank === null) {
				this.logger.debug(
					`Сообщение ${messageId} не найдено в ключе: ${orderKey}`,
					this.CONTEXT
				)
				return errorResponse('Сообщение не найдено')
			}

			// Получаем ID следующих сообщений после указанного (т.е. rank - 1 до конца)
			const nextMessageIds = await this.redis.zrevrange(orderKey, 0, rank - 1)

			if (!nextMessageIds || nextMessageIds.length === 0) {
				return successResponse([], 'Нет новых сообщений')
			}

			// Ограничиваем по лимиту
			const slicedIds = nextMessageIds.slice(0, limit)

			const messagesResponse = await this.getHashMultiple(
				messagesKey,
				slicedIds
			)

			if (!messagesResponse.success || !messagesResponse.data) {
				return errorResponse('Ошибка при получении сообщений из хранилища')
			}

			const messages: ChatMsg[] = messagesResponse.data
				.map(msgStr => {
					try {
						if (!msgStr) return null
						const msg: ChatMsg = JSON.parse(msgStr)
						if (!msg || !msg.id || !msg.chatId) return null
						return msg
					} catch {
						return null
					}
				})
				.filter(Boolean) as ChatMsg[]

			return successResponse(messages.reverse(), 'Новые сообщения получены')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при получении сообщений после ${messageId} в ${orderKey}`,
				error?.stack,
				this.CONTEXT,
				{ messageId, orderKey, error }
			)
			return errorResponse('Ошибка при получении новых сообщений', error)
		}
	}

	/**
	 * Проверка существования ключа
	 */
	async keyExists(key: string): Promise<ApiResponse<boolean>> {
		try {
			this.logger.debug(`Проверка существования ключа: ${key}`, this.CONTEXT)
			const exists = await this.redis.exists(key)
			return successResponse(
				exists > 0,
				exists > 0 ? 'Ключ существует' : 'Ключ не существует'
			)
		} catch (error: any) {
			const errorMessage = this.errorHandler.handleRedisError(
				error,
				'keyExists',
				key
			)
			return errorResponse(errorMessage, error)
		}
	}

	/**
	 * Атомарное увеличение числового значения
	 */
	async increment(key: string, by: number = 1): Promise<ApiResponse<number>> {
		try {
			this.logger.debug(
				`Увеличение значения ключа ${key} на ${by}`,
				this.CONTEXT
			)
			let result: number

			if (by === 1) {
				result = await this.redis.incr(key)
			} else {
				result = await this.redis.incrby(key, by)
			}

			return successResponse(result, 'Значение успешно увеличено')
		} catch (error: any) {
			const errorMessage = this.errorHandler.handleRedisError(
				error,
				'increment',
				key
			)
			return errorResponse(errorMessage, error)
		}
	}

	/**
	 * Атомарное уменьшение числового значения
	 */
	async decrement(key: string, by: number = 1): Promise<ApiResponse<number>> {
		try {
			this.logger.debug(
				`Уменьшение значения ключа ${key} на ${by}`,
				this.CONTEXT
			)
			let result: number

			if (by === 1) {
				result = await this.redis.decr(key)
			} else {
				result = await this.redis.decrby(key, by)
			}

			return successResponse(result, 'Значение успешно уменьшено')
		} catch (error: any) {
			const errorMessage = this.errorHandler.handleRedisError(
				error,
				'decrement',
				key
			)
			return errorResponse(errorMessage, error)
		}
	}

	/**
	 * Установка значения с проверкой на существование
	 */
	async setNX(
		key: string,
		value: string,
		ttl?: number
	): Promise<ApiResponse<boolean>> {
		try {
			let result: string | null

			if (ttl) {
				this.logger.debug(
					`Установка значения для ключа ${key} если не существует, с TTL ${ttl}`,
					this.CONTEXT
				)
				result = await this.redis.set(key, value, 'EX', ttl, 'NX')
			} else {
				this.logger.debug(
					`Установка значения для ключа ${key} если не существует`,
					this.CONTEXT
				)
				result = await this.redis.set(key, value, 'NX')
			}

			const success = result === 'OK'

			return successResponse(
				success,
				success ? 'Значение успешно установлено' : 'Ключ уже существует'
			)
		} catch (error: any) {
			const errorMessage = this.errorHandler.handleRedisError(
				error,
				'setNX',
				key
			)
			return errorResponse(errorMessage, error)
		}
	}

	/**
	 * Получение всех значений из хеша
	 */
	async getHashAll(key: string): Promise<ApiResponse<Record<string, string>>> {
		try {
			this.logger.debug(`Получение всех значений из хеша ${key}`, this.CONTEXT)
			const values = await this.redis.hgetall(key)

			if (Object.keys(values).length === 0) {
				this.logger.debug(`Хеш ${key} пуст или не существует`, this.CONTEXT)
				return errorResponse('Хеш пуст или не существует')
			}

			return successResponse(values, 'Значения успешно получены')
		} catch (error: any) {
			const errorMessage = this.errorHandler.handleRedisError(
				error,
				'getHashAll',
				key
			)
			return errorResponse(errorMessage, error)
		}
	}

	/**
	 * Получение количества элементов в хеше
	 */
	async getHashLength(key: string): Promise<ApiResponse<number>> {
		try {
			this.logger.debug(
				`Получение количества элементов в хеше ${key}`,
				this.CONTEXT
			)
			const length = await this.redis.hlen(key)

			return successResponse(length, 'Количество элементов получено')
		} catch (error: any) {
			const errorMessage = this.errorHandler.handleRedisError(
				error,
				'getHashLength',
				key
			)
			return errorResponse(errorMessage, error)
		}
	}

	/**
	 * Получение количества элементов в отсортированном множестве
	 */
	async getZSetCardinality(key: string): Promise<ApiResponse<number>> {
		try {
			this.logger.debug(
				`Получение количества элементов в отсортированном множестве ${key}`,
				this.CONTEXT
			)
			const count = await this.redis.zcard(key)

			return successResponse(count, 'Количество элементов получено')
		} catch (error: any) {
			const errorMessage = this.errorHandler.handleRedisError(
				error,
				'getZSetCardinality',
				key
			)
			return errorResponse(errorMessage, error)
		}
	}

	/**
	 * Выполнение транзакции Redis (multi)
	 */
	async executeTransaction(commands: Function[]): Promise<ApiResponse<any[]>> {
		try {
			this.logger.debug(
				`Выполнение транзакции из ${commands.length} команд`,
				this.CONTEXT
			)

			const multi = this.redis.multi()

			// Добавляем команды в транзакцию
			for (const command of commands) {
				command(multi)
			}

			// Выполняем транзакцию
			const results = await multi.exec()

			if (!results) {
				this.logger.warn('Транзакция не выполнена', this.CONTEXT)
				return errorResponse('Транзакция не выполнена')
			}

			// Проверяем на ошибки в результатах
			const errors = results.filter(([err]) => err).map(([err]) => err)

			if (errors.length > 0) {
				this.logger.error(
					`Ошибки при выполнении транзакции: ${errors.length}`,
					errors[0]?.stack,
					this.CONTEXT,
					{ errors }
				)
				return errorResponse('Ошибки при выполнении транзакции', errors)
			}

			// Извлекаем результаты без ошибок
			const successResults = results.map(([_, result]) => result)

			return successResponse(successResults, 'Транзакция успешно выполнена')
		} catch (error: any) {
			const errorMessage = this.errorHandler.handleRedisError(
				error,
				'executeTransaction'
			)
			return errorResponse(errorMessage, error)
		}
	}

	/**
	 * Получение TTL ключа
	 */
	async getTTL(key: string): Promise<ApiResponse<number>> {
		try {
			this.logger.debug(`Получение TTL ключа ${key}`, this.CONTEXT)
			const ttl = await this.redis.ttl(key)

			return successResponse(ttl, 'TTL успешно получен')
		} catch (error: any) {
			const errorMessage = this.errorHandler.handleRedisError(
				error,
				'getTTL',
				key
			)
			return errorResponse(errorMessage, error)
		}
	}

	/**
	 * Получение всех ключей по шаблону
	 */
	async getKeysByPattern(pattern: string): Promise<ApiResponse<string[]>> {
		try {
			this.logger.debug(`Получение ключей по шаблону ${pattern}`, this.CONTEXT)
			const keys = await this.redis.keys(pattern)

			return successResponse(keys, 'Ключи успешно получены')
		} catch (error: any) {
			const errorMessage = this.errorHandler.handleRedisError(
				error,
				'getKeysByPattern',
				pattern
			)
			return errorResponse(errorMessage, error)
		}
	}

	async createRoom(
		createRoomDto: CreateRoomDto
	): Promise<ApiResponse<boolean>> {
		try {
			const { roomName, ttl, persons } = createRoomDto

			const exists = await this.redis.exists(roomName)

			exists && (await this.redis.del(roomName))

			await this.redis.sadd(roomName, persons)
			await this.redis.expire(roomName, ttl)

			return successResponse(true, 'Комната создана')
		} catch (error) {
			return errorResponse('Произошла ошибка создания комнаты', error)
		}
	}

	async zcount(key: string, min: string | number, max: string | number) {
		const count = await this.redis.zcount(key, min, max)
		return { success: true, data: count }
	}

	async roomValidation(
		connectionDto: ConnectionDto
	): Promise<ApiResponse<ResTcpConnection>> {
		try {
			const { roomName, telegramId } = connectionDto

			const successMsg = `Успешная валидация комнаты: ${roomName} пользователем: ${telegramId}`
			const errMsg = `Либо комната: ${telegramId} не создана, либо пользователь: ${roomName} не имеет доступа к комнате`

			const isMember = await this.redis.sismember(roomName, telegramId)

			const tcpRes: ResTcpConnection = {
				roomName,
				telegramId,
				message: isMember ? successMsg : errMsg,
				status: isMember ? ConnectionStatus.Success : ConnectionStatus.Error,
			}

			return successResponse(tcpRes, successMsg)
		} catch (error) {
			return errorResponse(
				`Ошибка валидации комнаты: ${connectionDto.roomName}`,
				error
			)
		}
	}
}
