import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { UpdateUserDto } from './dto/update-user.dto'
import {
	successResponse,
	errorResponse,
} from '../common/helpers/api.response.helper'
import { PublicUserDto } from './dto/public-user.dto'
import { StorageService } from '../storage/storage.service'
import { FindAllUsersDto } from './dto/find-all-users.dto'
import { AppLogger } from '../common/logger/logger.service'
import { RedisService } from '../redis/redis.service'
import { ApiResponse } from '../common/interfaces/api-response.interface'
interface PhotoResponse {
	id: number
	url: string
}

@Injectable()
export class UserService {
	private readonly CONTEXT = 'UserService'

	constructor(
		private readonly prisma: PrismaService,
		private readonly logger: AppLogger,
		private readonly redisService: RedisService,
		private readonly storageService: StorageService
	) {}

	// Добавьте этот метод
	private async getPhotoUrlsWithIds(
		photos: { id: number; key: string }[]
	): Promise<PhotoResponse[]> {
		const photoResponses: PhotoResponse[] = []

		for (const photo of photos) {
			const cacheKey = `photo:${photo.id}:url`

			// Проверяем кеш по ID фотографии
			const cachedUrl = await this.redisService.getKey(cacheKey)

			if (cachedUrl.success && cachedUrl.data) {
				this.logger.debug(
					`URL фото ID ${photo.id} получен из кеша`,
					this.CONTEXT
				)
				photoResponses.push({
					id: photo.id,
					url: cachedUrl.data,
				})
				continue
			}

			// Генерируем новый URL
			try {
				const presignedUrl = await this.storageService.getPresignedUrl(
					photo.key,
					7200
				)

				// Кешируем на 1 час 50 минут (меньше чем живет URL)
				await this.redisService.setKey(cacheKey, presignedUrl, 6600)

				photoResponses.push({
					id: photo.id,
					url: presignedUrl,
				})

				this.logger.debug(
					`Presigned URL создан и закеширован для фото ID ${photo.id}`,
					this.CONTEXT
				)
			} catch (error: any) {
				this.logger.warn(
					`Пропускаем фото ID ${photo.id} из-за ошибки: ${error.message}`,
					this.CONTEXT,
					{ photoId: photo.id, photoKey: photo.key, error }
				)
			}
		}

		return photoResponses
	}
	async findAll(params: FindAllUsersDto) {
		try {
			const {
				page = 1,
				limit = 10,
				sortBy = 'createdAt',
				sortDirection = 'desc',
				name,
				town,
				ageMin,
				ageMax,
				sex,
				interestId,
			} = params

			// Вычисление offset для пагинации
			const skip = (page - 1) * limit

			// Добавляем сортировку
			const orderBy: any = {}
			orderBy[sortBy] = sortDirection

			// Строим фильтры
			const where: any = {}

			if (name) {
				where.name = { contains: name, mode: 'insensitive' }
			}

			if (town) {
				where.town = { contains: town, mode: 'insensitive' }
			}

			if (ageMin !== undefined || ageMax !== undefined) {
				where.age = {}
				if (ageMin !== undefined) {
					where.age.gte = ageMin
				}
				if (ageMax !== undefined) {
					where.age.lte = ageMax
				}
			}

			if (sex) {
				where.sex = sex
			}

			if (interestId) {
				where.interestId = interestId
			}

			// Получаем общее количество записей для метаданных пагинации
			const totalCount = await this.prisma.user.count({ where })

			// Получаем записи с учетом пагинации, сортировки и фильтрации
			const users = await this.prisma.user.findMany({
				where,
				skip,
				take: limit,
				orderBy,
				include: { photos: true },
			})

			// Метаданные пагинации
			const pagination = {
				page,
				limit,
				totalCount,
				totalPages: Math.ceil(totalCount / limit),
				hasNext: page * limit < totalCount,
				hasPrevious: page > 1,
			}

			return successResponse(users, 'Список пользователей получен', {
				pagination,
			})
		} catch (error) {
			return errorResponse('Ошибка при получении пользователей', error)
		}
	}

	async findByTelegramId(telegramId: string): Promise<ApiResponse<any>> {
		try {
			const user = await this.prisma.user.findUnique({
				where: { telegramId },
				include: {
					photos: {
						select: {
							id: true,
							key: true,
						},
					},
					interest: true,
				},
			})

			if (!user) {
				return errorResponse('Пользователь не найден')
			}

			// Используем метод кеширования для получения URL фотографий
			const photoUrls = await this.getPhotoUrlsWithIds(user.photos)

			return successResponse(
				{
					...user,
					photos: photoUrls,
				},
				'Пользователь найден'
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при поиске пользователя ${telegramId}`,
				error?.stack,
				this.CONTEXT,
				{ error }
			)
			return errorResponse('Ошибка при поиске пользователя', error)
		}
	}

	async update(telegramId: string, dto: UpdateUserDto) {
		try {
			const user = await this.prisma.user.update({
				where: { telegramId },
				data: dto,
			})

			// Инвалидируем кеш публичного профиля
			await this.redisService.deleteKey(`user:${telegramId}:public_profile`)
			// Инвалидируем кеш статуса пользователя
			await this.redisService.deleteKey(`user:${telegramId}:status`)

			this.logger.debug(
				`Профиль пользователя ${telegramId} обновлен, кеш инвалидирован`,
				'UserService'
			)

			return successResponse(user, 'Профиль обновлён')
		} catch (error) {
			return errorResponse('Ошибка при обновлении пользователя', error)
		}
	}

	async remove(telegramId: string) {
		try {
			await this.prisma.user.delete({ where: { telegramId } })
			return successResponse(null, 'Пользователь удалён')
		} catch (error) {
			return errorResponse('Ошибка при удалении пользователя', error)
		}
	}

	async checkTgID(telegramId: string): Promise<string | ApiResponse<any>> {
		try {
			const user = await this.prisma.user.findUnique({
				where: { telegramId },
				select: { status: true },
			})
			// Преобразуем enum в строку для кеширования
			return user ? user.status.toString() : 'None'
		} catch (error) {
			return errorResponse('Ошибка при проверке Telegram ID:', error)
		}
	}

	async savePhotos(telegramId: string, photoKeys: string[]) {
		try {
			const photos = photoKeys.map(key => ({
				key,
				telegramId,
			}))

			await this.prisma.photo.createMany({ data: photos })
			return successResponse(null, 'Фотографии сохранены')
		} catch (error) {
			return errorResponse('Ошибка при сохранении фото', error)
		}
	}

	async getPublicProfile(telegramId: string) {
		try {
			// Проверяем кэш
			const cacheKey = `user:${telegramId}:public_profile`
			const cachedProfile = await this.redisService.getKey(cacheKey)

			if (cachedProfile.success && cachedProfile.data) {
				this.logger.debug(
					`Получен кешированный публичный профиль для ${telegramId}`,
					'UserService'
				)
				return successResponse(
					JSON.parse(cachedProfile.data),
					'Публичный профиль получен из кэша'
				)
			}

			const user = await this.prisma.user.findUnique({
				where: { telegramId: telegramId },
				include: { photos: true },
			})

			if (!user) return errorResponse('Пользователь не найден')

			const photoUrls = await Promise.all(
				user.photos.map(async p => ({
					key: p.key,
					url: await this.storageService.getPresignedUrl(p.key),
				}))
			)

			const publicProfile: PublicUserDto = {
				telegramId: user.telegramId,
				name: user.name,
				town: user.town,
				age: user.age,
				sex: user.sex,
				photos: photoUrls,
			}

			// Кешируем профиль на 15 минут
			const cacheTTL = 900 // 15 минут
			await this.redisService.setKey(
				cacheKey,
				JSON.stringify(publicProfile),
				cacheTTL
			)

			// Инвалидировать кеш при обновлении пользователя
			this.logger.debug(
				`Публичный профиль для ${telegramId} кеширован на ${cacheTTL} секунд`,
				'UserService'
			)

			return successResponse(publicProfile, 'Публичный профиль получен')
		} catch (error) {
			return errorResponse('Ошибка при получении публичного профиля:', error)
		}
	}
}
