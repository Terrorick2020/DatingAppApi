import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseIntPipe,
	Patch,
	Post,
	Query,
	UploadedFile,
	UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { AppLogger } from '../common/logger/logger.service'
import { GetShortVideosDto } from './dto/get-short-videos.dto'
import { LikeShortVideoDto } from './dto/like-short-video.dto'
import { UpdateVideoDto } from './dto/update-video.dto'
import { SaveVideoDto, UploadVideoDto } from './dto/upload-video.dto'
import { ViewShortVideoDto } from './dto/view-short-video.dto'
import { VideoService } from './video.service'

@Controller('video')
export class VideoController {
	private readonly CONTEXT = 'VideoController'

	constructor(
		private readonly videoService: VideoService,
		private readonly logger: AppLogger
	) {}

	/**
	 * Загрузка короткого видео в облако
	 */
	@Post('short-videos/upload')
	// @UseGuards(UserStatusGuard)
	@UseInterceptors(FileInterceptor('video'))
	async uploadShortVideo(
		@UploadedFile() video: Express.Multer.File,
		@Body() dto: UploadVideoDto
	) {
		this.logger.debug(
			`Запрос на загрузку короткого видео от психолога ${dto.telegramId}`,
			this.CONTEXT
		)

		return this.videoService.uploadShortVideo(video, dto)
	}

	/**
	 * Сохранение короткого видео в базе данных
	 */
	@Post('short-videos/save')
	// @UseGuards(UserStatusGuard)
	async saveShortVideo(@Body() dto: SaveVideoDto) {
		this.logger.debug(
			`Запрос на сохранение короткого видео от психолога ${dto.telegramId}`,
			this.CONTEXT
		)

		return this.videoService.saveShortVideo(dto)
	}

	/**
	 * Обновление короткого видео
	 */
	@Patch('short-videos/:id')
	// @UseGuards(UserStatusGuard)
	async updateShortVideo(
		@Param('id', ParseIntPipe) videoId: number,
		@Body() dto: UpdateVideoDto,
		@Query('telegramId') telegramId: string
	) {
		this.logger.debug(
			`Запрос на обновление короткого видео ${videoId} от психолога ${telegramId}`,
			this.CONTEXT
		)

		return this.videoService.updateShortVideo(videoId, telegramId, dto)
	}

	/**
	 * Удаление короткого видео
	 */
	@Delete('short-videos/:id')
	// @UseGuards(UserStatusGuard)
	async deleteShortVideo(
		@Param('id', ParseIntPipe) videoId: number,
		@Query('telegramId') telegramId: string
	) {
		this.logger.debug(
			`Запрос на удаление короткого видео ${videoId} от психолога ${telegramId}`,
			this.CONTEXT
		)

		return this.videoService.deleteShortVideo(videoId, telegramId)
	}

	/**
	 * Получение списка моих коротких видео
	 */
	@Get('short-videos/my')
	// @UseGuards(UserStatusGuard)
	async getMyShortVideos(@Query() dto: GetShortVideosDto) {
		this.logger.debug(
			`Запрос на получение коротких видео психолога ${dto.telegramId}`,
			this.CONTEXT
		)

		return this.videoService.getMyShortVideos(dto)
	}

	/**
	 * Получение ленты коротких видео для пользователей
	 */
	@Get('short-videos/feed')
	// @UseGuards(UserStatusGuard)
	async getShortVideosFeed(@Query() dto: GetShortVideosDto) {
		this.logger.debug(
			`Запрос на получение ленты коротких видео от пользователя ${dto.telegramId}`,
			this.CONTEXT,
			{ limit: dto.limit, offset: dto.offset }
		)

		return this.videoService.getShortVideosFeed(
			dto.telegramId,
			dto.limit,
			dto.offset
		)
	}

	/**
	 * Поиск видео 
	 */
	@Get('short-videos/search')
	async searchShortVideos(@Query() dto: GetShortVideosDto) {
		this.logger.debug(
			`Запрос на поиск коротких видео по запросу: ${dto.search}`,
			this.CONTEXT,
			{ limit: dto.limit, offset: dto.offset }
		)

		return this.videoService.searchShortVideos(
			dto.search || '',
			dto.limit,
			dto.offset,
			dto.telegramId
		)
	}

	/**
	 * Лайк/дизлайк короткого видео
	 */
	@Post('short-videos/:videoId/like')
	// @UseGuards(UserStatusGuard)
	async likeShortVideo(
		@Param('videoId', ParseIntPipe) videoId: number,
		@Body() dto: LikeShortVideoDto
	) {
		this.logger.debug(
			`Запрос на лайк короткого видео ${videoId} от пользователя ${dto.telegramId}`,
			this.CONTEXT
		)

		return this.videoService.likeShortVideo(videoId, dto.telegramId)
	}

	/**
	 * Увеличение счетчика просмотров короткого видео
	 */
	@Post('short-videos/:videoId/view')
	// @UseGuards(UserStatusGuard)
	async viewShortVideo(
		@Param('videoId', ParseIntPipe) videoId: number,
		@Body() dto: ViewShortVideoDto
	) {
		this.logger.debug(
			`Запрос на просмотр короткого видео ${videoId} от пользователя ${dto.telegramId}`,
			this.CONTEXT
		)

		return this.videoService.incrementShortVideoViews(videoId, dto.telegramId)
	}

	/**
	 * Создание превью для существующего видео
	 */
	@Post('short-videos/:videoId/preview')
	// @UseGuards(UserStatusGuard)
	async createVideoPreview(
		@Param('videoId', ParseIntPipe) videoId: number,
		@Query('telegramId') telegramId: string
	) {
		this.logger.debug(
			`Запрос на создание превью для видео ${videoId} от психолога ${telegramId}`,
			this.CONTEXT
		)

		return this.videoService.createVideoPreview(videoId, telegramId)
	}
}
