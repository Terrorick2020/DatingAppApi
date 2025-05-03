import { Controller } from '@nestjs/common'
import { MicroController } from '@/common/abstract/micro/micro.controller'
import { ComplaintMicroService } from './complaint.micro.service'
import { MessagePattern, Payload } from '@nestjs/microservices'
import { SendComplaintTcpPatterns } from './complaint.types'
import { AppLogger } from '../common/logger/logger.service'

@Controller()     
export class ComplaintMicroController extends MicroController<ComplaintMicroService> {
	constructor(
		protected readonly complaintMicroService: ComplaintMicroService,
		private readonly logger: AppLogger
	) {
		super(complaintMicroService)
	}
 
	@MessagePattern(SendComplaintTcpPatterns.CreateComplaint)
	async handleCreateComplaint(@Payload() complaintData: any): Promise<void> {
		this.logger.debug(
			`MicroService: Создание жалобы от ${complaintData.fromUserId} на ${complaintData.reportedUserId}`,
			'ComplaintMicroController'
		) 
		await this.complaintMicroService.createComplaint(complaintData)
	}

	@MessagePattern(SendComplaintTcpPatterns.UpdateComplaint)
	async handleUpdateComplaint(@Payload() complaintData: any): Promise<void> {
		this.logger.debug(
			`MicroService: Обновление жалобы #${complaintData.complaintId}`,
			'ComplaintMicroController'
		)
		await this.complaintMicroService.updateComplaint(complaintData)
	}

	@MessagePattern(SendComplaintTcpPatterns.ComplaintStatusChanged)
	async handleStatusChange(@Payload() statusData: any): Promise<void> {
		this.logger.debug(
			`MicroService: Изменение статуса жалобы #${statusData.id} на ${statusData.status}`,
			'ComplaintMicroController'
		)
		await this.complaintMicroService.sendComplaintStatusChange(statusData)
	}
}
