import { Injectable } from '@nestjs/common'
import { InjectRedis } from '@nestjs-modules/ioredis'
import { errorResponse,	successResponse } from '@/common/helpers/api.response.helper'
import { ConnectionDto } from '@/common/abstract/micro/dto/connection.dto'
import { UpdateActivityDto } from './dto/update-activity.dto'
import { CreateRoomDto } from './dto/create-room.dto'
import { SetKeyDto } from './dto/set-key.dto'
import { GetKeyType } from './redis.types'
import type { Redis } from 'ioredis'
import type { ApiResponse } from '@/common/interfaces/api-response.interface'
@Injectable()
export class RedisService {
	private readonly USER_STATUS_PREFIX = 'user_status:'

	constructor(@InjectRedis() private readonly redis: Redis) {}

	async setKey(dto: SetKeyDto) {
		try {
			const { key, value, ttl } = dto

			if (ttl) {
				await this.redis.set(key, value, 'EX', ttl)
			} else {
				await this.redis.set(key, value)
			}

			return successResponse(true, `Ключ "${key}" успешно установлен`)
		} catch (error) {
			return errorResponse('Ошибка при установке ключа:', error)
		}
	}

	async getKey(key: string, type: GetKeyType = GetKeyType.String): Promise<ApiResponse> {
		try {
			let value
			switch(type) {
				case GetKeyType.String:
					value = await this.redis.get(key)
					break
				case GetKeyType.Array:
					value = await this.redis.lrange(key, 0, -1)
					break
				case GetKeyType.Set:
					value = await this.redis.smembers(key)
					break
			}

			return successResponse<typeof value>(value, `Ключ "${key}" успешно получен`)
		} catch (error) {
			return errorResponse(`Ошибка при получении ключа: ${key}`, error)
		}
	}

	async deleteKey(key: string) {
		try {
			const result = await this.redis.del(key)
			return successResponse(result > 0, `Ключ "${key}" успешно удалён`)
		} catch (error) {
			return errorResponse('Ошибка при удалении ключа:', error)
		}
	}

	async isUserOnline(telegramId: string) {
		try {
			const key = `user:online:${telegramId}`
			const value = await this.redis.get(key)

			return successResponse(
				value === '1',
				`Пользователь "${telegramId}" онлайн: ${value === '1'}`
			)
		} catch (error) {
			return errorResponse('Ошибка при проверке статуса пользователя:', error)
		}
	}

	async setUserOnline(telegramId: string, ttl = 300) {
		try {
			const key = `user:online:${telegramId}`
			await this.redis.set(key, '1', 'EX', ttl)
			return successResponse(
				true,
				`Пользователь "${telegramId}" поставлен в онлайн`
			)
		} catch (error) {
			return errorResponse(
				'Ошибка при установке статуса пользователя в онлайн:',
				error
			)
		}
	}

	async setUserOffline(telegramId: string) {
		try {
			const key = `user:online:${telegramId}`
			await this.redis.del(key)

			return successResponse(
				true,
				`Пользователь "${telegramId}" поставлен в оффлайн`
			)
		} catch (error) {
			return errorResponse(
				'Ошибка при установке статуса пользователя в оффлайн:',
				error
			)
		}
	}

	async updateActivity({ telegramId, isOnline }: UpdateActivityDto) {
		const key = this.USER_STATUS_PREFIX + telegramId
		if (isOnline) {
			await this.redis.set(key, 'online', 'EX', 60 * 10)
		} else {
			await this.redis.del(key)
		}
		return successResponse({}, 'Статус обновлён')
	}

	async getActivity(telegramId: string) {
		const key = this.USER_STATUS_PREFIX + telegramId
		const value = await this.redis.get(key)
		return value === 'online'
			? successResponse(true, 'Пользователь онлайн')
			: successResponse(false, 'Пользователь оффлайн')
	}

	async getOnlineUsers(): Promise<string[]> {
		const keys = await this.redis.keys(`${this.USER_STATUS_PREFIX}*`)
		return keys.map(key => key.replace(this.USER_STATUS_PREFIX, ''))
	}

	async createRoom(createRoomDto: CreateRoomDto): Promise<ApiResponse> {
		try {
			const { roomName, ttl, persons } = createRoomDto

			const exists = await this.redis.exists(roomName)
		
			exists && await this.redis.del(roomName)

			await this.redis.sadd(roomName, persons)
			await this.redis.expire(roomName, ttl)

			return successResponse(true, 'Комната создана')
		} catch (error) {
			return errorResponse('Произошла ошибка создания комнаты', error)
		}
	}

	async roomValidation(connectionDto: ConnectionDto): Promise<ApiResponse> {
		try {
			const { roomName, telegramId, } = connectionDto

			const isMember = await this.redis.sismember(roomName, telegramId)

			if (!isMember) {
				return successResponse(
					false,
					'Либо комната: ' + roomName + 
					' не создана, либо пользователь: ' + telegramId + 
					' не имеет доступа к комнате',
				)
			}

			return successResponse(true, `Ошибка валидации комнаты: ${roomName}`)
		} catch (error) {
			return errorResponse(`Ошибка валидации комнаты: ${connectionDto.roomName}`, error)
		}
	}
}
