import { Injectable } from '@nestjs/common'
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
			const key = await this.storageService.uploadVideo(video)

			// Создаем превью для видео (пока возвращает null)
			const previewKey = await this.storageService.createVideoPreview(key)

			this.logger.debug(
				`Короткое видео успешно загружено в облако: ${key}, превью: ${previewKey}`,
				this.CONTEXT
			)

			return successResponse(
				{ videoId: 0, key, previewKey }, // videoId будет установлен после сохранения в БД
				'Короткое видео загружено в облако'
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при загрузке короткого видео для психолога ${dto.telegramId}`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
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

			// Сохраняем короткое видео в БД
			const video = await this.prisma.video.create({
				data: {
					key: dto.key,
					previewKey: dto.previewKey,
					telegramId: dto.telegramId,
					title: dto.title,
					description: dto.description,
				},
			})

			this.logger.debug(
				`Короткое видео успешно сохранено в БД с ID: ${video.id}`,
				this.CONTEXT
			)

			return successResponse(
				{ videoId: video.id, key: video.key },
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
							id: true,
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

			return successResponse(updatedVideo, 'Короткое видео обновлено')
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
							name: true,
							about: true,
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
					const previewUrl = video.previewKey
						? await this.getPreviewUrl(video.previewKey)
						: null
					return {
						...video,
						url,
						previewUrl: previewUrl,
						previewKey: undefined,
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
							name: true,
							about: true,
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
					const previewUrl = video.previewKey
						? await this.getPreviewUrl(video.previewKey)
						: null

					// Проверяем, лайкал ли пользователь это видео
					const isLiked = video.likes.length > 0

					return {
						...video,
						url,
						previewUrl,
						isLiked,
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
			const previewKey = await this.storageService.createVideoPreview(video.key)

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
