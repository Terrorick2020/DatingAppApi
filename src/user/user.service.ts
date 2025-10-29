import { Injectable } from '@nestjs/common'
import { Status } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import {
	errorResponse,
	successResponse,
} from '../common/helpers/api.response.helper'
import { ApiResponse } from '../common/interfaces/api-response.interface'
import { AppLogger } from '../common/logger/logger.service'
import { RedisPubSubService } from '../common/redis-pub-sub/redis-pub-sub.service'
import { RedisService } from '../redis/redis.service'
import { StorageService } from '../storage/storage.service'
import { DeleteUserDto } from './dto/delete-user.dto'
import { FindAllUsersDto } from './dto/find-all-users.dto'
import { FindQuestsQueryDto } from './dto/find-quests.dto'
import { PublicUserDto } from './dto/public-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import {
	PhotoData,
	UserArchiveData,
	UserWithRelations,
} from './interfaces/user-data.interface'

import type { QuestItem } from './interfaces/quests.interface'

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

	/**
	 * Получение значений городов по названию (для фильтрации)
	 */
	private async getCityValuesByLabel(label: string): Promise<string[]> {
		try {
			const cities = await this.prisma.cityes.findMany({
				where: {
					OR: [
						{ label: { contains: label, mode: 'insensitive' } },
						{ value: { contains: label, mode: 'insensitive' } },
					],
				},
				select: { value: true },
			})
			return cities.map(city => city.value)
		} catch (error) {
			this.logger.warn(
				`Ошибка при поиске городов по названию: ${label}`,
				this.CONTEXT,
				{ error }
			)
			return []
		}
	}
	async findAll(params: FindAllUsersDto) {
		try {
			const {
				telegramId,
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
				filterBySameCity = true,
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

			// Фильтрация по городу - только если передан telegramId (не админка)
			if (telegramId && filterBySameCity) {
				// Получаем город текущего пользователя
				const currentUser = await this.prisma.user.findUnique({
					where: { telegramId },
					select: { town: true },
				})

				if (currentUser?.town) {
					// Фильтруем по городу текущего пользователя
					const cityValues = await this.getCityValuesByLabel(currentUser.town)
					if (cityValues.length > 0) {
						where.OR = [
							{ town: { contains: currentUser.town, mode: 'insensitive' } },
							{ town: { in: cityValues } },
						]
					} else {
						where.town = { contains: currentUser.town, mode: 'insensitive' }
					}

					this.logger.debug(
						`Применена фильтрация по городу текущего пользователя: ${currentUser.town}`,
						this.CONTEXT,
						{ cityValues }
					)
				}
			} else if (town) {
				// Фильтрация по городу - ищем по частичному совпадению в поле town
				// Также ищем по названию города в таблице cityes
				const cityValues = await this.getCityValuesByLabel(town)
				if (cityValues.length > 0) {
					where.OR = [
						{ town: { contains: town, mode: 'insensitive' } },
						{ town: { in: cityValues } },
					]
				} else {
					where.town = { contains: town, mode: 'insensitive' }
				}
				this.logger.debug(
					`Применена фильтрация по городу: ${town}`,
					this.CONTEXT,
					{ cityValues }
				)
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

			// Исключаем пользователей, с которыми уже есть матч - только если передан telegramId (не админка)
			if (telegramId) {
				const existingMatches = await this.prisma.like.findMany({
					where: {
						OR: [
							{ fromUserId: telegramId, isMatch: true },
							{ toUserId: telegramId, isMatch: true },
						],
					},
					select: {
						fromUserId: true,
						toUserId: true,
					},
				})

				// Собираем всех пользователей, с которыми уже есть матч
				const matchedUserIds = new Set<string>()
				existingMatches.forEach(match => {
					if (match.fromUserId === telegramId) {
						matchedUserIds.add(match.toUserId)
					} else {
						matchedUserIds.add(match.fromUserId)
					}
				})

				// Добавляем текущего пользователя в список исключений
				matchedUserIds.add(telegramId)

				// Исключаем текущего пользователя и пользователей с матчами из результатов
				if (matchedUserIds.size > 0) {
					where.telegramId = {
						not: {
							in: Array.from(matchedUserIds),
						},
					}

					this.logger.debug(
						`Исключены пользователи с матчами и текущий пользователь: ${Array.from(matchedUserIds).join(', ')}`,
						this.CONTEXT
					)
				}
			}

			// Получаем общее количество записей для метаданных пагинации
			this.logger.debug(`Выполняется запрос с фильтрами:`, this.CONTEXT, {
				where,
			})
			const totalCount = await this.prisma.user.count({ where })

			// Получаем записи с учетом пагинации, сортировки и фильтрации
			const users = await this.prisma.user.findMany({
				where,
				skip,
				take: limit,
				orderBy,
				include: { photos: true, userPlans: true, interest: true },
			})

			this.logger.debug(
				`Найдено пользователей: ${users.length} из ${totalCount}`,
				this.CONTEXT
			)

			const usersWithPhotoUrls = await Promise.all(
				users.map(async u => {
					const userPlan = u.userPlans[0]

					return {
						...u,
						photos: await this.getPhotoUrlsWithIds(u.photos), // кеш + signed url
						city: await this.prisma.cityes.findUnique({
							where: { value: u.town },
						}),
						plan: userPlan
							? await this.prisma.plans.findUnique({
									where: { id: userPlan.planId },
								})
							: null,
						region: userPlan
							? await this.prisma.regions.findUnique({
									where: { id: userPlan.regionId },
								})
							: null,
						interest: u.interest?.label || null,
					}
				})
			)

			// Метаданные пагинации
			const pagination = {
				page,
				limit,
				totalCount,
				totalPages: Math.ceil(totalCount / limit),
				hasNext: page * limit < totalCount,
				hasPrevious: page > 1,
			}

			return successResponse(
				usersWithPhotoUrls,
				'Список пользователей получен',
				{
					pagination,
				}
			)
		} catch (error) {
			return errorResponse('Ошибка при получении пользователей', error)
		}
	}

	async findQuests({
		telegramId,
		limit = 15,
		offset = 0,
	}: FindQuestsQueryDto): Promise<ApiResponse<QuestItem[]>> {
		try {
			const user = await this.prisma.user.findUnique({
				where: { telegramId },
				include: { userPlans: true, interest: true },
			})

			if (!user) {
				return successResponse([], 'Пользователь не найден')
			}

			const likes = await this.prisma.like.findMany({
				where: { fromUserId: telegramId },
				select: { toUserId: true },
			})

			const likedIds = likes.map(like => like.toUserId)

			const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

			// Базовые фильтры (жесткие)
			const baseWhere = {
				telegramId: {
					notIn: [user.telegramId, ...likedIds], // Исключаем самого пользователя и лайкнутых
				},
				status: { not: Status.Blocked }, // Исключаем заблокированных
				userPlans: {
					some: {
						updatedAt: {
							gte: twentyFourHoursAgo,
						},
					},
				}, // Планы обновлены за последние 24 часа
			}

			// Получаем всех пользователей с базовыми фильтрами
			const allUsers = await this.prisma.user.findMany({
				where: baseWhere,
				include: { photos: true, userPlans: true, interest: true },
			})

			// Группируем пользователей по приоритету
			const priorityGroups: {
				group1: typeof allUsers
				group2: typeof allUsers
				group3: typeof allUsers
				group4: typeof allUsers
			} = {
				group1: [], // Совпадают интересы И планы
				group2: [], // Совпадают интересы, разные планы
				group3: [], // Разные интересы, совпадают планы
				group4: [], // Все остальные
			}

			for (const u of allUsers) {
				const userPlan = u.userPlans[0]
				const currentUserPlan = user.userPlans[0]

				const sameInterest = user.interestId === u.interestId
				const samePlan = currentUserPlan?.planId === userPlan?.planId

				if (sameInterest && samePlan) {
					priorityGroups.group1.push(u)
				} else if (sameInterest && !samePlan) {
					priorityGroups.group2.push(u)
				} else if (!sameInterest && samePlan) {
					priorityGroups.group3.push(u)
				} else {
					priorityGroups.group4.push(u)
				}
			}

			// Объединяем группы в правильном порядке приоритета
			const prioritizedUsers = [
				...priorityGroups.group1,
				...priorityGroups.group2,
				...priorityGroups.group3,
				...priorityGroups.group4,
			]

			// Применяем пагинацию
			const paginatedUsers = prioritizedUsers.slice(offset, offset + limit)

			const result: QuestItem[] = await Promise.all(
				paginatedUsers.map(async u => {
					const city = await this.prisma.cityes.findUnique({
						where: { value: u.town },
					})

					const [plan, region] = await Promise.all([
						this.prisma.plans.findUnique({
							where: { id: u.userPlans[0].planId },
						}),
						this.prisma.regions.findUnique({
							where: { id: u.userPlans[0].regionId },
						}),
					])

					return {
						id: u.telegramId,
						name: u.name,
						age: u.age,
						city: city!.label,
						description: u.userPlans[0].planDescription,
						plans: {
							date: 'Планы на сегодня',
							content: `${plan!.label}, ${region!.label}`,
						},
						photos: (await this.getPhotoUrlsWithIds(u.photos)).map(
							item => item.url
						),
						interest: u.interest?.label || null,
					}
				})
			)

			return successResponse(result, 'Анкеты успешно получены')
		} catch (error: any) {
			return errorResponse('Ошибка при получении анкет', error)
		}
	}

	async findByTelegramId(telegramId: string): Promise<ApiResponse<any>> {
		try {
			// Сначала ищем среди обычных пользователей
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

			if (user) {
				// Используем метод кеширования для получения URL фотографий
				const [photoUrls, lineStatus, cityRes] = await Promise.all([
					this.getPhotoUrlsWithIds(user.photos),
					this.redisService.getKey(`user:${user.telegramId}:status`),
					this.prisma.cityes.findUnique({ where: { value: user.town } }),
				])

				return successResponse(
					{
						...user,
						photos: photoUrls,
						isOnline: lineStatus.success ? lineStatus.data : lineStatus.success,
						city: cityRes,
						type: 'user',
					},
					'Пользователь найден'
				)
			}

			// Если не найден среди пользователей, ищем среди психологов
			const psychologist = await this.prisma.psychologist.findUnique({
				where: { telegramId },
				include: {
					photos: {
						select: {
							id: true,
							key: true,
						},
					},
				},
			})

			if (psychologist) {
				// Получаем URL фотографий для психолога
				const photoUrls = await this.getPhotoUrlsWithIds(psychologist.photos)

				return successResponse(
					{
						...psychologist,
						photos: photoUrls,
						isOnline: false, // У психологов нет статуса онлайн
						city: null, // У психологов нет города
						interest: null, // У психологов нет интересов
						type: 'psychologist',
					},
					'Психолог найден'
				)
			}

			return errorResponse('Пользователь не найден')
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

	async searchUsers(query: string) {
		try {
			if (!query || query.trim() === '') {
				return successResponse([], 'Пустой запрос')
			}

			const users = await this.prisma.user.findMany({
				where: {
					OR: [
						{
							name: {
								contains: query,
								mode: 'insensitive',
							},
						},
						{
							telegramId: {
								startsWith: query,
							},
						},
					],
				},
				include: {
					photos: true,
					userPlans: true,
				},
			})

			const usersWithData = await Promise.all(
				users.map(async u => ({
					...u,
					photos: await this.getPhotoUrlsWithIds(u.photos),
					city: await this.prisma.cityes.findUnique({
						where: { value: u.town },
					}),
					plan: await this.prisma.plans.findUnique({
						where: { id: u.userPlans[0].planId },
					}),
					region: await this.prisma.regions.findUnique({
						where: { id: u.userPlans[0].regionId },
					}),
				}))
			)

			return successResponse(usersWithData, 'Результаты поиска')
		} catch (error) {
			return errorResponse('Ошибка при поиске пользователей', error)
		}
	}
}
