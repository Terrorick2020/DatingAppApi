import { Controller } from '@nestjs/common'
import { MicroController } from '@/common/abstract/micro/micro.controller'
import { LikeMicroService } from './like.micro.service'
import { MessagePattern, Payload } from '@nestjs/microservices'
import { SendMatchTcpPatterns } from './like.types'
import { LikeTriggerDto } from './dto/like-trigger.dto'
import { AppLogger } from '../common/logger/logger.service'

@Controller()
export class LikeMicroController extends MicroController<LikeMicroService> {
	constructor(
		protected readonly likeMicroService: LikeMicroService,
		private readonly logger: AppLogger
	) {
		super(likeMicroService)
	}

	@MessagePattern(SendMatchTcpPatterns.Trigger)
	async handleLikeTrigger(
		@Payload() triggerDto: LikeTriggerDto
	): Promise<void> {
		this.logger.debug(
			`MicroService: Обработка триггера лайка для ${triggerDto.telegramId} от ${triggerDto.fromUser.id}`,
			'LikeMicroController'
		)
		await this.likeMicroService.sendLikeTrigger(triggerDto)
	}
}
