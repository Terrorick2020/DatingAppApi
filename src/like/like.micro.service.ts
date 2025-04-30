import { Injectable } from '@nestjs/common'
import { AppLogger } from '@/common/logger/logger.service'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '~/prisma/prisma.service'
import { RedisService } from '@/redis/redis.service'
import { MicroService } from '@/common/abstract/micro/micro.service'
import { LikeTriggerDto } from './dto/like-trigger.dto'
import { SendMatchTcpPatterns } from './like.types'

@Injectable()
export class LikeMicroService extends MicroService {
	constructor(
		protected readonly appLoger: AppLogger,
		protected readonly prismaService: PrismaService,
		protected readonly redisService: RedisService,
		protected readonly configService: ConfigService
	) {
		super(appLoger, configService, prismaService, redisService)
	}

	/**
	 * Отправка события лайка
	 */
	async sendLikeTrigger(triggerDto: LikeTriggerDto): Promise<void> {
		this.sendRequest<SendMatchTcpPatterns, LikeTriggerDto>(
			SendMatchTcpPatterns.Trigger,
			triggerDto,
			`Уведомление о взаимной симпатии от пользователя: ${triggerDto.fromUser.id} к пользователю: ${triggerDto.telegramId}`
		)
	}
}
