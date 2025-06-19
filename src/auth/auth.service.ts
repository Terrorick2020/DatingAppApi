import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import {
	errorResponse,
	successResponse,
} from '../common/helpers/api.response.helper'
import { UserService } from '../user/user.service'
import { CreateAuthDto } from './dto/create-auth.dto'
import { UploadPhotoInternalDto } from './dto/upload-photo-internal.dto'
import { CheckAuthDto } from './dto/check-auth.dto'
import { v4 as uuidv4 } from 'uuid'
import { AppLogger } from '../common/logger/logger.service'
import { RedisService } from '../redis/redis.service'
import { LoginDto } from './dto/login.dto'
import { StorageService } from '../storage/storage.service'
import {
	PhotoResponse,
	UserProfileResponse,
} from './interfaces/auth-response.interface'
import { GeoService } from '../geo/geo.service'
import { DeletePhotoDto } from './dto/delete-photo.dto'

@Injectable()
export class AuthService {
	private readonly CONTEXT = 'AuthService'

	constructor(
		private prisma: PrismaService,
		private userService: UserService,
		private logger: AppLogger,
		private redisService: RedisService,
		private storageService: StorageService,
		private geoService: GeoService
	) {}

	async check(checkAuthDto: CheckAuthDto) {
		const telegramId = checkAuthDto.telegramId
		try {
			this.logger.debug(
				`Проверка пользователя с telegramId: ${telegramId}`,
				this.CONTEXT
			)

			// Проверяем кэш в Redis
			const cacheKey = `user:${telegramId}:status`
			const cachedStatus = await this.redisService.getKey(cacheKey)

			if (cachedStatus.success && cachedStatus.data) {
				this.logger.debug(
					`Пользователь ${telegramId} найден в кэше со статусом: ${cachedStatus.data}`,
					this.CONTEXT
				)

				return successResponse(
					cachedStatus.data,
					cachedStatus.data === 'None'
						? 'Пользователь не зарегистрирован'
						: 'Пользователь найден'
				)
			}

			// Если нет в кэше, ищем в БД
			const status = await this.userService.checkTgID(telegramId)

			// Проверяем, что статус - это строка перед сохранением в Redis
			if (typeof status === 'string') {
				// Кэшируем результат на 5 минут
				const cacheTTL = 300 // 5 минут
				await this.redisService.setKey(cacheKey, status, cacheTTL)

				if (status === 'None') {
					this.logger.debug(
						`Пользователь ${telegramId} не зарегистрирован`,
						this.CONTEXT
					)
					return successResponse(status, 'Пользователь не зарегистрирован')
				}

				this.logger.debug(
					`Пользователь ${telegramId} найден со статусом: ${status}`,
					this.CONTEXT
				)

				return successResponse(status, 'Пользователь найден')
			} else if (typeof status === 'object' && 'success' in status) {
				// Если вернулся объект ApiResponse, возвращаем его напрямую
				return status
			} else {
				// Если тип не распознан, возвращаем ошибку
				return errorResponse('Некорректный формат статуса пользователя')
			}
		} catch (error: any) {
			this.logger.error(
				`Ошибка при проверке пользователя ${telegramId}`,
				error?.stack,
				this.CONTEXT,
				{ error }
			)
			return errorResponse('Ошибка при проверке пользователя:', error)
		}
	}

	async uploadPhoto(dto: UploadPhotoInternalDto) {
		try {
			this.logger.debug(
				`Загрузка фото для пользователя ${dto.telegramId}`,
				this.CONTEXT,
				{ photoKey: dto.key }
			)

			// Считаем количество уже загруженных фото
			const photoCount = await this.prisma.photo.count({
				where: {
					OR: [{ telegramId: dto.telegramId }, { tempTgId: dto.telegramId }],
				},
			})

			if (photoCount >= 3) {
				this.logger.warn(
					`Пользователь ${dto.telegramId} попытался загрузить более 3 фото`,
					this.CONTEXT
				)
				return errorResponse('Можно загрузить не более 3 фотографий')
			}

			// Сохраняем фото, если лимит не превышен
			const photo = await this.prisma.photo.create({
				data: {
					key: dto.key,
					tempTgId: dto.telegramId,
				},
			})

			this.logger.debug(
				`Фото успешно сохранено с ID: ${photo.id}`,
				this.CONTEXT
			)

			return successResponse({ photoId: photo.id }, 'Фото временно сохранено')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при загрузке фото для пользователя ${dto.telegramId}`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse('Ошибка при загрузке фото:', error)
		}
	}

	async register(dto: CreateAuthDto) {
		try {
			this.logger.debug(
				`Начало регистрации пользователя: ${dto.telegramId}`,
				this.CONTEXT
			)

			return await this.prisma.$transaction(async tx => {
				const {
					telegramId,
					photoIds,
					invitedByReferralCode,
					interestId,
					latitude,
					longitude,
					enableGeo,
					town, // Может быть переопределен из геолокации
					...userData
				} = dto

				// Проверяем существование пользователя
				const existingUser = await tx.user.findUnique({
					where: { telegramId },
				})

				if (existingUser) {
					this.logger.warn(
						`Попытка повторной регистрации пользователя ${telegramId}`,
						this.CONTEXT
					)
					return errorResponse('Пользователь уже существует')
				}

				// Проверяем наличие фотографий
				const photos = await tx.photo.findMany({
					where: { id: { in: photoIds } },
				})

				if (photos.length !== photoIds.length) {
					const foundIds = photos.map(p => p.id)
					const missingIds = photoIds.filter(id => !foundIds.includes(id))
					this.logger.warn(
						`Не найдены фотографии: ${missingIds.join(', ')}`,
						this.CONTEXT
					)
					return errorResponse('Некоторые фотографии не найдены в базе данных')
				}

				// Проверяем интерес
				const interest = await tx.interest.findUnique({
					where: { id: interestId },
				})

				if (!interest) {
					this.logger.warn(
						`Указан несуществующий интерес: ${interestId}`,
						this.CONTEXT
					)
					return errorResponse('Выбранный интерес не существует')
				}

				// ⭐ ОБРАБОТКА ГЕОЛОКАЦИИ
				let finalTown = town
				let finalLatitude = latitude
				let finalLongitude = longitude

				if (enableGeo && latitude && longitude) {
					this.logger.debug(
						`Определение города по координатам: ${latitude}, ${longitude}`,
						this.CONTEXT
					)

					try {
						// Определяем город по координатам
						const geoResult = await this.geoService.getCityByCoordinates({
							latitude,
							longitude,
							enableGeo: true,
						})

						if (geoResult.success && geoResult.data?.city) {
							finalTown = geoResult.data.city
							this.logger.debug(
								`Город определен по координатам: ${finalTown}`,
								this.CONTEXT
							)
						} else {
							this.logger.warn(
								`Не удалось определить город по координатам, используем указанный: ${town}`,
								this.CONTEXT
							)
						}
					} catch (geoError: any) {
						this.logger.error(
							`Ошибка при определении города по координатам`,
							geoError?.stack,
							this.CONTEXT,
							{ latitude, longitude, error: geoError }
						)
						// Продолжаем с указанным городом
					}
				}

				// Обработка реферального кода
				let invitedById: string | undefined = undefined
				if (invitedByReferralCode) {
					const inviter = await tx.user.findUnique({
						where: { referralCode: invitedByReferralCode },
					})

					if (inviter) {
						invitedById = inviter.telegramId
						this.logger.debug(
							`Пользователь приглашен по коду от: ${invitedById}`,
							this.CONTEXT
						)
					}
				}

				// Создаем уникальный реферальный код
				const referralCode = uuidv4().slice(0, 8)

				// ⭐ СОЗДАЕМ ПОЛЬЗОВАТЕЛЯ С КООРДИНАТАМИ
				const createdUser = await tx.user.create({
					data: {
						...userData,
						telegramId,
						town: finalTown, // Используем определенный или указанный город
						enableGeo,
						latitude: enableGeo ? finalLatitude : null,
						longitude: enableGeo ? finalLongitude : null,
						referralCode,
						interest: { connect: { id: interestId } },
						photos: {
							connect: photoIds.map(id => ({ id })),
						},
						...(invitedById !== undefined
							? { invitedBy: { connect: { telegramId: invitedById } } }
							: {}),
					},
				})

				// Обновляем связи фотографий
				await tx.photo.updateMany({
					where: {
						tempTgId: telegramId,
						telegramId: null,
					},
					data: {
						telegramId,
						tempTgId: null,
					},
				})

				this.logger.debug(
					`Пользователь ${telegramId} успешно создан с геолокацией: ${enableGeo}`,
					this.CONTEXT,
					{
						town: finalTown,
						hasCoordinates: !!(finalLatitude && finalLongitude),
						coordinates: enableGeo
							? { lat: finalLatitude, lng: finalLongitude }
							: null,
					}
				)

				return successResponse(
					{
						user: {
							telegramId: createdUser.telegramId,
							town: finalTown,
							enableGeo,
							coordinates: enableGeo
								? { latitude: finalLatitude, longitude: finalLongitude }
								: null,
						},
					},
					'Пользователь создан и фото привязаны'
				)
			})
		} catch (error: any) {
			this.logger.error(
				`Ошибка при регистрации пользователя: ${dto.telegramId}`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse('Ошибка при регистрации пользователя', error)
		}
	}

	async login(loginDto: LoginDto) {
		const { telegramId } = loginDto

		try {
			this.logger.debug(`Авторизация пользователя: ${telegramId}`, this.CONTEXT)

			// // Проверяем кэш профиля пользователя
			// const cacheKey = `user:${telegramId}:profile`
			// const cachedProfile = await this.redisService.getKey(cacheKey)

			// if (cachedProfile.success && cachedProfile.data) {
			// 	try {
			// 		const profile = JSON.parse(cachedProfile.data)
			// 		this.logger.debug(
			// 			`Профиль пользователя ${telegramId} получен из кэша`,
			// 			this.CONTEXT
			// 		)
			// 		return successResponse(
			// 			profile,
			// 			'Профиль пользователя получен из кэша'
			// 		)
			// 	} catch (e) {
			// 		this.logger.warn(
			// 			`Ошибка парсинга кэша профиля для ${telegramId}`,
			// 			this.CONTEXT,
			// 			{ error: e }
			// 		)
			// 	}
			// }

			// Получаем полные данные пользователя из БД
			const user = await this.prisma.user.findUnique({
				where: {
					telegramId,
					status: { not: 'Blocked' },
				},
				include: {
					photos: {
						select: {
							id: true,
							key: true,
						},
						orderBy: { createdAt: 'asc' },
					},
					interest: {
						select: {
							id: true,
							value: true,
							label: true,
							isOppos: true,
						},
					},
					invitedBy: {
						select: {
							telegramId: true,
							name: true,
						},
					},
					invitedUsers: {
						select: {
							telegramId: true,
							name: true,
						},
						take: 10,
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

			// ⭐ Генерируем presigned URLs для фотографий с ID
			const photoPromises = user.photos.map(async photo => {
				try {
					const presignedUrl = await this.storageService.getPresignedUrl(
						photo.key,
						7200
					) // 2 часа
					return {
						id: photo.id,
						url: presignedUrl,
					}
				} catch (error) {
					this.logger.warn(
						`Ошибка получения presigned URL для фото ID ${photo.id}, key: ${photo.key}`,
						this.CONTEXT,
						{ error, photoId: photo.id, photoKey: photo.key }
					)
					return null
				}
			})

			const photoResults = await Promise.all(photoPromises)
			const validPhotos = photoResults.filter(
				photo => photo !== null
			) as PhotoResponse[]

			// Формируем ответ
			const userProfile: UserProfileResponse = {
				telegramId: user.telegramId,
				name: user.name,
				town: user.town,
				sex: user.sex,
				selSex: user.selSex,
				age: user.age,
				bio: user.bio,
				lang: user.lang,
				enableGeo: user.enableGeo,
				isVerify: user.isVerify,
				latitude: user.latitude || undefined,
				longitude: user.longitude || undefined,
				role: user.role,
				status: user.status,
				referralCode: user.referralCode || undefined,
				createdAt: user.createdAt.toISOString(),
				updatedAt: user.updatedAt.toISOString(),
				photos: validPhotos,
				interest: user.interest,
				invitedBy: user.invitedBy || undefined,
				invitedUsers: user.invitedUsers,
			}

			// Кэшируем профиль на 10 минут
			// const cacheTTL = 600
			// await this.redisService.setKey(
			// 	cacheKey,
			// 	JSON.stringify(userProfile),
			// 	cacheTTL
			// )

			// Обновляем кэш статуса пользователя
			await this.redisService.setKey(
				`user:${telegramId}:status`,
				user.status,
				300
			)

			this.logger.debug(
				`Профиль пользователя ${telegramId} успешно получен`,
				this.CONTEXT,
				{
					photosCount: validPhotos.length,
					totalPhotosInDb: user.photos.length,
					failedPhotos: user.photos.length - validPhotos.length,
				}
			)

			return successResponse(userProfile, 'Авторизация успешна')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при авторизации пользователя ${telegramId}`,
				error?.stack,
				this.CONTEXT,
				{ error }
			)
			return errorResponse('Ошибка при авторизации пользователя', error)
		}
	}

	async deletePhoto(dto: DeletePhotoDto) {
		try {
			this.logger.debug(
				`Удаление фото ${dto.photoId} для пользователя ${dto.telegramId}`,
				this.CONTEXT
			)

			return await this.prisma.$transaction(async tx => {
				// Проверяем существование пользователя
				const user = await tx.user.findUnique({
					where: { telegramId: dto.telegramId },
					include: { photos: true },
				})

				if (!user) {
					this.logger.warn(
						`Пользователь ${dto.telegramId} не найден при удалении фото`,
						this.CONTEXT
					)
					return errorResponse('Пользователь не найден')
				}

				// Проверяем существование фото и принадлежность пользователю
				const photo = await tx.photo.findFirst({
					where: {
						id: dto.photoId,
						telegramId: dto.telegramId,
					},
				})

				if (!photo) {
					this.logger.warn(
						`Фото ${dto.photoId} не найдено или не принадлежит пользователю ${dto.telegramId}`,
						this.CONTEXT
					)
					return errorResponse('Фотография не найдена или не принадлежит вам')
				}

				// Проверяем, не последняя ли это фотография
				if (user.photos.length <= 1) {
					this.logger.warn(
						`Попытка удалить единственную фотографию пользователя ${dto.telegramId}`,
						this.CONTEXT
					)
					return errorResponse(
						'Нельзя удалить последнюю фотографию. У вас должна быть хотя бы одна фотография'
					)
				}

				// Удаляем фото из базы данных
				await tx.photo.delete({
					where: { id: dto.photoId },
				})

				// Удаляем фото из S3
				try {
					await this.storageService.deletePhoto(photo.key)
					this.logger.debug(
						`Фото ${photo.key} успешно удалено из хранилища`,
						this.CONTEXT
					)
				} catch (storageError: any) {
					this.logger.error(
						`Ошибка при удалении фото из хранилища: ${photo.key}`,
						storageError?.stack,
						this.CONTEXT,
						{ error: storageError }
					)
					// Продолжаем выполнение, так как фото уже удалено из БД
				}

				// Инвалидируем кэш пользователя
				await this.invalidateUserCache(dto.telegramId)

				this.logger.debug(
					`Фото ${dto.photoId} успешно удалено для пользователя ${dto.telegramId}`,
					this.CONTEXT
				)

				return successResponse('Фотография успешно удалена')
			})
		} catch (error: any) {
			this.logger.error(
				`Ошибка при удалении фото ${dto.photoId} для пользователя ${dto.telegramId}`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse('Ошибка при удалении фотографии', error)
		}
	}

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
