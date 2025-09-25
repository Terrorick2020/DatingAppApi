import { Injectable } from '@nestjs/common'
import { PrismaService } from '~/prisma/prisma.service'
import {
	errorResponse,
	successResponse,
} from '../common/helpers/api.response.helper'
import { AppLogger } from '../common/logger/logger.service'
import { RedisService } from '../redis/redis.service'
import { StorageService } from '../storage/storage.service'
import { GetMyVideosDto, GetPublicVideosDto } from './dto/get-videos.dto'
import { LikeVideoDto } from './dto/like-video.dto'
import { UpdateVideoDto } from './dto/update-video.dto'
import { SaveVideoDto, UploadVideoDto } from './dto/upload-video.dto'
import { ViewVideoDto } from './dto/view-video.dto'
import {
	LikeVideoResponse,
	UploadVideoResponse,
	VideoListResponse,
	VideoResponse,
	VideoWithUrl,
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
	 * Загрузка видео в облако
	 */
	async uploadVideo(
		video: Express.Multer.File,
		dto: UploadVideoDto
	): Promise<{
		success: boolean
		data?: UploadVideoResponse
		message?: string
	}> {
		try {
			this.logger.debug(
				`Загрузка видео для психолога ${dto.telegramId}`,
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

			this.logger.debug(
				`Видео успешно загружено в облако: ${key}`,
				this.CONTEXT
			)

			return successResponse(
				{ videoId: 0, key }, // videoId будет установлен после сохранения в БД
				'Видео загружено в облако'
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при загрузке видео для психолога ${dto.telegramId}`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse('Ошибка при загрузке видео:', error)
		}
	}

	/**
	 * Сохранение видео в базе данных
	 */
	async saveVideo(dto: SaveVideoDto): Promise<{
		success: boolean
		data?: UploadVideoResponse
		message?: string
	}> {
		try {
			this.logger.debug(
				`Сохранение видео в БД для психолога ${dto.telegramId}`,
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

			// Сохраняем видео в БД
			const video = await this.prisma.video.create({
				data: {
					key: dto.key,
					telegramId: dto.telegramId,
					title: dto.title,
					description: dto.description,
				},
			})

			this.logger.debug(
				`Видео успешно сохранено в БД с ID: ${video.id}`,
				this.CONTEXT
			)

			return successResponse(
				{ videoId: video.id, key: video.key },
				'Видео сохранено'
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при сохранении видео для психолога ${dto.telegramId}`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse('Ошибка при сохранении видео:', error)
		}
	}

	/**
	 * Обновление видео
	 */
	async updateVideo(
		videoId: number,
		telegramId: string,
		dto: UpdateVideoDto
	): Promise<{ success: boolean; data?: VideoResponse; message?: string }> {
		try {
			this.logger.debug(
				`Обновление видео ${videoId} для психолога ${telegramId}`,
				this.CONTEXT,
				dto
			)

			// Проверяем существование видео и права доступа
			const existingVideo = await this.prisma.video.findFirst({
				where: {
					id: videoId,
					telegramId: telegramId,
				},
			})

			if (!existingVideo) {
				this.logger.warn(
					`Видео ${videoId} не найдено или нет прав доступа для психолога ${telegramId}`,
					this.CONTEXT
				)
				return errorResponse('Видео не найдено или нет прав доступа')
			}

			// Обновляем видео
			const updatedVideo = await this.prisma.video.update({
				where: { id: videoId },
				data: dto,
			})

			this.logger.debug(`Видео ${videoId} успешно обновлено`, this.CONTEXT)

			return successResponse(updatedVideo, 'Видео обновлено')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при обновлении видео ${videoId}`,
				error?.stack,
				this.CONTEXT,
				{ videoId, telegramId, dto, error }
			)
			return errorResponse('Ошибка при обновлении видео:', error)
		}
	}

	/**
	 * Удаление видео
	 */
	async deleteVideo(
		videoId: number,
		telegramId: string
	): Promise<{ success: boolean; message?: string }> {
		try {
			this.logger.debug(
				`Удаление видео ${videoId} для психолога ${telegramId}`,
				this.CONTEXT
			)

			// Проверяем существование видео и права доступа
			const existingVideo = await this.prisma.video.findFirst({
				where: {
					id: videoId,
					telegramId: telegramId,
				},
			})

			if (!existingVideo) {
				this.logger.warn(
					`Видео ${videoId} не найдено или нет прав доступа для психолога ${telegramId}`,
					this.CONTEXT
				)
				return errorResponse('Видео не найдено или нет прав доступа')
			}

			// Удаляем видео из облака
			await this.storageService.deleteVideo(existingVideo.key)

			// Удаляем видео из БД (каскадное удаление лайков)
			await this.prisma.video.delete({
				where: { id: videoId },
			})

			this.logger.debug(`Видео ${videoId} успешно удалено`, this.CONTEXT)

			return successResponse(null, 'Видео удалено')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при удалении видео ${videoId}`,
				error?.stack,
				this.CONTEXT,
				{ videoId, telegramId, error }
			)
			return errorResponse('Ошибка при удалении видео:', error)
		}
	}

	/**
	 * Получение списка видео психолога
	 */
	async getMyVideos(
		dto: GetMyVideosDto
	): Promise<{ success: boolean; data?: VideoListResponse; message?: string }> {
		try {
			this.logger.debug(
				`Получение видео психолога ${dto.telegramId}`,
				this.CONTEXT,
				{ limit: dto.limit, offset: dto.offset }
			)

			const [videos, total] = await Promise.all([
				this.prisma.video.findMany({
					where: { telegramId: dto.telegramId },
					orderBy: { createdAt: 'desc' },
					take: dto.limit,
					skip: dto.offset,
				}),
				this.prisma.video.count({
					where: { telegramId: dto.telegramId },
				}),
			])

			// Получаем URL для каждого видео
			const videosWithUrls: VideoWithUrl[] = await Promise.all(
				videos.map(async video => {
					const url = await this.getVideoUrl(video.key)
					return {
						...video,
						url,
					}
				})
			)

			this.logger.debug(
				`Найдено видео: ${videos.length} из ${total}`,
				this.CONTEXT
			)

			return successResponse(
				{ videos: videosWithUrls, total },
				'Список видео получен'
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при получении видео психолога ${dto.telegramId}`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse('Ошибка при получении видео:', error)
		}
	}

	/**
	 * Получение публичной ленты видео
	 */
	async getPublicVideos(
		dto: GetPublicVideosDto
	): Promise<{ success: boolean; data?: VideoListResponse; message?: string }> {
		try {
			this.logger.debug(`Получение публичной ленты видео`, this.CONTEXT, {
				limit: dto.limit,
				offset: dto.offset,
				search: dto.search,
			})

			const where: any = {
				isPublished: true,
			}

			if (dto.search) {
				where.OR = [
					{ title: { contains: dto.search, mode: 'insensitive' } },
					{ description: { contains: dto.search, mode: 'insensitive' } },
					{
						psychologist: {
							name: { contains: dto.search, mode: 'insensitive' },
						},
					},
				]
			}

			const [videos, total] = await Promise.all([
				this.prisma.video.findMany({
					where,
					include: {
						psychologist: {
							select: {
								id: true,
								name: true,
								about: true,
							},
						},
					},
					orderBy: { createdAt: 'desc' },
					take: dto.limit,
					skip: dto.offset,
				}),
				this.prisma.video.count({ where }),
			])

			// Получаем URL для каждого видео
			const videosWithUrls: VideoWithUrl[] = await Promise.all(
				videos.map(async video => {
					const url = await this.getVideoUrl(video.key)
					return {
						...video,
						url,
					}
				})
			)

			this.logger.debug(
				`Найдено публичных видео: ${videos.length} из ${total}`,
				this.CONTEXT
			)

			return successResponse(
				{ videos: videosWithUrls, total },
				'Публичная лента видео получена'
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при получении публичной ленты видео`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse('Ошибка при получении публичной ленты:', error)
		}
	}

	/**
	 * Лайк/анлайк видео
	 */
	async likeVideo(
		videoId: number,
		dto: LikeVideoDto
	): Promise<{ success: boolean; data?: LikeVideoResponse; message?: string }> {
		try {
			this.logger.debug(
				`Лайк видео ${videoId} от пользователя ${dto.userId}`,
				this.CONTEXT
			)

			// Проверяем существование видео
			const video = await this.prisma.video.findUnique({
				where: { id: videoId },
			})

			if (!video) {
				this.logger.warn(`Видео ${videoId} не найдено`, this.CONTEXT)
				return errorResponse('Видео не найдено')
			}

			// Проверяем существование пользователя
			const user = await this.prisma.user.findUnique({
				where: { telegramId: dto.userId },
			})

			if (!user) {
				this.logger.warn(`Пользователь ${dto.userId} не найден`, this.CONTEXT)
				return errorResponse('Пользователь не найден')
			}

			// Ищем существующий лайк
			const existingLike = await this.prisma.videoLike.findUnique({
				where: {
					videoId_userId: {
						videoId: videoId,
						userId: dto.userId,
					},
				},
			})

			let likesCount = video.likesCount

			if (existingLike) {
				// Убираем лайк
				await this.prisma.videoLike.delete({
					where: { id: existingLike.id },
				})
				likesCount -= 1
			} else {
				// Создаем новый лайк
				await this.prisma.videoLike.create({
					data: {
						videoId: videoId,
						userId: dto.userId,
					},
				})
				likesCount += 1
			}

			// Обновляем счетчик лайков в видео
			await this.prisma.video.update({
				where: { id: videoId },
				data: { likesCount },
			})

			this.logger.debug(
				`Лайк видео ${videoId} обновлен, новый счетчик: ${likesCount}`,
				this.CONTEXT
			)

			return successResponse(
				{ isLiked: !existingLike, likesCount },
				'Лайк обновлен'
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при лайке видео ${videoId}`,
				error?.stack,
				this.CONTEXT,
				{ videoId, dto, error }
			)
			return errorResponse('Ошибка при лайке видео:', error)
		}
	}

	/**
	 * Увеличение счетчика просмотров
	 */
	async viewVideo(
		videoId: number,
		dto: ViewVideoDto
	): Promise<{ success: boolean; message?: string }> {
		try {
			this.logger.debug(
				`Просмотр видео ${videoId} пользователем ${dto.userId}`,
				this.CONTEXT
			)

			// Проверяем существование видео
			const video = await this.prisma.video.findUnique({
				where: { id: videoId },
			})

			if (!video) {
				this.logger.warn(`Видео ${videoId} не найдено`, this.CONTEXT)
				return errorResponse('Видео не найдено')
			}

			// Увеличиваем счетчик просмотров
			await this.prisma.video.update({
				where: { id: videoId },
				data: {
					viewsCount: {
						increment: 1,
					},
				},
			})

			this.logger.debug(
				`Счетчик просмотров видео ${videoId} увеличен`,
				this.CONTEXT
			)

			return successResponse(null, 'Просмотр засчитан')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при увеличении счетчика просмотров видео ${videoId}`,
				error?.stack,
				this.CONTEXT,
				{ videoId, dto, error }
			)
			return errorResponse('Ошибка при засчете просмотра:', error)
		}
	}

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

			// Генерируем URL для каждого видео
			const videosWithUrls: VideoWithUrl[] = await Promise.all(
				videos.map(async video => {
					const url = await this.getVideoUrl(video.key)
					return {
						...video,
						url,
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
