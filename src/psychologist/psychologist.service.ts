import {
	errorResponse,
	successResponse,
} from '@/common/helpers/api.response.helper'
import type { ApiResponse } from '@/common/interfaces/api-response.interface'

import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '~/prisma/prisma.service'
import { AppLogger } from '../common/logger/logger.service'
import { RedisService } from '../redis/redis.service'
import { StorageService } from '../storage/storage.service'
import { CheckPsychologistDto } from './dto/check-psychologist.dto'
import { CreatePsychologistDto } from './dto/create-psychologist.dto'
import { DeletePsychologistDto } from './dto/delete-psychologist.dto'
import { FindPsychologistBySelectorDto } from './dto/find-psychologist-by-selector.dto'
import { FindPsychologistsDto } from './dto/find-psychologists.dto'
import { RegisterByInviteDto } from './dto/register-by-invite.dto'
import { UpdatePsychologistDto } from './dto/update-psychologist.dto'
import type {
	CreatePsychologistResponse,
	Psychologist,
	PsychologistPhotoResponse,
	PsychologistPreview,
	PsychologistsListResponse,
} from './psychologist.types'

// Типы для Prisma
interface PsychologistWithPhotos {
	id: number
	telegramId: string
	name: string
	about: string
	status: string
	createdAt: Date
	updatedAt: Date
	photos: Array<{
		id: number
		key: string
		tempTgId: string | null
		telegramId: string | null
		createdAt: Date
	}>
}

@Injectable()
export class PsychologistService {
	private readonly CONTEXT = 'PsychologistService'

	constructor(
		private readonly prisma: PrismaService,
		private readonly storageService: StorageService,
		private readonly logger: AppLogger,
		private readonly configService: ConfigService,
		private readonly redisService: RedisService
	) {}

	/**
	 * Генерация presigned URL для фотографий психолога с кешированием
	 */
	private async getPsychologistPhotoUrls(
		photos: { id: number; key: string }[]
	): Promise<PsychologistPhotoResponse[]> {
		this.logger.debug(
			`Получаем URL для ${photos.length} фотографий психолога`,
			this.CONTEXT
		)

		const photoResponses: PsychologistPhotoResponse[] = []

		for (const photo of photos) {
			this.logger.debug(
				`Обрабатываем фото ID: ${photo.id}, key: ${photo.key}`,
				this.CONTEXT
			)

			const cacheKey = `psychologist_photo:${photo.id}:url`

			// Проверяем кеш по ID фотографии
			const cachedUrl = await this.redisService.getKey(cacheKey)

			if (cachedUrl.success && cachedUrl.data) {
				this.logger.debug(
					`URL фото психолога ID ${photo.id} получен из кеша`,
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
					`Presigned URL создан и закеширован для фото психолога ID ${photo.id}`,
					this.CONTEXT
				)
			} catch (error: any) {
				this.logger.warn(
					`Пропускаем фото психолога ID ${photo.id} из-за ошибки: ${error.message}`,
					this.CONTEXT,
					{ photoId: photo.id, photoKey: photo.key, error }
				)
			}
		}

		this.logger.debug(
			`Возвращаем ${photoResponses.length} URL фотографий`,
			this.CONTEXT
		)

		return photoResponses
	}

	/**
	 * Преобразование данных психолога из Prisma в наш формат
	 */
	private async transformPsychologistData(
		psychologist: any
	): Promise<Psychologist> {
		// Получаем URL фотографий
		const photoUrls = await this.getPsychologistPhotoUrls(psychologist.photos)

		return {
			id: psychologist.id,
			telegramId: psychologist.telegramId,
			name: psychologist.name,
			about: psychologist.about,
			status: psychologist.status as 'Active' | 'Inactive' | 'Blocked',
			createdAt: psychologist.createdAt,
			updatedAt: psychologist.updatedAt,
			photos: photoUrls,
		}
	}

	/**
	 * Преобразование данных психолога для превью
	 */
	private async transformPsychologistPreview(
		psychologist: PsychologistWithPhotos
	): Promise<PsychologistPhotoResponse[]> {
		// Получаем URL фотографий
		return await this.getPsychologistPhotoUrls(psychologist.photos)
	}

	/**
	 * Сохранение фотографий для психолога
	 */
	async savePhotos(telegramId: string, photoKeys: string[]) {
		try {
			this.logger.debug(
				`Сохранение фотографий для психолога ${telegramId}`,
				this.CONTEXT,
				{ photoKeys }
			)

			const photos = photoKeys.map(key => ({
				key,
				telegramId,
			}))

			await this.prisma.psychologistPhoto.createMany({ data: photos })

			this.logger.debug(
				`Фотографии для психолога ${telegramId} успешно сохранены`,
				this.CONTEXT
			)

			return successResponse(null, 'Фотографии сохранены')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при сохранении фотографий психолога`,
				error?.stack,
				this.CONTEXT,
				{ telegramId, photoKeys, error }
			)
			return errorResponse('Ошибка при сохранении фото', error)
		}
	}

	/**
	 * Загрузка фотографии для психолога
	 */
	async uploadPhoto(telegramId: string, photoKey: string) {
		try {
			this.logger.debug(
				`Загрузка фото для психолога ${telegramId}`,
				this.CONTEXT,
				{ photoKey }
			)

			// Считаем количество уже загруженных фото
			const photoCount = await this.prisma.psychologistPhoto.count({
				where: {
					OR: [{ telegramId }, { tempTgId: telegramId }],
				},
			})

			if (photoCount >= 5) {
				this.logger.warn(
					`Психолог ${telegramId} попытался загрузить более 5 фото`,
					this.CONTEXT
				)
				return errorResponse('Можно загрузить не более 5 фотографий')
			}

			// Сохраняем фото, если лимит не превышен
			const photo = await this.prisma.psychologistPhoto.create({
				data: {
					key: photoKey,
					tempTgId: telegramId,
				},
			})

			this.logger.debug(
				`Фото психолога успешно сохранено с ID: ${photo.id}`,
				this.CONTEXT
			)

			return successResponse({ photoId: photo.id }, 'Фото временно сохранено')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при загрузке фото для психолога ${telegramId}`,
				error?.stack,
				this.CONTEXT,
				{ telegramId, photoKey, error }
			)
			return errorResponse('Ошибка при загрузке фото:', error)
		}
	}

	/**
	 * Удаление фотографии психолога
	 */
	async deletePhoto(photoId: number, telegramId: string) {
		try {
			this.logger.debug(
				`Удаление фото ${photoId} для психолога ${telegramId}`,
				this.CONTEXT
			)

			// Проверяем существование фотографии
			const photo = await this.prisma.psychologistPhoto.findFirst({
				where: {
					id: photoId,
					OR: [{ telegramId }, { tempTgId: telegramId }],
				},
			})

			if (!photo) {
				this.logger.warn(
					`Фото ${photoId} не найдено для психолога ${telegramId}`,
					this.CONTEXT
				)
				return errorResponse('Фотография не найдена')
			}

			// Удаляем фотографию
			await this.prisma.psychologistPhoto.delete({
				where: { id: photoId },
			})

			// Инвалидируем кеш
			await this.redisService.deleteKey(`psychologist_photo:${photoId}:url`)

			this.logger.debug(
				`Фото ${photoId} для психолога ${telegramId} успешно удалено`,
				this.CONTEXT
			)

			return successResponse(null, 'Фотография удалена')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при удалении фото психолога`,
				error?.stack,
				this.CONTEXT,
				{ photoId, telegramId, error }
			)
			return errorResponse('Ошибка при удалении фотографии', error)
		}
	}

	/**
	 * Создание нового психолога
	 */
	async create(
		dto: CreatePsychologistDto
	): Promise<ApiResponse<CreatePsychologistResponse>> {
		try {
			this.logger.debug(
				`Создание психолога с telegramId ${dto.telegramId}`,
				this.CONTEXT
			)

			// Проверяем, не существует ли уже психолог с таким telegramId
			const existingPsychologist = await this.prisma.psychologist.findUnique({
				where: { telegramId: dto.telegramId },
			})

			if (existingPsychologist) {
				this.logger.warn(
					`Попытка создать психолога с существующим telegramId ${dto.telegramId}`,
					this.CONTEXT
				)
				return errorResponse('Психолог с таким Telegram ID уже существует')
			}

			return await this.prisma.$transaction(async (tx: any) => {
				const { photoIds, ...userData } = dto

				this.logger.debug(
					`Начинаем создание психолога. photoIds: ${JSON.stringify(photoIds)}`,
					this.CONTEXT
				)

				// Проверяем наличие фотографий
				if (photoIds && photoIds.length > 0) {
					this.logger.debug(
						`Проверяем наличие фотографий: ${photoIds.join(', ')}`,
						this.CONTEXT
					)

					const photos = await tx.psychologistPhoto.findMany({
						where: {
							id: { in: photoIds },
							tempTgId: dto.telegramId,
						},
					})

					this.logger.debug(
						`Найдено фотографий: ${photos.length}, ожидалось: ${photoIds.length}`,
						this.CONTEXT
					)

					// Логируем детали найденных фотографий
					photos.forEach((photo: any) => {
						this.logger.debug(
							`Фото ID: ${photo.id}, key: ${photo.key}, telegramId: ${photo.telegramId}, tempTgId: ${photo.tempTgId}`,
							this.CONTEXT
						)
					})

					if (photos.length !== photoIds.length) {
						const foundIds = photos.map((p: any) => p.id)
						const missingIds = photoIds.filter(id => !foundIds.includes(id))
						this.logger.warn(
							`Не найдены фотографии: ${missingIds.join(', ')}`,
							this.CONTEXT
						)
						return errorResponse(
							'Некоторые фотографии не найдены в базе данных'
						)
					}
				} else {
					this.logger.debug(
						`Фотографии не переданы или пустой массив`,
						this.CONTEXT
					)
				}

				// Создаем нового психолога
				const psychologist = await tx.psychologist.create({
					data: {
						telegramId: dto.telegramId,
						name: dto.name,
						about: dto.about,
						status: 'Active',
					},
					include: {
						photos: true,
					},
				})

				this.logger.debug(
					`Психолог ${psychologist.id} создан. Привязываем фотографии...`,
					this.CONTEXT
				)

				// Привязываем фотографии к психологу ПОСЛЕ создания психолога
				if (photoIds && photoIds.length > 0) {
					this.logger.debug(
						`Обновляем фотографии с telegramId: ${dto.telegramId}`,
						this.CONTEXT
					)

					const updateResult = await tx.psychologistPhoto.updateMany({
						where: { id: { in: photoIds } },
						data: { telegramId: dto.telegramId, tempTgId: null },
					})

					this.logger.debug(
						`Обновлено фотографий: ${updateResult.count}`,
						this.CONTEXT
					)
				}

				// Получаем обновленные данные психолога с фотографиями
				const updatedPsychologist = await tx.psychologist.findUnique({
					where: { id: psychologist.id },
					include: {
						photos: {
							orderBy: { createdAt: 'asc' },
						},
					},
				})

				this.logger.debug(
					`Психолог ${psychologist.id} успешно создан`,
					this.CONTEXT
				)

				const transformedData =
					await this.transformPsychologistData(updatedPsychologist)

				return successResponse(
					{
						psychologist: transformedData,
						message: 'Психолог успешно зарегистрирован',
					},
					'Психолог создан'
				)
			})
		} catch (error: any) {
			this.logger.error(
				`Ошибка при создании психолога`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse('Ошибка при создании психолога', error)
		}
	}

	/**
	 * Получение списка психологов
	 */
	async findAll(
		dto: FindPsychologistsDto
	): Promise<ApiResponse<PsychologistsListResponse>> {
		try {
			const { search = '', limit = 10, offset = 0 } = dto

			this.logger.debug(
				`Поиск психологов: search="${search}", limit=${limit}, offset=${offset}`,
				this.CONTEXT
			)

			const where: any = {
				status: 'Active',
			}

			if (search) {
				where.OR = [
					{ name: { contains: search, mode: 'insensitive' } },
					{ about: { contains: search, mode: 'insensitive' } },
				]
			}

			const [psychologists, total] = await Promise.all([
				this.prisma.psychologist.findMany({
					where,
					include: {
						photos: {
							orderBy: { createdAt: 'asc' },
						},
					},
					orderBy: { createdAt: 'desc' },
					take: limit,
					skip: offset,
				}),
				this.prisma.psychologist.count({ where }),
			])

			const previews: PsychologistPreview[] = await Promise.all(
				psychologists.map(async (psychologist: PsychologistWithPhotos) => ({
					id: psychologist.id,
					telegramId: psychologist.telegramId,
					name: psychologist.name,
					about: psychologist.about,
					photos: await this.transformPsychologistPreview(psychologist),
				}))
			)

			this.logger.debug(
				`Найдено психологов: ${psychologists.length} из ${total}`,
				this.CONTEXT
			)

			return successResponse(
				{ psychologists: previews, total },
				'Список психологов получен'
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при получении списка психологов`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse('Ошибка при получении списка психологов', error)
		}
	}

	/**
	 * Получение списка доступных психологов
	 */
	async findAllExcludingExistingChats(
		dto: FindPsychologistsDto & { userTelegramId: string }
	): Promise<ApiResponse<PsychologistsListResponse>> {
		try {
			const { search = '', limit = 10, offset = 0, userTelegramId } = dto

			this.logger.debug(
				`Поиск доступных психологов: search="${search}", limit=${limit}, offset=${offset}, userTelegramId=${userTelegramId}`,
				this.CONTEXT
			)

			// Психологи доступны всем пользователям, исключений нет
			const where: any = {
				status: 'Active',
			}

			if (search) {
				where.OR = [
					{ name: { contains: search, mode: 'insensitive' } },
					{ about: { contains: search, mode: 'insensitive' } },
				]
			}

			const [psychologists, total] = await Promise.all([
				this.prisma.psychologist.findMany({
					where,
					include: {
						photos: {
							orderBy: { createdAt: 'asc' },
						},
					},
					orderBy: { createdAt: 'desc' },
					take: limit,
					skip: offset,
				}),
				this.prisma.psychologist.count({ where }),
			])

			const previews: PsychologistPreview[] = await Promise.all(
				psychologists.map(async (psychologist: PsychologistWithPhotos) => ({
					id: psychologist.id,
					telegramId: psychologist.telegramId,
					name: psychologist.name,
					about: psychologist.about,
					photos: await this.transformPsychologistPreview(psychologist),
				}))
			)

			this.logger.debug(
				`Найдено доступных психологов: ${psychologists.length} из ${total}`,
				this.CONTEXT
			)

			return successResponse(
				{ psychologists: previews, total },
				'Список доступных психологов получен'
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при получении списка доступных психологов`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse(
				'Ошибка при получении списка доступных психологов',
				error
			)
		}
	}

	/**
	 * Получение психолога по ID
	 */
	async findById(id: number): Promise<ApiResponse<Psychologist>> {
		try {
			this.logger.debug(`Получение психолога с ID ${id}`, this.CONTEXT)

			const psychologist = await this.prisma.psychologist.findUnique({
				where: { id },
				include: {
					photos: {
						orderBy: { createdAt: 'asc' },
					},
				},
			})

			if (!psychologist) {
				this.logger.warn(`Психолог с ID ${id} не найден`, this.CONTEXT)
				return errorResponse('Психолог не найден')
			}

			if (psychologist.status !== 'Active') {
				this.logger.warn(
					`Попытка получить неактивного психолога с ID ${id}`,
					this.CONTEXT
				)
				return errorResponse('Психолог неактивен')
			}

			this.logger.debug(`Психолог ${id} успешно получен`, this.CONTEXT)

			const psychologistData =
				await this.transformPsychologistData(psychologist)
			return successResponse(psychologistData, 'Психолог найден')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при получении психолога`,
				error?.stack,
				this.CONTEXT,
				{ id, error }
			)
			return errorResponse('Ошибка при получении психолога', error)
		}
	}

	/**
	 * Получение психолога по Telegram ID
	 */
	async findByTelegramId(
		telegramId: string
	): Promise<ApiResponse<Psychologist>> {
		try {
			this.logger.debug(
				`Получение психолога с telegramId ${telegramId}`,
				this.CONTEXT
			)

			const psychologist = await this.prisma.psychologist.findUnique({
				where: { telegramId },
				include: {
					photos: {
						orderBy: { createdAt: 'asc' },
					},
				},
			})

			if (!psychologist) {
				this.logger.warn(
					`Психолог с telegramId ${telegramId} не найден`,
					this.CONTEXT
				)
				return errorResponse('Психолог не найден')
			}

			this.logger.debug(
				`Психолог с telegramId ${telegramId} успешно получен`,
				this.CONTEXT
			)

			const psychologistData =
				await this.transformPsychologistData(psychologist)
			return successResponse(psychologistData, 'Психолог найден')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при получении психолога по telegramId`,
				error?.stack,
				this.CONTEXT,
				{ telegramId, error }
			)
			return errorResponse('Ошибка при получении психолога', error)
		}
	}

	/**
	 * Обновление профиля психолога
	 */
	async update(
		telegramId: string,
		dto: UpdatePsychologistDto
	): Promise<ApiResponse<Psychologist>> {
		try {
			this.logger.debug(
				`Обновление профиля психолога ${telegramId}`,
				this.CONTEXT
			)

			// Проверяем существование психолога
			const existingPsychologist = await this.prisma.psychologist.findUnique({
				where: { telegramId },
			})

			if (!existingPsychologist) {
				this.logger.warn(
					`Попытка обновить несуществующего психолога ${telegramId}`,
					this.CONTEXT
				)
				return errorResponse('Психолог не найден')
			}

			// Обновляем данные
			const updateData: any = {}
			if (dto.name !== undefined) updateData.name = dto.name
			if (dto.about !== undefined) updateData.about = dto.about

			const psychologist = await this.prisma.psychologist.update({
				where: { telegramId },
				data: updateData,
				include: {
					photos: {
						orderBy: { createdAt: 'asc' },
					},
				},
			})

			this.logger.debug(
				`Профиль психолога ${telegramId} успешно обновлен`,
				this.CONTEXT
			)

			const psychologistData =
				await this.transformPsychologistData(psychologist)
			return successResponse(psychologistData, 'Профиль обновлен')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при обновлении профиля психолога`,
				error?.stack,
				this.CONTEXT,
				{ telegramId, dto, error }
			)
			return errorResponse('Ошибка при обновлении профиля', error)
		}
	}

	/**
	 * Проверка существования психолога
	 */
	async exists(telegramId: string): Promise<boolean> {
		try {
			const psychologist = await this.prisma.psychologist.findUnique({
				where: { telegramId },
				select: { id: true },
			})
			return !!psychologist
		} catch (error: any) {
			this.logger.error(
				`Ошибка при проверке существования психолога`,
				error?.stack,
				this.CONTEXT,
				{ telegramId, error }
			)
			return false
		}
	}

	/**
	 * Проверка регистрации психолога
	 */
	async check(dto: CheckPsychologistDto): Promise<ApiResponse<Psychologist>> {
		try {
			this.logger.debug(
				`Проверка регистрации психолога ${dto.telegramId}`,
				this.CONTEXT
			)

			const psychologist = await this.prisma.psychologist.findUnique({
				where: { telegramId: dto.telegramId },
				include: {
					photos: {
						orderBy: { createdAt: 'asc' },
					},
				},
			})

			if (!psychologist) {
				this.logger.debug(`Психолог ${dto.telegramId} не найден`, this.CONTEXT)
				return errorResponse('Психолог не найден')
			}

			if (psychologist.status !== 'Active') {
				this.logger.warn(
					`Попытка входа неактивного психолога ${dto.telegramId}`,
					this.CONTEXT
				)
				return errorResponse('Психолог неактивен')
			}

			this.logger.debug(
				`Психолог ${dto.telegramId} успешно авторизован`,
				this.CONTEXT
			)

			const psychologistData =
				await this.transformPsychologistData(psychologist)
			return successResponse(psychologistData, 'Психолог найден')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при проверке психолога`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse('Ошибка при проверке психолога', error)
		}
	}

	/**
	 * Удаление психолога
	 */
	async delete(dto: DeletePsychologistDto): Promise<ApiResponse<boolean>> {
		try {
			this.logger.debug(`Удаление психолога ${dto.telegramId}`, this.CONTEXT)

			// Проверяем существование психолога
			const psychologist = await this.prisma.psychologist.findUnique({
				where: { telegramId: dto.telegramId },
			})

			if (!psychologist) {
				this.logger.warn(
					`Попытка удалить несуществующего психолога ${dto.telegramId}`,
					this.CONTEXT
				)
				return errorResponse('Психолог не найден')
			}

			// Удаляем психолога
			await this.prisma.psychologist.delete({
				where: { telegramId: dto.telegramId },
			})

			this.logger.debug(
				`Психолог ${dto.telegramId} успешно удален`,
				this.CONTEXT
			)

			return successResponse(true, 'Психолог удален')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при удалении психолога`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse('Ошибка при удалении психолога', error)
		}
	}

	/**
	 * Поиск психолога по селектору (ID или имя)
	 */
	async findBySelector(
		dto: FindPsychologistBySelectorDto
	): Promise<ApiResponse<Psychologist>> {
		try {
			const { selector } = dto

			this.logger.debug(
				`Поиск психолога по селектору: ${selector}`,
				this.CONTEXT
			)

			// Проверяем, является ли селектор числом (ID)
			const isNumeric = !isNaN(Number(selector))

			let psychologist: any = null

			if (isNumeric) {
				// Поиск по ID
				psychologist = await this.prisma.psychologist.findUnique({
					where: { id: parseInt(selector) },
					include: {
						photos: {
							orderBy: { createdAt: 'asc' },
						},
					},
				})
			} else {
				// Поиск по имени (точное совпадение)
				psychologist = await this.prisma.psychologist.findFirst({
					where: {
						name: selector,
						status: 'Active',
					},
					include: {
						photos: {
							orderBy: { createdAt: 'asc' },
						},
					},
				})
			}

			if (!psychologist) {
				this.logger.debug(
					`Психолог с селектором ${selector} не найден`,
					this.CONTEXT
				)
				return errorResponse('Психолог не найден')
			}

			if (psychologist.status !== 'Active') {
				this.logger.warn(
					`Попытка получить неактивного психолога с селектором ${selector}`,
					this.CONTEXT
				)
				return errorResponse('Психолог неактивен')
			}

			this.logger.debug(
				`Психолог с селектором ${selector} успешно найден`,
				this.CONTEXT
			)

			const psychologistData =
				await this.transformPsychologistData(psychologist)
			return successResponse(psychologistData, 'Психолог найден')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при поиске психолога по селектору`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse('Ошибка при поиске психолога', error)
		}
	}

	/**
	 * Генерация ссылки для регистрации психолога (только для админов)
	 */
	async generatePsychologistInviteLink(
		createdBy: string
	): Promise<ApiResponse<{ code: string; inviteUrl: string }>> {
		try {
			this.logger.debug(
				`Генерация ссылки для психолога админом ${createdBy}`,
				this.CONTEXT
			)

			// Генерируем уникальный код приглашения
			const code = this.generateInviteCode()

			// Создаем приглашение
			const invite = await this.prisma.psychologistInvite.create({
				data: {
					code,
					expiresAt: null, // Бессрочное приглашение
					maxUses: 1,
					createdBy,
				},
			})

			// Формируем полную ссылку на бота
			const botUsername =
				this.configService.get<string>('BOT_USERNAME') || 'your_bot'
			const inviteUrl = `https://t.me/${botUsername}?start=psychologist_${code}`

			this.logger.debug(
				`Ссылка для психолога ${code} успешно создана`,
				this.CONTEXT
			)

			return successResponse(
				{ code, inviteUrl },
				'Ссылка для психолога создана'
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при генерации ссылки для психолога`,
				error?.stack,
				this.CONTEXT,
				{ createdBy, error }
			)
			return errorResponse('Ошибка при генерации ссылки для психолога', error)
		}
	}

	/**
	 * Проверка валидности кода приглашения
	 */
	async validateInviteCode(
		code: string
	): Promise<ApiResponse<{ isValid: boolean; message?: string }>> {
		try {
			this.logger.debug(`Проверка валидности кода: ${code}`, this.CONTEXT)

			// Ищем приглашение
			const invite = await this.prisma.psychologistInvite.findUnique({
				where: { code },
			})

			if (!invite) {
				return successResponse(
					{ isValid: false, message: 'Код приглашения не найден' },
					'Код недействителен'
				)
			}

			// Проверяем срок действия
			if (invite.expiresAt && invite.expiresAt < new Date()) {
				return successResponse(
					{ isValid: false, message: 'Код приглашения истек' },
					'Код недействителен'
				)
			}

			// Проверяем количество использований
			if (invite.usedCount >= invite.maxUses) {
				return successResponse(
					{ isValid: false, message: 'Код приглашения уже использован' },
					'Код недействителен'
				)
			}

			this.logger.debug(`Код ${code} валиден`, this.CONTEXT)

			return successResponse({ isValid: true }, 'Код действителен')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при проверке кода`,
				error?.stack,
				this.CONTEXT,
				{ code, error }
			)
			return errorResponse('Ошибка при проверке кода', error)
		}
	}

	/**
	 * Регистрация психолога по коду приглашения
	 */
	async registerByInvite(
		dto: RegisterByInviteDto
	): Promise<ApiResponse<Psychologist>> {
		try {
			this.logger.debug(
				`Регистрация психолога по коду: ${dto.code}`,
				this.CONTEXT
			)

			// Проверяем валидность кода приглашения
			const validationResult = await this.validateInviteCode(dto.code)
			if (!validationResult.success || !validationResult.data?.isValid) {
				return errorResponse(
					validationResult.data?.message || 'Код приглашения недействителен'
				)
			}

			// Проверяем, что психолог с таким telegramId еще не существует
			const existingPsychologist = await this.prisma.psychologist.findUnique({
				where: { telegramId: dto.telegramId },
			})

			if (existingPsychologist) {
				return errorResponse('Психолог с таким Telegram ID уже существует')
			}

			// Находим приглашение
			const invite = await this.prisma.psychologistInvite.findUnique({
				where: { code: dto.code },
			})

			if (!invite) {
				return errorResponse('Код приглашения не найден')
			}

			// Создаем психолога
			const psychologist = await this.prisma.psychologist.create({
				data: {
					telegramId: dto.telegramId,
					name: dto.name,
					about: dto.about,
					status: 'Active',
				},
				include: {
					photos: true,
				},
			})

			// Обновляем счетчик использований приглашения
			await this.prisma.psychologistInvite.update({
				where: { id: invite.id },
				data: {
					usedCount: invite.usedCount + 1,
					usedByTelegramId: dto.telegramId,
				},
			})

			this.logger.debug(
				`Психолог ${dto.telegramId} успешно зарегистрирован по коду ${dto.code}`,
				this.CONTEXT
			)

			// Преобразуем в правильный формат
			const psychologistResponse: Psychologist = {
				id: psychologist.id,
				telegramId: psychologist.telegramId,
				name: psychologist.name,
				about: psychologist.about,
				status: psychologist.status,
				createdAt: psychologist.createdAt,
				updatedAt: psychologist.updatedAt,
				photos: psychologist.photos.map(photo => ({
					id: photo.id,
					url: photo.url,
				})),
			}

			return successResponse(
				psychologistResponse,
				'Психолог успешно зарегистрирован'
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при регистрации психолога по коду`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse('Ошибка при регистрации психолога', error)
		}
	}

	/**
	 * Генерация уникального кода приглашения
	 */
	private generateInviteCode(): string {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
		let result = 'PSYCH_'
		for (let i = 0; i < 8; i++) {
			result += chars.charAt(Math.floor(Math.random() * chars.length))
		}
		return result
	}
}
