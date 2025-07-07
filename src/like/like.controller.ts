import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Post,
	Query,
	UseGuards,
} from '@nestjs/common'
import {
	ApiBody,
	ApiOperation,
	ApiParam,
	ApiQuery,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger'
import { Status } from '../common/decorators/status.decorator'
import { UserStatusGuard } from '../common/guards/user-status.guard'
import { ExpiredMatchesService } from './expired-matches.service'
import { CreateLikeDto } from './dto/create-like.dto'
import { GetLikesDto } from './dto/get-likes.dto'
import { MarkLikesReadDto } from './dto/mark-likes-read.dto'
import { LikeService } from './like.service'

@ApiTags('likes')
@Controller('likes')
export class LikeController {
	constructor(
		private readonly likeService: LikeService,
		private readonly expiredMatchesService: ExpiredMatchesService
	) {}

	@ApiOperation({ summary: 'Создать новую симпатию' })
	@ApiBody({ type: CreateLikeDto })
	@ApiResponse({
		status: 201,
		description: 'Симпатия успешно создана',
		schema: {
			properties: {
				success: { type: 'boolean', example: true },
				message: { type: 'string', example: 'Симпатия отправлена' },
				data: {
					type: 'object',
					properties: {
						like: {
							type: 'object',
							properties: {
								id: { type: 'number', example: 1 },
								fromUserId: { type: 'string', example: '123456789' },
								toUserId: { type: 'string', example: '987654321' },
								isMatch: { type: 'boolean', example: false },
								createdAt: { type: 'string', format: 'date-time' },
							},
						},
						isMatch: { type: 'boolean', example: false },
					},
				},
			},
		},
	})
	@ApiResponse({
		status: 400,
		description: 'Ошибка при создании симпатии',
		schema: {
			properties: {
				success: { type: 'boolean', example: false },
				message: {
					type: 'string',
					example: 'Вы уже проявили симпатию к этому пользователю',
				},
				errors: { type: 'object' },
			},
		},
	})
	@Post()
	// @UseGuards(UserStatusGuard)
	// @Status('Pro', 'Noob')
	async createLike(@Body() createLikeDto: CreateLikeDto) {
		return this.likeService.createLike(createLikeDto)
	}

	@ApiOperation({ summary: 'Получить список симпатий' })
	@ApiQuery({
		name: 'telegramId',
		required: true,
		description: 'Telegram ID пользователя',
	})
	@ApiQuery({
		name: 'type',
		required: true,
		enum: ['sent', 'received', 'matches'],
		description: 'Тип симпатий (отправленные, полученные, взаимные)',
	})
	@ApiResponse({
		status: 200,
		description: 'Список симпатий успешно получен',
		schema: {
			properties: {
				success: { type: 'boolean', example: true },
				message: { type: 'string', example: 'Отправленные симпатии получены' },
				data: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							id: { type: 'number', example: 1 },
							fromUserId: { type: 'string', example: '123456789' },
							toUserId: { type: 'string', example: '987654321' },
							isMatch: { type: 'boolean', example: false },
							createdAt: { type: 'string', format: 'date-time' },
							chatId: {
								type: 'string',
								example: 'uuid',
								description: 'ID чата (только для взаимных симпатий)',
							},
							fromUser: {
								type: 'object',
								properties: {
									telegramId: { type: 'string' },
									name: { type: 'string' },
									age: { type: 'number' },
									town: { type: 'string' },
									photos: {
										type: 'array',
										items: {
											type: 'object',
											properties: {
												id: { type: 'number' },
												key: { type: 'string' },
											},
										},
									},
								},
							},
							toUser: {
								type: 'object',
								properties: {
									telegramId: { type: 'string' },
									name: { type: 'string' },
									age: { type: 'number' },
									town: { type: 'string' },
									photos: {
										type: 'array',
										items: {
											type: 'object',
											properties: {
												id: { type: 'number' },
												key: { type: 'string' },
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
	})
	@Get()
	@UseGuards(UserStatusGuard)
	@Status('Pro', 'Noob')
	async getLikes(@Query() getLikesDto: GetLikesDto) {
		return this.likeService.getLikes(getLikesDto)
	}

	@ApiOperation({ summary: 'Удалить симпатию' })
	@ApiParam({
		name: 'fromUserId',
		required: true,
		description: 'Telegram ID отправителя симпатии',
	})
	@ApiParam({
		name: 'toUserId',
		required: true,
		description: 'Telegram ID получателя симпатии',
	})
	@ApiResponse({
		status: 200,
		description: 'Симпатия успешно удалена',
		schema: {
			properties: {
				success: { type: 'boolean', example: true },
				message: { type: 'string', example: 'Симпатия удалена' },
				data: { type: 'null' },
			},
		},
	})
	@ApiResponse({
		status: 404,
		description: 'Симпатия не найдена',
		schema: {
			properties: {
				success: { type: 'boolean', example: false },
				message: { type: 'string', example: 'Симпатия не найдена' },
				errors: { type: 'object' },
			},
		},
	})
	@Delete(':fromUserId/:toUserId')
	@UseGuards(UserStatusGuard)
	@Status('Pro', 'Noob')
	async deleteLike(
		@Param('fromUserId') fromUserId: string,
		@Param('toUserId') toUserId: string
	) {
		return this.likeService.deleteLike(fromUserId, toUserId)
	}

	@ApiOperation({ summary: 'Отметить все непрочитанные лайки как прочитанные' })
	@ApiBody({ type: MarkLikesReadDto })
	@ApiResponse({
		status: 200,
		description: 'Лайки успешно отмечены как прочитанные',
		schema: {
			properties: {
				success: { type: 'boolean', example: true },
				message: {
					type: 'string',
					example: 'Отмечено 5 лайков как прочитанных',
				},
				data: {
					type: 'object',
					properties: {
						updatedCount: { type: 'number', example: 5 },
					},
				},
			},
		},
	})
	@Post('mark-read')
	@UseGuards(UserStatusGuard)
	@Status('Pro', 'Noob')
	async markLikesAsRead(@Body() markLikesReadDto: MarkLikesReadDto) {
		return this.likeService.markLikesAsRead(markLikesReadDto)
	}

	@ApiOperation({ summary: 'Получить количество непрочитанных лайков' })
	@ApiParam({
		name: 'telegramId',
		required: true,
		description: 'Telegram ID пользователя',
	})
	@ApiResponse({
		status: 200,
		description: 'Количество непрочитанных лайков получено',
		schema: {
			properties: {
				success: { type: 'boolean', example: true },
				message: {
					type: 'string',
					example: 'Количество непрочитанных лайков: 3',
				},
				data: {
					type: 'object',
					properties: {
						count: { type: 'number', example: 3 },
					},
				},
			},
		},
	})
	@Get('unread-count/:telegramId')
	@UseGuards(UserStatusGuard)
	@Status('Pro', 'Noob')
	async getUnreadLikesCount(@Param('telegramId') telegramId: string) {
		return this.likeService.getUnreadLikesCount(telegramId)
	}

	@ApiOperation({ summary: 'Получить список непрочитанных лайков' })
	@ApiParam({
		name: 'telegramId',
		required: true,
		description: 'Telegram ID пользователя',
	})
	@ApiResponse({
		status: 200,
		description: 'Список непрочитанных лайков получен',
		schema: {
			properties: {
				success: { type: 'boolean', example: true },
				message: { type: 'string', example: 'Непрочитанные лайки получены' },
				data: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							id: { type: 'number', example: 1 },
							fromUserId: { type: 'string', example: '123456789' },
							toUserId: { type: 'string', example: '987654321' },
							isMatch: { type: 'boolean', example: false },
							isRead: { type: 'boolean', example: false },
							createdAt: { type: 'string', format: 'date-time' },
							fromUser: {
								type: 'object',
								properties: {
									telegramId: { type: 'string' },
									name: { type: 'string' },
									age: { type: 'number' },
									town: { type: 'string' },
									photoUrl: { type: 'string' },
								},
							},
						},
					},
				},
			},
		},
	})
	@Get('unread/:telegramId')
	@UseGuards(UserStatusGuard)
	@Status('Pro', 'Noob')
	async getUnreadLikes(@Param('telegramId') telegramId: string) {
		return this.likeService.getUnreadLikes(telegramId)
	}

	@ApiOperation({ summary: 'Очистить истекшие матчи (ручная очистка)' })
	@ApiResponse({ status: 200, description: 'Истекшие матчи очищены' })
	@Post('cleanup-expired-matches')
	async cleanupExpiredMatches() {
		await this.expiredMatchesService.cleanupExpiredMatchesManual()
		return { success: true, message: 'Истекшие матчи очищены' }
	}
}
