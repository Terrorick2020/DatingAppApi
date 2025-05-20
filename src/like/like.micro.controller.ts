import { Controller } from '@nestjs/common'
import { MessagePattern, Payload } from '@nestjs/microservices'
import { LikeService } from './like.service'
import { AppLogger } from '../common/logger/logger.service'

@Controller()
export class LikeMicroController {
	constructor(
		private readonly likeService: LikeService,
		private readonly logger: AppLogger
	) {}

	@MessagePattern('getUserLikes')
	async getUserLikes(
		@Payload() data: { userId: string; type: 'sent' | 'received' | 'matches' }
	) {
		this.logger.debug(
			`TCP: Получение лайков пользователя ${data.userId} типа ${data.type}`,
			'LikeMicroController'
		)

		const result = await this.likeService.getLikes({
			telegramId: data.userId,
			type: data.type,
		})

		return result
	}

	@MessagePattern('createLike')
	async createLike(@Payload() data: { fromUserId: string; toUserId: string }) {
		this.logger.debug(
			`TCP: Создание лайка от ${data.fromUserId} к ${data.toUserId}`,
			'LikeMicroController'
		)

		const result = await this.likeService.createLike({
			fromUserId: data.fromUserId,
			toUserId: data.toUserId,
		})

		return result
	}

	@MessagePattern('deleteLike')
	async deleteLike(@Payload() data: { fromUserId: string; toUserId: string }) {
		this.logger.debug(
			`TCP: Удаление лайка от ${data.fromUserId} к ${data.toUserId}`,
			'LikeMicroController'
		)

		const result = await this.likeService.deleteLike(
			data.fromUserId,
			data.toUserId
		)
		return result
	}
}
