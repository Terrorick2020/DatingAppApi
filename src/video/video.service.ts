import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '~/prisma/prisma.service'
import {
	errorResponse,
	successResponse,
} from '../common/helpers/api.response.helper'
import { AppLogger } from '../common/logger/logger.service'
import { RedisService } from '../redis/redis.service'
import { StorageService } from '../storage/storage.service'
import { GetShortVideosDto } from './dto/get-short-videos.dto'
import { UpdateVideoDto } from './dto/update-video.dto'
import { SaveVideoDto, UploadVideoDto } from './dto/upload-video.dto'
import {
	LikeVideoResponse,
	UploadVideoResponse,
	VideoListResponse,
	VideoResponse,
} from './video.types'

@Injectable()
export class VideoService {
	private readonly CONTEXT = 'VideoService'

	constructor(
		private readonly prisma: PrismaService,
		private readonly storageService: StorageService,
		private readonly redisService: RedisService,
		private readonly logger: AppLogger
	) {}

	/**
	 * Получение URL видео с кешированием
	 */
	private async getVideoUrl(key: string): Promise<string> {
		const cacheKey = `video:${key}:url`

		// Проверяем кеш
		const cachedUrl = await this.redisService.getKey(cacheKey)
		if (cachedUrl.success && cachedUrl.data) {
			return cachedUrl.data
		}

		// Генерируем новый URL
		const presignedUrl = await this.storageService.getPresignedUrl(key, 7200)

		// Кешируем на 1 час 50 минут
		await this.redisService.setKey(cacheKey, presignedUrl, 6600)

		return presignedUrl
	}

	/**
	 * Получение URL превью с кешированием
	 */
	private async getPreviewUrl(previewKey: string): Promise<string> {
		const cacheKey = `preview:${previewKey}:url`

		// Проверяем кеш
		const cachedUrl = await this.redisService.getKey(cacheKey)
		if (cachedUrl.success && cachedUrl.data) {
			return cachedUrl.data
		}

		// Генерируем новый URL
		const presignedUrl = await this.storageService.getPresignedUrl(
			previewKey,
			7200
		)

		// Кешируем на 1 час 50 минут
		await this.redisService.setKey(cacheKey, presignedUrl, 6600)

		return presignedUrl
	}

	/**
	 * Получение URL фото с кешированием
	 */
	private async getPhotoUrl(photoKey: string): Promise<string> {
		const cacheKey = `photo:${photoKey}:url`

		// Проверяем кеш
		const cachedUrl = await this.redisService.getKey(cacheKey)
		if (cachedUrl.success && cachedUrl.data) {
			return cachedUrl.data
		}

		// Генерируем новый URL
		const presignedUrl = await this.storageService.getPresignedUrl(
			photoKey,
			7200
		)

		// Кешируем на 1 час 50 минут
		await this.redisService.setKey(cacheKey, presignedUrl, 6600)

		return presignedUrl
	}

	/**
	 * Загрузка короткого видео в облако
	 */
	async uploadShortVideo(
		video: Express.Multer.File,
		dto: UploadVideoDto
	): Promise<{
		success: boolean
		data?: UploadVideoResponse
		message?: string
	}> {
		try {
			this.logger.debug(
				`Загрузка короткого видео для психолога ${dto.telegramId}`,
				this.CONTEXT,
				{ videoSize: video.size, videoType: video.mimetype }
			)

			// Проверяем существование психолога
			const psychologist = await this.prisma.psychologist.findUnique({
				where: { telegramId: dto.telegramId },
			})

			if (!psychologist) {
				this.logger.warn(
					`Психолог с telegramId ${dto.telegramId} не найден`,
					this.CONTEXT
				)
				return errorResponse('Психолог не найден')
			}

			// Загружаем видео в облако
			const uploadResult = await this.storageService.uploadVideo(video)

			// Проверяем, что загрузка прошла успешно
			if (typeof uploadResult !== 'string') {
				// Если видео конвертируется, возвращаем информацию о процессе
				return successResponse(
					{
						videoId: 0, // Временно 0, будет обновлено после конвертации
						key: uploadResult.key,
						previewKey: null,
						status: uploadResult.status,
						message: uploadResult.message,
						originalFormat: uploadResult.originalFormat,
						estimatedTime: uploadResult.estimatedTime,
					},
					uploadResult.message
				)
			}

			const key = uploadResult

			// Создаем превью для видео
			this.logger.debug(`Создание превью для видео: ${key}`, this.CONTEXT)
			const previewKey = await this.storageService.createVideoPreview(key)

			this.logger.debug(
				`Короткое видео успешно загружено в облако: ${key}, превью: ${previewKey}`,
				this.CONTEXT
			)

			// Сохраняем видео в БД сразу с previewKey
			this.logger.debug(
				`Сохранение видео в БД: key=${key}, telegramId=${dto.telegramId}`,
				this.CONTEXT
			)

			const savedVideo = await this.prisma.video.create({
				data: {
					key,
					previewKey,
					telegramId: dto.telegramId,
					title: '', // Будет обновлено в saveShortVideo
					description: '', // Будет обновлено в saveShortVideo
				},
			})

			this.logger.debug(
				`Короткое видео успешно сохранено в БД с ID: ${savedVideo.id}`,
				this.CONTEXT
			)

			return successResponse(
				{ videoId: savedVideo.id, key, previewKey },
				'Короткое видео загружено в облако'
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при загрузке короткого видео для психолога ${dto.telegramId}`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)

			// Если видео загружено в облако, но не сохранено в БД, удаляем его
			if (typeof uploadResult === 'string') {
				try {
					await this.storageService.deleteVideo(uploadResult)
					this.logger.debug(
						`Удалено видео из облака после ошибки БД: ${uploadResult}`,
						this.CONTEXT
					)
				} catch (deleteError) {
					this.logger.error(
						`Ошибка при удалении видео из облака: ${uploadResult}`,
						deleteError?.stack,
						this.CONTEXT
					)
				}
			}

			return errorResponse('Ошибка при загрузке короткого видео:', error)
		}
	}

	/**
	 * Сохранение короткого видео в базе данных
	 */
	async saveShortVideo(dto: SaveVideoDto): Promise<{
		success: boolean
		data?: UploadVideoResponse
		message?: string
	}> {
		try {
			this.logger.debug(
				`Сохранение короткого видео в БД для психолога ${dto.telegramId}`,
				this.CONTEXT,
				{ key: dto.key }
			)

			// Проверяем существование психолога
			const psychologist = await this.prisma.psychologist.findUnique({
				where: { telegramId: dto.telegramId },
			})

			if (!psychologist) {
				this.logger.warn(
					`Психолог с telegramId ${dto.telegramId} не найден`,
					this.CONTEXT
				)
				return errorResponse('Психолог не найден')
			}

			// Находим и обновляем существующее видео в БД
			const video = await this.prisma.video.findFirst({
				where: {
					key: dto.key,
					telegramId: dto.telegramId,
				},
			})

			if (!video) {
				this.logger.warn(
					`Видео с ключом ${dto.key} не найдено для психолога ${dto.telegramId}`,
					this.CONTEXT
				)
				return errorResponse('Видео не найдено')
			}

			const updatedVideo = await this.prisma.video.update({
				where: { id: video.id },
				data: {
					title: dto.title,
					description: dto.description,
				},
			})

			this.logger.debug(
				`Короткое видео успешно обновлено в БД с ID: ${updatedVideo.id}`,
				this.CONTEXT
			)

			// Генерируем URL для видео
			const videoUrl = await this.getVideoUrl(updatedVideo.key)

			// Генерируем URL для превью, если оно есть
			let previewUrl = null
			if (updatedVideo.previewKey) {
				previewUrl = await this.getPreviewUrl(updatedVideo.previewKey)
			}

			return successResponse(
				{
					videoId: updatedVideo.id,
					key: updatedVideo.key,
					previewKey: updatedVideo.previewKey,
					url: videoUrl,
					previewUrl: previewUrl,
				},
				'Короткое видео сохранено'
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при сохранении короткого видео для психолога ${dto.telegramId}`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse('Ошибка при сохранении короткого видео:', error)
		}
	}

	/**
	 * Обновление короткого видео
	 */
	async updateShortVideo(
		videoId: number,
		telegramId: string,
		dto: UpdateVideoDto
	): Promise<{ success: boolean; data?: VideoResponse; message?: string }> {
		try {
			this.logger.debug(
				`Обновление короткого видео ${videoId} психолога ${telegramId}`,
				this.CONTEXT,
				{ dto }
			)

			// Проверяем существование видео и принадлежность психологу
			const video = await this.prisma.video.findFirst({
				where: {
					id: videoId,
					telegramId: telegramId,
				},
			})

			if (!video) {
				this.logger.warn(
					`Короткое видео ${videoId} не найдено или не принадлежит психологу ${telegramId}`,
					this.CONTEXT
				)
				return errorResponse('Короткое видео не найдено')
			}

			// Обновляем видео
			const updatedVideo = await this.prisma.video.update({
				where: { id: videoId },
				data: {
					title: dto.title,
					description: dto.description,
					isPublished: dto.isPublished,
				},
				include: {
					psychologist: {
						select: {
							telegramId: true,
							name: true,
							about: true,
						},
					},
				},
			})

			this.logger.debug(
				`Короткое видео ${videoId} успешно обновлено`,
				this.CONTEXT
			)

			// Преобразуем объект психолога для соответствия типам
			const transformedVideo = {
				...updatedVideo,
				psychologist: {
					id: updatedVideo.psychologist.telegramId,
					name: updatedVideo.psychologist.name,
					about: updatedVideo.psychologist.about,
				},
			}

			return successResponse(transformedVideo, 'Короткое видео обновлено')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при обновлении короткого видео ${videoId}`,
				error?.stack,
				this.CONTEXT,
				{ videoId, telegramId, dto, error }
			)
			return errorResponse('Ошибка при обновлении короткого видео:', error)
		}
	}

	/**
	 * Удаление короткого видео
	 */
	async deleteShortVideo(
		videoId: number,
		telegramId: string
	): Promise<{ success: boolean; message?: string }> {
		try {
			this.logger.debug(
				`Удаление короткого видео ${videoId} психолога ${telegramId}`,
				this.CONTEXT
			)

			// Проверяем существование видео и принадлежность психологу
			const video = await this.prisma.video.findFirst({
				where: {
					id: videoId,
					telegramId: telegramId,
				},
			})

			if (!video) {
				this.logger.warn(
					`Короткое видео ${videoId} не найдено или не принадлежит психологу ${telegramId}`,
					this.CONTEXT
				)
				return errorResponse('Короткое видео не найдено')
			}

			// Удаляем видео из облака
			try {
				await this.storageService.deleteVideo(video.key)
			} catch (error) {
				this.logger.warn(
					`Не удалось удалить видео из облака: ${video.key}`,
					this.CONTEXT,
					{ error }
				)
			}

			// Удаляем видео из БД
			await this.prisma.video.delete({
				where: { id: videoId },
			})

			this.logger.debug(
				`Короткое видео ${videoId} успешно удалено`,
				this.CONTEXT
			)

			return successResponse(null, 'Короткое видео удалено')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при удалении короткого видео ${videoId}`,
				error?.stack,
				this.CONTEXT,
				{ videoId, telegramId, error }
			)
			return errorResponse('Ошибка при удалении короткого видео:', error)
		}
	}

	/**
	 * Получение списка моих коротких видео
	 */
	async getMyShortVideos(
		dto: GetShortVideosDto
	): Promise<{ success: boolean; data?: VideoListResponse; message?: string }> {
		try {
			this.logger.debug(
				`Получение коротких видео психолога ${dto.telegramId}`,
				this.CONTEXT,
				{ limit: dto.limit, offset: dto.offset }
			)

			// Получаем видео психолога с пагинацией
			const videos = await this.prisma.video.findMany({
				where: {
					telegramId: dto.telegramId,
				},
				include: {
					psychologist: {
						select: {
							id: true,
							telegramId: true,
							name: true,
							about: true,
							photos: {
								select: {
									key: true,
								},
								take: 1,
								orderBy: {
									createdAt: 'asc',
								},
							},
						},
					},
				},
				orderBy: {
					createdAt: 'desc',
				},
				take: dto.limit,
				skip: dto.offset,
			})

			// Получаем общее количество видео психолога
			const total = await this.prisma.video.count({
				where: {
					telegramId: dto.telegramId,
				},
			})

			// Генерируем URL для каждого видео
			const videosWithUrls = await Promise.all(
				videos.map(async video => {
					const url = await this.getVideoUrl(video.key)

					// Логируем информацию о превью
					this.logger.debug(
						`Обработка видео ${video.id}: key=${video.key}, previewKey=${video.previewKey}`,
						this.CONTEXT
					)

					let previewUrl = null
					if (video.previewKey) {
						this.logger.debug(
							`Создание URL для превью видео ${video.id}: previewKey=${video.previewKey}`,
							this.CONTEXT
						)
						previewUrl = await this.getPreviewUrl(video.previewKey)
						this.logger.debug(
							`URL превью для видео ${video.id}: ${previewUrl}`,
							this.CONTEXT
						)
					} else {
						this.logger.debug(
							`У видео ${video.id} нет previewKey, превью не будет создано`,
							this.CONTEXT
						)
					}

					// Генерируем URL для фото психолога
					let psychologistPhotoUrl = null
					if (
						video.psychologist.photos &&
						video.psychologist.photos.length > 0
					) {
						psychologistPhotoUrl = await this.getPhotoUrl(
							video.psychologist.photos[0].key
						)
					}

					return {
						...video,
						url,
						previewUrl: previewUrl,
						previewKey: undefined,
						psychologist: {
							id: video.psychologist.telegramId,
							name: video.psychologist.name,
							about: video.psychologist.about,
							photoUrl: psychologistPhotoUrl,
						},
					}
				})
			)

			this.logger.debug(
				`Получено ${videosWithUrls.length} коротких видео психолога ${dto.telegramId}`,
				this.CONTEXT
			)

			return successResponse(
				{
					videos: videosWithUrls,
					total,
				},
				'Короткие видео получены'
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при получении коротких видео психолога ${dto.telegramId}`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse('Ошибка при получении коротких видео:', error)
		}
	}

	/**
	 * Получение ленты коротких видео для пользователей
	 */
	async getShortVideosFeed(
		telegramId: string,
		limit: number = 10,
		offset: number = 0
	): Promise<{
		success: boolean
		data?: VideoListResponse
		message?: string
	}> {
		try {
			this.logger.debug(
				`Получение ленты коротких видео для пользователя ${telegramId}`,
				this.CONTEXT,
				{ limit, offset }
			)

			// Получаем опубликованные видео с пагинацией
			const videos = await this.prisma.video.findMany({
				where: {
					isPublished: true,
				},
				include: {
					psychologist: {
						select: {
							id: true,
							telegramId: true,
							name: true,
							about: true,
							photos: {
								select: {
									key: true,
								},
								take: 1,
								orderBy: {
									createdAt: 'asc',
								},
							},
						},
					},
					likes: {
						where: {
							userId: telegramId,
						},
						select: {
							id: true,
						},
					},
					views: {
						where: {
							userId: telegramId,
						},
						select: {
							id: true,
						},
					},
				},
				orderBy: {
					createdAt: 'desc',
				},
				take: limit,
				skip: offset,
			})

			// Получаем общее количество видео
			const total = await this.prisma.video.count({
				where: {
					isPublished: true,
				},
			})

			// Проверяем, смотрел ли пользователь хотя бы одно видео
			const hasViewedAnyVideo = await this.prisma.videoView.findFirst({
				where: {
					userId: telegramId,
				},
			})

			// Генерируем URL для каждого видео и добавляем информацию о лайках
			const videosWithUrls = await Promise.all(
				videos.map(async video => {
					const url = await this.getVideoUrl(video.key)

					// Логируем информацию о превью
					this.logger.debug(
						`Обработка видео ${video.id} в ленте: key=${video.key}, previewKey=${video.previewKey}`,
						this.CONTEXT
					)

					let previewUrl = null
					if (video.previewKey) {
						this.logger.debug(
							`Создание URL для превью видео ${video.id} в ленте: previewKey=${video.previewKey}`,
							this.CONTEXT
						)
						previewUrl = await this.getPreviewUrl(video.previewKey)
						this.logger.debug(
							`URL превью для видео ${video.id} в ленте: ${previewUrl}`,
							this.CONTEXT
						)
					} else {
						this.logger.debug(
							`У видео ${video.id} в ленте нет previewKey, превью не будет создано`,
							this.CONTEXT
						)
					}

					// Проверяем, лайкал ли пользователь это видео
					const isLiked = video.likes.length > 0

					// Проверяем, просматривал ли пользователь это видео
					const isView = video.views.length > 0

					// Генерируем URL для фото психолога
					let psychologistPhotoUrl = null
					if (
						video.psychologist.photos &&
						video.psychologist.photos.length > 0
					) {
						psychologistPhotoUrl = await this.getPhotoUrl(
							video.psychologist.photos[0].key
						)
					}

					return {
						...video,
						url,
						previewUrl,
						isLiked,
						isView,
						psychologist: {
							id: video.psychologist.telegramId,
							name: video.psychologist.name,
							about: video.psychologist.about,
							photoUrl: psychologistPhotoUrl,
						},
						// Убираем массивы likes и views из ответа
						likes: undefined,
						views: undefined,
						// Убираем previewKey из ответа, так как возвращаем previewUrl
						previewKey: undefined,
					}
				})
			)

			this.logger.debug(
				`Получено ${videosWithUrls.length} коротких видео для пользователя ${telegramId}`,
				this.CONTEXT
			)

			return successResponse(
				{
					videos: videosWithUrls,
					total,
					isChecked: !!hasViewedAnyVideo,
				},
				'Лента коротких видео получена'
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при получении ленты коротких видео для пользователя ${telegramId}`,
				error?.stack,
				this.CONTEXT,
				{ telegramId, limit, offset, error }
			)
			return errorResponse('Ошибка при получении ленты коротких видео', error)
		}
	}

	/**
	 * Поиск видео
	 */
	async searchShortVideos(
		search: string,
		limit: number = 10,
		offset: number = 0,
		viewerTelegramId?: string
	): Promise<{
		success: boolean
		data?: VideoListResponse
		message?: string
	}> {
		try {
			this.logger.debug(
				`Поиск коротких видео по запросу: ${search}`,
				this.CONTEXT,
				{ limit, offset }
			)

			const where: Prisma.VideoWhereInput = {
				isPublished: true,
				OR: [
					{ title: { contains: search, mode: 'insensitive' } },
					{ psychologist: { name: { contains: search, mode: 'insensitive' } } },
				],
			}

			const videos = await this.prisma.video.findMany({
				where,
				include: {
					psychologist: {
						select: {
							id: true,
							telegramId: true,
							name: true,
							about: true,
							photos: {
								select: { key: true },
								take: 1,
								orderBy: { createdAt: 'asc' },
							},
						},
					},
					likes: viewerTelegramId
						? { where: { userId: viewerTelegramId }, select: { id: true } }
						: false,
					views: viewerTelegramId
						? { where: { userId: viewerTelegramId }, select: { id: true } }
						: false,
				},
				orderBy: { createdAt: 'desc' },
				take: limit,
				skip: offset,
			})

			const total = await this.prisma.video.count({ where })

			const videosWithUrls = await Promise.all(
				videos.map(async video => {
					const url = await this.getVideoUrl(video.key)

					let previewUrl = null
					if (video.previewKey) {
						previewUrl = await this.getPreviewUrl(video.previewKey)
					}

					let psychologistPhotoUrl = null
					if (
						video.psychologist.photos &&
						video.psychologist.photos.length > 0
					) {
						psychologistPhotoUrl = await this.getPhotoUrl(
							video.psychologist.photos[0].key
						)
					}

					const isLiked = Array.isArray((video as any).likes)
						? (video as any).likes.length > 0
						: undefined
					const isView = Array.isArray((video as any).views)
						? (video as any).views.length > 0
						: undefined

					return {
						...video,
						url,
						previewUrl,
						psychologist: {
							id: video.psychologist.telegramId,
							name: video.psychologist.name,
							about: video.psychologist.about,
							photoUrl: psychologistPhotoUrl,
						},
						likes: undefined,
						views: undefined,
						previewKey: undefined,
						isLiked,
						isView,
					}
				})
			)

			return successResponse(
				{ videos: videosWithUrls, total },
				'Результаты поиска получены'
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при поиске коротких видео по запросу: ${search}`,
				error?.stack,
				this.CONTEXT,
				{ search, limit, offset, error }
			)
			return errorResponse('Ошибка при поиске коротких видео', error)
		}
	}

	/**
	 * Лайк/дизлайк короткого видео пользователем
	 */
	async likeShortVideo(
		videoId: number,
		telegramId: string
	): Promise<{
		success: boolean
		data?: LikeVideoResponse
		message?: string
	}> {
		try {
			this.logger.debug(
				`Лайк видео ${videoId} от пользователя ${telegramId}`,
				this.CONTEXT
			)

			// Проверяем существование видео
			const video = await this.prisma.video.findUnique({
				where: { id: videoId },
			})

			if (!video) {
				this.logger.warn(`Видео с ID ${videoId} не найдено`, this.CONTEXT)
				return errorResponse('Видео не найдено')
			}

			// Проверяем, лайкал ли уже пользователь это видео
			const existingLike = await this.prisma.videoLike.findUnique({
				where: {
					videoId_userId: {
						videoId,
						userId: telegramId,
					},
				},
			})

			let isLiked: boolean
			let likesCount: number

			if (existingLike) {
				// Убираем лайк
				await this.prisma.videoLike.delete({
					where: {
						videoId_userId: {
							videoId,
							userId: telegramId,
						},
					},
				})

				// Уменьшаем счетчик лайков
				await this.prisma.video.update({
					where: { id: videoId },
					data: {
						likesCount: {
							decrement: 1,
						},
					},
				})

				isLiked = false
				likesCount = video.likesCount - 1
			} else {
				// Добавляем лайк
				await this.prisma.videoLike.create({
					data: {
						videoId,
						userId: telegramId,
					},
				})

				// Увеличиваем счетчик лайков
				await this.prisma.video.update({
					where: { id: videoId },
					data: {
						likesCount: {
							increment: 1,
						},
					},
				})

				isLiked = true
				likesCount = video.likesCount + 1
			}

			this.logger.debug(
				`Лайк видео ${videoId} от пользователя ${telegramId} обработан`,
				this.CONTEXT,
				{ isLiked, likesCount }
			)

			return successResponse(
				{
					isLiked,
					likesCount,
				},
				isLiked ? 'Видео лайкнуто' : 'Лайк убран'
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при лайке видео ${videoId} от пользователя ${telegramId}`,
				error?.stack,
				this.CONTEXT,
				{ videoId, telegramId, error }
			)
			return errorResponse('Ошибка при лайке видео', error)
		}
	}

	/**
	 * Создание превью для существующего видео
	 */
	async createVideoPreview(
		videoId: number,
		telegramId: string
	): Promise<{
		success: boolean
		data?: { previewUrl: string }
		message?: string
	}> {
		try {
			this.logger.debug(
				`Создание превью для видео ${videoId} психолога ${telegramId}`,
				this.CONTEXT
			)

			// Проверяем существование видео и принадлежность психологу
			const video = await this.prisma.video.findFirst({
				where: {
					id: videoId,
					telegramId: telegramId,
				},
			})

			if (!video) {
				this.logger.warn(
					`Видео ${videoId} не найдено или не принадлежит психологу ${telegramId}`,
					this.CONTEXT
				)
				return errorResponse('Видео не найдено')
			}

			// Создаем превью
			this.logger.debug(
				`Начинаем создание превью для видео ${videoId}: key=${video.key}`,
				this.CONTEXT
			)

			const previewKey = await this.storageService.createVideoPreview(video.key)

			this.logger.debug(
				`Результат создания превью для видео ${videoId}: previewKey=${previewKey}`,
				this.CONTEXT
			)

			if (!previewKey) {
				this.logger.warn(
					`Не удалось создать превью для видео ${videoId}`,
					this.CONTEXT
				)
				return errorResponse('Не удалось создать превью')
			}

			// Обновляем видео в БД с новым previewKey
			await this.prisma.video.update({
				where: { id: videoId },
				data: { previewKey },
			})

			// Генерируем URL для превью
			const previewUrl = await this.getPreviewUrl(previewKey)

			this.logger.debug(
				`Превью для видео ${videoId} успешно создано`,
				this.CONTEXT
			)

			return successResponse({ previewUrl }, 'Превью для видео создано')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при создании превью для видео ${videoId}`,
				error?.stack,
				this.CONTEXT,
				{ videoId, telegramId, error }
			)
			return errorResponse('Ошибка при создании превью:', error)
		}
	}

	/**
	 * Увеличение счетчика просмотров короткого видео
	 */
	async incrementShortVideoViews(
		videoId: number,
		telegramId: string
	): Promise<{
		success: boolean
		data?: { viewsCount: number }
		message?: string
	}> {
		try {
			this.logger.debug(
				`Увеличение просмотров видео ${videoId} от пользователя ${telegramId}`,
				this.CONTEXT
			)

			// Проверяем, не просматривал ли уже пользователь это видео
			const existingView = await this.prisma.videoView.findUnique({
				where: {
					videoId_userId: {
						videoId,
						userId: telegramId,
					},
				},
			})

			if (existingView) {
				// Пользователь уже просматривал это видео
				const video = await this.prisma.video.findUnique({
					where: { id: videoId },
					select: { viewsCount: true },
				})

				return successResponse(
					{ viewsCount: video?.viewsCount || 0 },
					'Просмотр уже засчитан'
				)
			}

			// Создаем запись о просмотре и увеличиваем счетчик
			await this.prisma.$transaction(async tx => {
				await tx.videoView.create({
					data: {
						videoId,
						userId: telegramId,
					},
				})

				await tx.video.update({
					where: { id: videoId },
					data: {
						viewsCount: {
							increment: 1,
						},
					},
				})
			})

			// Получаем обновленный счетчик просмотров
			const updatedVideo = await this.prisma.video.findUnique({
				where: { id: videoId },
				select: { viewsCount: true },
			})

			this.logger.debug(
				`Просмотры видео ${videoId} увеличены пользователем ${telegramId}`,
				this.CONTEXT,
				{ viewsCount: updatedVideo?.viewsCount }
			)

			return successResponse(
				{ viewsCount: updatedVideo?.viewsCount || 0 },
				'Просмотр засчитан'
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при увеличении просмотров видео ${videoId}`,
				error?.stack,
				this.CONTEXT,
				{ videoId, telegramId, error }
			)
			return errorResponse('Ошибка при увеличении просмотров', error)
		}
	}
}
