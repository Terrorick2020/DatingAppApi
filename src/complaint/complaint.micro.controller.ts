import { Controller } from '@nestjs/common'
import { MessagePattern, Payload } from '@nestjs/microservices'
import { ComplaintService } from './complaint.service'
import { AppLogger } from '../common/logger/logger.service'
import { RedisPubSubService } from '../common/redis-pub-sub/redis-pub-sub.service'
import { ComplaintStatus, SendComplaintTcpPatterns } from './complaint.types'

@Controller()
export class ComplaintMicroController {
	constructor(
		private readonly complaintService: ComplaintService,
		private readonly logger: AppLogger,
		private readonly redisPubSub: RedisPubSubService
	) {}

	@MessagePattern('getUserComplaints')
	async getUserComplaints(
		@Payload() data: { userId: string; type: 'sent' | 'received' | 'admin' }
	) {
		this.logger.debug(
			`TCP: Получение жалоб пользователя ${data.userId} типа ${data.type}`,
			'ComplaintMicroController'
		)

		return this.complaintService.getComplaints({
			telegramId: data.userId,
			type: data.type,
			status: ComplaintStatus.UNDER_REVIEW
		})
	}

	@MessagePattern('getComplaintStats')
	async getComplaintStats(@Payload() data: { adminId: string }) {
		this.logger.debug(
			`TCP: Получение статистики жалоб для админа ${data.adminId}`,
			'ComplaintMicroController'
		)

		return this.complaintService.getComplaintStats(data.adminId)
	}

	@MessagePattern('checkUserRole')
	async checkUserRole(@Payload() data: { userId: string }) {
		this.logger.debug(
			`TCP: Проверка роли пользователя ${data.userId}`,
			'ComplaintMicroController'
		)

		// Проверка роли пользователя через Prisma
		const user = await this.complaintService['prisma'].user.findUnique({
			where: { telegramId: data.userId },
			select: { role: true },
		})

		return user || { role: null }
	}

	@MessagePattern(SendComplaintTcpPatterns.CreateComplaint)
	async handleCreateComplaint(@Payload() complaintData: any) {
		this.logger.debug(
			`TCP: Создание жалобы от ${complaintData.fromUserId} на ${complaintData.reportedUserId}`,
			'ComplaintMicroController'
		)

		// В данном случае, мы только публикуем событие, так как основная обработка
		// происходит в WebSocket сервере
		await this.redisPubSub.publishComplaintUpdate({
			id: complaintData.id || complaintData.complaintId,
			fromUserId: complaintData.fromUserId,
			reportedUserId: complaintData.reportedUserId,
			status: complaintData.status,
			timestamp: Date.now(),
		})

		return { success: true }
	}

	@MessagePattern(SendComplaintTcpPatterns.UpdateComplaint)
	async handleUpdateComplaint(@Payload() complaintData: any) {
		this.logger.debug(
			`TCP: Обновление жалобы #${complaintData.complaintId} со статусом ${complaintData.status}`,
			'ComplaintMicroController'
		)

		// В данном случае, мы только публикуем событие, так как основная обработка
		// происходит в WebSocket сервере
		await this.redisPubSub.publishComplaintUpdate({
			id: complaintData.id || complaintData.complaintId,
			fromUserId: complaintData.fromUserId,
			reportedUserId: complaintData.reportedUserId,
			status: complaintData.status,
			timestamp: Date.now(),
		})

		return { success: true }
	}

	@MessagePattern(SendComplaintTcpPatterns.ComplaintStatusChanged)
	async handleStatusChange(@Payload() statusData: any) {
		this.logger.debug(
			`TCP: Изменение статуса жалобы #${statusData.id} на ${statusData.status}`,
			'ComplaintMicroController'
		)

		// Публикуем событие изменения статуса жалобы
		await this.redisPubSub.publishComplaintUpdate({
			id: statusData.id,
			fromUserId: statusData.fromUserId,
			reportedUserId: statusData.reportedUserId,
			status: statusData.status,
			timestamp: statusData.timestamp || Date.now(),
		})

		return { success: true }
	}
}
