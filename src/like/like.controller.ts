import {
	Controller,
	Post,
	Body,
	Get,
	Query,
	Delete,
	Param,
	UseGuards,
} from '@nestjs/common'
import { LikeService } from './like.service'
import { CreateLikeDto } from './dto/create-like.dto'
import { GetLikesDto } from './dto/get-likes.dto'
import { UserStatusGuard } from '../common/guards/user-status.guard'
import { Status } from '../common/decorators/status.decorator'
import {
	ApiTags,
	ApiOperation,
	ApiParam,
	ApiQuery,
	ApiBody,
	ApiResponse,
} from '@nestjs/swagger'

@ApiTags('likes')
@Controller('likes')
export class LikeController {
	constructor(private readonly likeService: LikeService) {}

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
	@UseGuards(UserStatusGuard)
	@Status('Pro', 'Noob')
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
}
