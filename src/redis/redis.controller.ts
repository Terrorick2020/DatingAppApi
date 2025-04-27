import {
	Controller,
	Get,
	Post,
	Param,
	Query,
	Body,
	Delete,
	UseGuards,
} from '@nestjs/common'
import {
	ApiTags,
	ApiOperation,
	ApiParam,
	ApiQuery,
	ApiBody,
	ApiResponse,
} from '@nestjs/swagger'
import { RedisService } from './redis.service'
import { Status } from '../common/decorators/status.decorator'
import { UserStatusGuard } from '../common/guards/user-status.guard'
import { AppLogger } from '../common/logger/logger.service'
import { GetKeyType } from './redis.types'

interface KeyValueDto {
	key: string
	value: string
	ttl?: number
}

interface HashFieldDto {
	key: string
	field: string
	value: string
}

interface SortedSetDto {
	key: string
	score: number
	value: string
}

@ApiTags('redis')
@Controller('redis')
@UseGuards(UserStatusGuard)
@Status('Admin') // Ограничиваем доступ только для администраторов
export class RedisController {
	private readonly CONTEXT = 'RedisController'

	constructor(
		private readonly redisService: RedisService,
		private readonly logger: AppLogger
	) {}

	@ApiOperation({ summary: 'Получить значение по ключу' })
	@ApiParam({ name: 'key', description: 'Ключ для получения' })
	@ApiQuery({
		name: 'type',
		description: 'Тип значения',
		required: false,
		enum: ['String', 'Array'],
	})
	@Get(':key')
	@Status('Admin')
	async getKey(@Param('key') key: string, @Query('type') type?: string) {
		this.logger.debug(`Получение значения по ключу ${key}`, this.CONTEXT, {
			type,
		})
		return this.redisService.getKey(
			key,
			type === 'Array' ? GetKeyType.Array : GetKeyType.String
		)
	}

	@ApiOperation({ summary: 'Установить значение по ключу' })
	@ApiBody({
		schema: {
			type: 'object',
			properties: {
				key: { type: 'string' },
				value: { type: 'string' },
				ttl: { type: 'number', nullable: true },
			},
			required: ['key', 'value'],
		},
	})
	@Post('key')
	@Status('Admin')
	async setKey(@Body() keyValueDto: KeyValueDto) {
		this.logger.debug(
			`Установка значения по ключу ${keyValueDto.key}`,
			this.CONTEXT,
			{ ttl: keyValueDto.ttl }
		)
		return this.redisService.setKey(
			keyValueDto.key,
			keyValueDto.value,
			keyValueDto.ttl
		)
	}

	@ApiOperation({ summary: 'Удалить ключ' })
	@ApiParam({ name: 'key', description: 'Ключ для удаления' })
	@Delete(':key')
	@Status('Admin')
	async deleteKey(@Param('key') key: string) {
		this.logger.debug(`Удаление ключа ${key}`, this.CONTEXT)
		return this.redisService.deleteKey(key)
	}

	@ApiOperation({ summary: 'Установить TTL для ключа' })
	@ApiParam({ name: 'key', description: 'Ключ для установки TTL' })
	@ApiParam({ name: 'ttl', description: 'Время жизни в секундах' })
	@Post(':key/expire/:ttl')
	@Status('Admin')
	async expireKey(@Param('key') key: string, @Param('ttl') ttl: number) {
		this.logger.debug(`Установка TTL ${ttl} для ключа ${key}`, this.CONTEXT)
		return this.redisService.expireKey(key, ttl)
	}

	@ApiOperation({ summary: 'Получить поле из хеша' })
	@ApiParam({ name: 'key', description: 'Ключ хеша' })
	@ApiParam({ name: 'field', description: 'Поле хеша' })
	@Get('hash/:key/:field')
	@Status('Admin')
	async getHashField(@Param('key') key: string, @Param('field') field: string) {
		this.logger.debug(`Получение поля ${field} из хеша ${key}`, this.CONTEXT)
		return this.redisService.getHashField(key, field)
	}

	@ApiOperation({ summary: 'Установить поле в хеше' })
	@ApiBody({
		schema: {
			type: 'object',
			properties: {
				key: { type: 'string' },
				field: { type: 'string' },
				value: { type: 'string' },
			},
			required: ['key', 'field', 'value'],
		},
	})
	@Post('hash')
	@Status('Admin')
	async setHashField(@Body() hashFieldDto: HashFieldDto) {
		this.logger.debug(
			`Установка поля ${hashFieldDto.field} в хеше ${hashFieldDto.key}`,
			this.CONTEXT
		)
		return this.redisService.setHashField(
			hashFieldDto.key,
			hashFieldDto.field,
			hashFieldDto.value
		)
	}

	@ApiOperation({ summary: 'Получить все значения из хеша' })
	@ApiParam({ name: 'key', description: 'Ключ хеша' })
	@Get('hash/:key')
	@Status('Admin')
	async getHashAll(@Param('key') key: string) {
		this.logger.debug(`Получение всех значений из хеша ${key}`, this.CONTEXT)
		return this.redisService.getHashAll(key)
	}

	@ApiOperation({ summary: 'Добавить элемент в отсортированное множество' })
	@ApiBody({
		schema: {
			type: 'object',
			properties: {
				key: { type: 'string' },
				score: { type: 'number' },
				value: { type: 'string' },
			},
			required: ['key', 'score', 'value'],
		},
	})
	@Post('zset')
	@Status('Admin')
	async addToSortedSet(@Body() sortedSetDto: SortedSetDto) {
		this.logger.debug(
			`Добавление элемента в отсортированное множество ${sortedSetDto.key}`,
			this.CONTEXT,
			{ score: sortedSetDto.score }
		)
		return this.redisService.addToSortedSet(
			sortedSetDto.key,
			sortedSetDto.score,
			sortedSetDto.value
		)
	}

	@ApiOperation({ summary: 'Получить элементы из отсортированного множества' })
	@ApiParam({ name: 'key', description: 'Ключ отсортированного множества' })
	@ApiQuery({ name: 'start', description: 'Начальный индекс', required: true })
	@ApiQuery({ name: 'stop', description: 'Конечный индекс', required: true })
	@Get('zset/:key')
	@Status('Admin')
	async getZRevRange(
		@Param('key') key: string,
		@Query('start') start: number,
		@Query('stop') stop: number
	) {
		this.logger.debug(
			`Получение элементов из отсортированного множества ${key}`,
			this.CONTEXT,
			{ start, stop }
		)
		return this.redisService.getZRevRange(key, +start, +stop)
	}

	@ApiOperation({
		summary: 'Получить количество элементов в отсортированном множестве',
	})
	@ApiParam({ name: 'key', description: 'Ключ отсортированного множества' })
	@Get('zset/:key/count')
	@Status('Admin')
	async getZSetCardinality(@Param('key') key: string) {
		this.logger.debug(
			`Получение количества элементов в отсортированном множестве ${key}`,
			this.CONTEXT
		)
		return this.redisService.getZSetCardinality(key)
	}

	@ApiOperation({ summary: 'Получить ключи по шаблону' })
	@ApiParam({ name: 'pattern', description: 'Шаблон для поиска ключей' })
	@Get('keys/:pattern')
	@Status('Admin')
	async getKeysByPattern(@Param('pattern') pattern: string) {
		this.logger.debug(`Получение ключей по шаблону ${pattern}`, this.CONTEXT)
		return this.redisService.getKeysByPattern(pattern)
	}

	@ApiOperation({
		summary: 'Очистить все Redis кеши чатов старше указанного времени',
	})
	@ApiParam({ name: 'hours', description: 'Возраст в часах' })
	@Post('cleanup/chats/:hours')
	@Status('Admin')
	async cleanupOldChats(@Param('hours') hours: number) {
		this.logger.debug(
			`Запуск очистки чатов старше ${hours} часов`,
			this.CONTEXT
		)

		// Получаем все ключи чатов
		const chatKeysResponse = await this.redisService.getKeysByPattern('chat:*')

		if (!chatKeysResponse.success || !chatKeysResponse.data) {
			return chatKeysResponse
		}

		const chatKeys = chatKeysResponse.data
		const metadataKeys = chatKeys.filter(key => key.split(':').length === 2)

		const currentTime = Date.now()
		const maxAge = hours * 60 * 60 * 1000 // Часы -> миллисекунды

		let deletedCount = 0
		let errorCount = 0

		for (const key of metadataKeys) {
			try {
				const chatDataResponse = await this.redisService.getKey(key)

				if (!chatDataResponse.success || !chatDataResponse.data) {
					continue
				}

				const chatData = JSON.parse(chatDataResponse.data)

				if (!chatData.created_at) {
					continue
				}

				// Проверяем возраст чата
				if (currentTime - chatData.created_at > maxAge) {
					const chatId = key.split(':')[1]

					// Удаляем все ключи, связанные с чатом
					await this.redisService.deleteKey(`chat:${chatId}`)
					await this.redisService.deleteKey(`chat:${chatId}:read_status`)
					await this.redisService.deleteKey(`chat:${chatId}:messages`)
					await this.redisService.deleteKey(`chat:${chatId}:order`)

					// Удаляем чат из списков чатов пользователей
					for (const userId of chatData.participants) {
						const userChatsResponse = await this.redisService.getKey(
							`user:${userId}:chats`
						)

						if (userChatsResponse.success && userChatsResponse.data) {
							try {
								const chatIds = JSON.parse(userChatsResponse.data)

								if (Array.isArray(chatIds)) {
									const updatedChatIds = chatIds.filter(id => id !== chatId)

									await this.redisService.setKey(
										`user:${userId}:chats`,
										JSON.stringify(updatedChatIds)
									)

									// Инвалидируем кеш превью
									await this.redisService.deleteKey(
										`user:${userId}:chats_preview`
									)
								}
							} catch (e) {
								errorCount++
							}
						}
					}

					deletedCount++
				}
			} catch (error) {
				errorCount++
			}
		}

		return {
			success: true,
			message: `Очистка завершена. Удалено чатов: ${deletedCount}, ошибок: ${errorCount}`,
			data: { deletedCount, errorCount },
		}
	}

	@ApiOperation({ summary: 'Получить информацию о TTL ключа' })
	@ApiParam({ name: 'key', description: 'Ключ для проверки TTL' })
	@Get(':key/ttl')
	@Status('Admin')
	async getTTL(@Param('key') key: string) {
		this.logger.debug(`Получение TTL для ключа ${key}`, this.CONTEXT)
		return this.redisService.getTTL(key)
	}
}
