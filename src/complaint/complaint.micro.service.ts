import { Injectable } from '@nestjs/common'
import { AppLogger } from '@/common/logger/logger.service'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '~/prisma/prisma.service'
import { RedisService } from '@/redis/redis.service'
import { MicroService } from '@/common/abstract/micro/micro.service'
import { SendComplaintTcpPatterns } from './complaint.types'

@Injectable()
export class ComplaintMicroService extends MicroService {
	constructor(
		protected readonly appLoger: AppLogger,
		protected readonly prismaService: PrismaService,
		protected readonly redisService: RedisService,
		protected readonly configService: ConfigService
	) {
		super(appLoger, configService, prismaService, redisService)
	}

	/**
	 * Отправка события создания жалобы
	 */
	async createComplaint(complaintData: any): Promise<void> {
		this.sendRequest<SendComplaintTcpPatterns, any>(
			SendComplaintTcpPatterns.CreateComplaint,
			complaintData,
			`Создание жалобы от пользователя: ${complaintData.fromUserId} на пользователя: ${complaintData.reportedUserId}`
		)
	}

	/**
	 * Отправка события обновления жалобы
	 */
	async updateComplaint(complaintData: any): Promise<void> {
		this.sendRequest<SendComplaintTcpPatterns, any>(
			SendComplaintTcpPatterns.UpdateComplaint,
			complaintData,
			`Обновление жалобы #${complaintData.complaintId} со статусом: ${complaintData.status}`
		)
	}

	/**
	 * Отправка события изменения статуса жалобы
	 */
	async sendComplaintStatusChange(statusData: any): Promise<void> {
		this.sendRequest<SendComplaintTcpPatterns, any>(
			SendComplaintTcpPatterns.ComplaintStatusChanged,
			statusData,
			`Изменение статуса жалобы #${statusData.id} на ${statusData.status}`
		)
	}
}
