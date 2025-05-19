import {
	WebSocketGateway,
	SubscribeMessage,
	MessageBody,
	ConnectedSocket,
} from '@nestjs/websockets'
import { Socket } from 'socket.io'
import { ComplaintService } from './complaint.service'
import { AppLogger } from '../common/logger/logger.service'
import { RedisPubSubService } from '../common/redis-pub-sub/redis-pub-sub.service'

@WebSocketGateway({
	namespace: 'complaints',
	cors: {
		origin: '*',
	},
})
export class ComplaintGateway {
	constructor(
		private readonly complaintService: ComplaintService,
		private readonly logger: AppLogger,
		private readonly redisPubSub: RedisPubSubService
	) {}

	@SubscribeMessage('create_complaint')
	async handleCreateComplaint(
		@MessageBody()
		data: {
			fromUserId: string
			reportedUserId: string
			type: string
			description: string
			reportedContentId?: string
		},
		@ConnectedSocket() client: Socket
	) {
		this.logger.debug(
			`WS: Создание жалобы от ${data.fromUserId} на ${data.reportedUserId}`,
			'ComplaintGateway'
		)

		// Создаем жалобу через сервис
		const result = await this.complaintService.createComplaint(data)

		// Если успешно создана жалоба, публикуем событие для админов
		if (result.success && result.data) {
			await this.redisPubSub.publishComplaintUpdate({
				id: result.data.id.toString(),
				fromUserId: data.fromUserId,
				reportedUserId: data.reportedUserId,
				status: 'PENDING',
				timestamp: Date.now(),
			})
		}

		return result
	}

	@SubscribeMessage('get_complaints')
	async handleGetComplaints(
		@MessageBody()
		data: { telegramId: string; type: 'sent' | 'received' | 'admin' },
		@ConnectedSocket() client: Socket
	) {
		this.logger.debug(
			`WS: Получение жалоб для пользователя ${data.telegramId}, тип: ${data.type}`,
			'ComplaintGateway'
		)

		// Получаем жалобы через сервис
		const result = await this.complaintService.getComplaints(data)

		return result
	}

	@SubscribeMessage('update_complaint')
	async handleUpdateComplaint(
		@MessageBody()
		data: {
			telegramId: string // ID админа
			complaintId: string
			status: string
			resolutionNotes?: string
		},
		@ConnectedSocket() client: Socket
	) {
		this.logger.debug(
			`WS: Обновление жалобы ${data.complaintId} админом ${data.telegramId}`,
			'ComplaintGateway'
		)

		// Обновляем жалобу через сервис
		const result = await this.complaintService.updateComplaint(data)

		// Если успешно обновлена жалоба, публикуем событие
		if (result.success && result.data) {
			await this.redisPubSub.publishComplaintUpdate({
				id: data.complaintId,
				fromUserId: result.data.fromUserId,
				reportedUserId: result.data.reportedUserId,
				status: data.status,
				timestamp: Date.now(),
			})
		}

		return result
	}
}
