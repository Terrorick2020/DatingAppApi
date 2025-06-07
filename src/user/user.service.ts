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
import { DeleteUserDto } from './dto/delete-user.dto'
import { RedisPubSubService } from '../common/redis-pub-sub/redis-pub-sub.service'
import {
	UserWithRelations,
	UserArchiveData,
	PhotoData,
} from './interfaces/user-data.interface'

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
		private readonly storageService: StorageService,
		private readonly redisPubSubService: RedisPubSubService
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
			const { photoIds, ...userData } = dto

			return await this.prisma.$transaction(async tx => {
				// Если обновляются фотографии
				if (photoIds && photoIds.length > 0) {
					// Проверка существования фотографий
					const foundPhotos = await tx.photo.findMany({
						where: { id: { in: photoIds } },
					})

					if (foundPhotos.length !== photoIds.length) {
						const foundIds = foundPhotos.map(p => p.id)
						const missing = photoIds.filter(id => !foundIds.includes(id))
						this.logger.warn(
							`Не найдены фотографии: ${missing.join(', ')}`,
							'UserService'
						)
						return errorResponse('Некоторые фотографии не найдены')
					}

					// Отвязываем все старые фото от пользователя
					await tx.photo.updateMany({
						where: { telegramId },
						data: { telegramId: null },
					})

					// Привязываем новые фото
					await tx.photo.updateMany({
						where: { id: { in: photoIds } },
						data: { telegramId, tempTgId: null },
					})

					// Обновляем пользователя и его фото-связи
					await tx.user.update({
						where: { telegramId },
						data: {
							...userData,
							photos: {
								set: photoIds.map(id => ({ id })), // set — заменяет все старые связи
							},
						},
					})
				} else {
					// Обновляем только поля пользователя без фото
					await tx.user.update({
						where: { telegramId },
						data: userData,
					})
				}

				// Инвалидируем кеш
				await this.redisService.deleteKey(`user:${telegramId}:public_profile`)
				await this.redisService.deleteKey(`user:${telegramId}:status`)

				this.logger.debug(
					`Профиль пользователя ${telegramId} обновлён`,
					'UserService'
				)

				return successResponse(null, 'Профиль обновлён')
			})
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

	async deleteUser(dto: DeleteUserDto) {
		try {
			this.logger.debug(
				`Начало процесса удаления пользователя: ${dto.telegramId}`,
				this.CONTEXT,
				{ reason: dto.reason }
			)

			return await this.prisma.$transaction(async tx => {
				// Проверяем существование пользователя с правильной типизацией
				const user = (await tx.user.findUnique({
					where: { telegramId: dto.telegramId },
					include: {
						photos: {
							select: {
								id: true,
								key: true,
								createdAt: true,
							},
						},
						likesSent: {
							select: { id: true },
						},
						likesReceived: {
							select: { id: true },
						},
						sentComplaints: {
							select: { id: true },
						},
						receivedComplaints: {
							select: { id: true },
						},
						invitedUsers: {
							select: { telegramId: true },
						},
					},
				})) as UserWithRelations | null

				if (!user) {
					this.logger.warn(
						`Пользователь ${dto.telegramId} не найден для удаления`,
						this.CONTEXT
					)
					return errorResponse('Пользователь не найден')
				}

				this.logger.debug(
					`Найден пользователь для удаления: ${user.name} (${user.telegramId})`,
					this.CONTEXT,
					{
						photosCount: user.photos.length,
						sentLikes: user.likesSent.length,
						receivedLikes: user.likesReceived.length,
						sentComplaints: user.sentComplaints.length,
						receivedComplaints: user.receivedComplaints.length,
						invitedUsers: user.invitedUsers.length,
					}
				)

				// 1. Удаляем все фотографии пользователя из S3
				if (user.photos.length > 0) {
					this.logger.debug(
						`Удаление ${user.photos.length} фотографий из хранилища`,
						this.CONTEXT
					)

					const photoDeletePromises = user.photos.map((photo: PhotoData) =>
						this.storageService.deletePhoto(photo.key).catch(error => {
							this.logger.error(
								`Ошибка при удалении фото ${photo.key} из хранилища`,
								error?.stack,
								this.CONTEXT,
								{ error }
							)
							// Не прерываем процесс, если не удалось удалить фото из S3
						})
					)

					await Promise.all(photoDeletePromises)
				}

				// 2. Архивируем данные пользователя перед удалением
				await this.archiveUserData(user, dto.reason)

				// 3. Обновляем реферальные связи - назначаем NULL вместо удаления связанных пользователей
				if (user.invitedUsers.length > 0) {
					await tx.user.updateMany({
						where: { invitedById: dto.telegramId },
						data: { invitedById: null },
					})

					this.logger.debug(
						`Обновлены реферальные связи для ${user.invitedUsers.length} пользователей`,
						this.CONTEXT
					)
				}

				// 4. Удаляем пользователя из базы данных
				// Cascading delete автоматически удалит связанные записи:
				// - photos, likes, complaints благодаря onDelete: Cascade
				await tx.user.delete({
					where: { telegramId: dto.telegramId },
				})

				this.logger.debug(
					`Пользователь ${dto.telegramId} успешно удален из базы данных`,
					this.CONTEXT
				)

				// 5. Очищаем все кэши, связанные с пользователем
				await this.clearAllUserCaches(dto.telegramId)

				// 6. Удаляем данные пользователя из Redis (чаты, сообщения и т.д.)
				await this.cleanupUserDataFromRedis(dto.telegramId)

				// 7. Отправляем уведомления через Redis Pub/Sub
				await this.redisPubSubService.publish('user:deleted', {
					telegramId: dto.telegramId,
					reason: dto.reason,
					timestamp: Date.now(),
				})

				this.logger.log(
					`Пользователь ${dto.telegramId} полностью удален из системы`,
					this.CONTEXT
				)

				return successResponse(
					null,
					'Пользователь и все связанные данные успешно удалены'
				)
			})
		} catch (error: any) {
			this.logger.error(
				`Ошибка при удалении пользователя ${dto.telegramId}`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse('Ошибка при удалении пользователя', error)
		}
	}

	/**
	 * Архивация данных пользователя перед удалением
	 */
	private async archiveUserData(
		user: UserWithRelations,
		reason?: string
	): Promise<void> {
		try {
			const archiveData: UserArchiveData = {
				user: {
					telegramId: user.telegramId,
					name: user.name,
					town: user.town,
					age: user.age,
					bio: user.bio,
					createdAt: user.createdAt,
					role: user.role,
					status: user.status,
				},
				photos: user.photos.map((photo: PhotoData) => ({
					id: photo.id,
					key: photo.key,
					createdAt: photo.createdAt,
				})),
				statistics: {
					sentLikes: user.likesSent.length,
					receivedLikes: user.likesReceived.length,
					sentComplaints: user.sentComplaints.length,
					receivedComplaints: user.receivedComplaints.length,
					invitedUsers: user.invitedUsers.length,
				},
				deletion: {
					reason: reason || 'Не указана',
					timestamp: new Date().toISOString(),
				},
			}

			// Сохраняем архив в S3
			const archiveKey = `user_archives/${user.telegramId}_${Date.now()}.json`
			const archiveBuffer = Buffer.from(JSON.stringify(archiveData, null, 2))

			await this.storageService.uploadUserArchive(archiveKey, archiveBuffer)

			this.logger.debug(
				`Данные пользователя ${user.telegramId} архивированы в ${archiveKey}`,
				this.CONTEXT
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при архивации данных пользователя ${user.telegramId}`,
				error?.stack,
				this.CONTEXT,
				{ error }
			)
			// Не прерываем процесс удаления, если архивация не удалась
		}
	}

	/**
	 * Очистка всех кэшей пользователя
	 */
	private async clearAllUserCaches(telegramId: string): Promise<void> {
		try {
			const cacheKeys = [
				`user:${telegramId}:status`,
				`user:${telegramId}:profile`,
				`user:${telegramId}:chats`,
				`user:${telegramId}:chats_preview`,
				`user:${telegramId}:likes:sent`,
				`user:${telegramId}:likes:received`,
				`user:${telegramId}:likes:matches`,
				`user:${telegramId}:complaints:sent`,
				`user:${telegramId}:complaints:received`,
			]

			const deletePromises = cacheKeys.map(key =>
				this.redisService.deleteKey(key).catch(error => {
					this.logger.warn(
						`Ошибка при удалении кэш-ключа ${key}`,
						this.CONTEXT,
						{ error }
					)
				})
			)

			await Promise.all(deletePromises)

			this.logger.debug(
				`Очищены кэши для пользователя ${telegramId}`,
				this.CONTEXT
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при очистке кэшей пользователя ${telegramId}`,
				error?.stack,
				this.CONTEXT,
				{ error }
			)
		}
	}

	/**
	 * Очистка данных пользователя из Redis
	 */
	private async cleanupUserDataFromRedis(telegramId: string): Promise<void> {
		try {
			// Получаем все ключи, связанные с пользователем
			const userKeys = await this.redisService.getKeysByPattern(
				`*${telegramId}*`
			)

			if (userKeys.success && userKeys.data && userKeys.data.length > 0) {
				const deletePromises = userKeys.data.map(key =>
					this.redisService.deleteKey(key).catch(error => {
						this.logger.warn(
							`Ошибка при удалении Redis ключа ${key}`,
							this.CONTEXT,
							{ error }
						)
					})
				)

				await Promise.all(deletePromises)

				this.logger.debug(
					`Удалено ${userKeys.data.length} ключей из Redis для пользователя ${telegramId}`,
					this.CONTEXT
				)
			}

			// Дополнительно очищаем специфичные ключи
			const specificKeys = [
				`user:${telegramId}:status`,
				`user:${telegramId}:room`,
				`user:${telegramId}:activity`,
			]

			await Promise.all(
				specificKeys.map(key => this.redisService.deleteKey(key))
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при очистке данных пользователя из Redis`,
				error?.stack,
				this.CONTEXT,
				{ telegramId, error }
			)
		}
	}

	/**
	 * Инвалидация кэша пользователя (вспомогательный метод)
	 */
	private async invalidateUserCache(telegramId: string): Promise<void> {
		try {
			const cacheKeys = [
				`user:${telegramId}:status`,
				`user:${telegramId}:profile`,
				`user:${telegramId}:chats_preview`,
			]

			for (const key of cacheKeys) {
				await this.redisService.deleteKey(key)
			}

			this.logger.debug(
				`Кэш пользователя ${telegramId} инвалидирован`,
				this.CONTEXT
			)
		} catch (error) {
			this.logger.warn(
				`Ошибка при инвалидации кэша пользователя`,
				this.CONTEXT,
				{ telegramId, error }
			)
		}
	}
}
