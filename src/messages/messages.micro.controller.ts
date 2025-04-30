// src/messages/messages.micro.controller.ts
import { Controller } from '@nestjs/common'
import { MicroController } from '@/common/abstract/micro/micro.controller'
import { MessagesMicroService } from './messages.micro.service'
import { MessagePattern, Payload } from '@nestjs/microservices'
import { UpdateMicroPartnerDto } from './dto/update-partner.micro.dto'
import { UpdateMicroMsgDto } from './dto/update-msg.micro.dto'
import { SendMsgsTcpPatterns } from './messages.type'
import { AppLogger } from '../common/logger/logger.service'

@Controller()
export class MessagesMicroController extends MicroController<MessagesMicroService> {
	constructor(
		protected readonly messagesMicroService: MessagesMicroService,
		private readonly logger: AppLogger
	) {
		super(messagesMicroService)
	}

	@MessagePattern(SendMsgsTcpPatterns.UpdatePartner)
	async updatePartnerStatus(
		@Payload() updatePartnerDto: UpdateMicroPartnerDto
	): Promise<void> {
		this.logger.debug(
			`MicroService: Обновление статуса собеседника для ${updatePartnerDto.telegramId}`,
			'MessagesMicroController'
		)
		await this.messagesMicroService.sendUpdatePartner(updatePartnerDto)
	}

	@MessagePattern(SendMsgsTcpPatterns.UpdateMsg)
	async updateMessage(
		@Payload() updateMsgDto: UpdateMicroMsgDto
	): Promise<void> {
		this.logger.debug(
			`MicroService: Обновление сообщения ${updateMsgDto.msgId} в чате ${updateMsgDto.chatId}`,
			'MessagesMicroController'
		)
		await this.messagesMicroService.sendUpdateMsg(updateMsgDto)
	}
}
