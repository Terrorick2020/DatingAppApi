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
import { GetMyVideosDto, GetPublicVideosDto } from './dto/get-videos.dto'
import { LikeShortVideoDto } from './dto/like-short-video.dto'
import { LikeVideoDto } from './dto/like-video.dto'
import { UpdateVideoDto } from './dto/update-video.dto'
import { SaveVideoDto, UploadVideoDto } from './dto/upload-video.dto'
import { ViewShortVideoDto } from './dto/view-short-video.dto'
import { ViewVideoDto } from './dto/view-video.dto'
import { VideoService } from './video.service'

@Controller('video')
export class VideoController {
	private readonly CONTEXT = 'VideoController'

	constructor(
		private readonly videoService: VideoService,
		private readonly logger: AppLogger
	) {}

	/**
	 * Загрузка видео в облако
	 */
	@Post('upload')
	// @UseGuards(UserStatusGuard)
	@UseInterceptors(FileInterceptor('video'))
	async uploadVideo(
		@UploadedFile() video: Express.Multer.File,
		@Body() dto: UploadVideoDto
	) {
		this.logger.debug(
			`Запрос на загрузку видео от психолога ${dto.telegramId}`,
			this.CONTEXT
		)

		return this.videoService.uploadVideo(video, dto)
	}

	/**
	 * Сохранение видео в базе данных
	 */
	@Post('save')
	// @UseGuards(UserStatusGuard)
	async saveVideo(@Body() dto: SaveVideoDto) {
		this.logger.debug(
			`Запрос на сохранение видео от психолога ${dto.telegramId}`,
			this.CONTEXT
		)

		return this.videoService.saveVideo(dto)
	}

	/**
	 * Обновление видео
	 */
	@Patch(':id')
	// @UseGuards(UserStatusGuard)
	async updateVideo(
		@Param('id', ParseIntPipe) videoId: number,
		@Body() dto: UpdateVideoDto,
		@Query('telegramId') telegramId: string
	) {
		this.logger.debug(
			`Запрос на обновление видео ${videoId} от психолога ${telegramId}`,
			this.CONTEXT
		)

		return this.videoService.updateVideo(videoId, telegramId, dto)
	}

	/**
	 * Удаление видео
	 */
	@Delete(':id')
	// @UseGuards(UserStatusGuard)
	async deleteVideo(
		@Param('id', ParseIntPipe) videoId: number,
		@Query('telegramId') telegramId: string
	) {
		this.logger.debug(
			`Запрос на удаление видео ${videoId} от психолога ${telegramId}`,
			this.CONTEXT
		)

		return this.videoService.deleteVideo(videoId, telegramId)
	}

	/**
	 * Получение списка видео психолога
	 */
	@Get('my')
	// @UseGuards(UserStatusGuard)
	async getMyVideos(@Query() dto: GetMyVideosDto) {
		this.logger.debug(
			`Запрос на получение видео психолога ${dto.telegramId}`,
			this.CONTEXT
		)

		return this.videoService.getMyVideos(dto)
	}

	/**
	 * Получение публичной ленты видео
	 */
	@Get('public')
	// @UseGuards(UserStatusGuard)
	async getPublicVideos(@Query() dto: GetPublicVideosDto) {
		this.logger.debug(
			`Запрос на получение публичной ленты видео`,
			this.CONTEXT,
			{ search: dto.search, limit: dto.limit, offset: dto.offset }
		)

		return this.videoService.getPublicVideos(dto)
	}

	/**
	 * Лайк/анлайк видео
	 */
	@Post(':id/like')
	// @UseGuards(UserStatusGuard)
	async likeVideo(
		@Param('id', ParseIntPipe) videoId: number,
		@Body() dto: LikeVideoDto
	) {
		this.logger.debug(
			`Запрос на лайк видео ${videoId} от пользователя ${dto.userId}`,
			this.CONTEXT
		)

		return this.videoService.likeVideo(videoId, dto)
	}

	/**
	 * Увеличение счетчика просмотров
	 */
	@Post(':id/view')
	// @UseGuards(UserStatusGuard)
	async viewVideo(
		@Param('id', ParseIntPipe) videoId: number,
		@Body() dto: ViewVideoDto
	) {
		this.logger.debug(
			`Запрос на просмотр видео ${videoId} от пользователя ${dto.userId}`,
			this.CONTEXT
		)

		return this.videoService.viewVideo(videoId, dto)
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
}
