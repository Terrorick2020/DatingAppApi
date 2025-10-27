import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import {
	ApiOperation,
	ApiParam,
	ApiQuery,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger'
import { AdminOnly } from '../common/decorators/admin-only.decorator'
import { AppLogger } from '../common/logger/logger.service'
import { ComplaintService } from './complaint.service'
import { CreateComplaintDto } from './dto/create-complaint.dto'
import { DeleteComplaintDto } from './dto/delete-complaint.dto'
import { GetComplaintsDto } from './dto/get-complaints.dto'
import { UpdateComplaintDto } from './dto/update-complaint.dto'

@ApiTags('complaints')
@Controller('complaints')
// @UseGuards(UserStatusGuard)
export class ComplaintController {
	constructor(
		private readonly complaintService: ComplaintService,
		private readonly logger: AppLogger
	) {}

	@ApiOperation({ summary: 'Создать новую жалобу' })
	@ApiResponse({ status: 201, description: 'Жалоба успешно создана' })
	@Post()
	// @Status('Pro', 'Noob')
	async createComplaint(@Body() createComplaintDto: CreateComplaintDto) {
		this.logger.debug(
			`Запрос на создание жалобы от ${createComplaintDto.fromUserId} на ${createComplaintDto.reportedUserId}`,
			'ComplaintController'
		)
		return this.complaintService.createComplaint(createComplaintDto)
	}

	@ApiOperation({ summary: 'Обновить статус жалобы (только для админов)' })
	@ApiResponse({ status: 200, description: 'Статус жалобы успешно обновлен' })
	@Post('update')
	@AdminOnly()
	async updateComplaint(@Body() updateComplaintDto: UpdateComplaintDto) {
		this.logger.debug(
			`Запрос на обновление жалобы #${updateComplaintDto.complaintId} админом ${updateComplaintDto.adminId}`,
			'ComplaintController'
		)
		return this.complaintService.updateComplaint(updateComplaintDto)
	}

	@ApiOperation({ summary: 'Удалить жалобу (только для админов)' })
	@ApiResponse({ status: 200, description: 'Жалоба успешно удалена' })
	@Post('delete')
	@AdminOnly()
	async deleteComplaint(@Body() deleteComplaintDto: DeleteComplaintDto) {
		this.logger.debug(
			`Запрос на удаление жалобы #${deleteComplaintDto.complaintId} админом ${deleteComplaintDto.adminId}`,
			'ComplaintController'
		)
		return this.complaintService.deleteComplaint(deleteComplaintDto)
	}

	@ApiOperation({ summary: 'Получить жалобы пользователя' })
	@ApiResponse({ status: 200, description: 'Список жалоб успешно получен' })
	@Get()
	// @Status('Pro', 'Noob', 'Admin')
	async getComplaints(@Query() getComplaintsDto: GetComplaintsDto) {
		this.logger.debug(
			`Запрос на получение жалоб типа ${getComplaintsDto.type}, статуса ${getComplaintsDto.status} для пользователя ${getComplaintsDto.telegramId}`,
			'ComplaintController'
		)
		return this.complaintService.getComplaints(getComplaintsDto)
	}

	@ApiOperation({ summary: 'Получить статистику жалоб (только для админов)' })
	@ApiResponse({
		status: 200,
		description: 'Статистика жалоб успешно получена',
	})
	@ApiParam({
		name: 'adminId',
		description: 'ID администратора',
	})
	@Get('stats/:adminId')
	@AdminOnly()
	async getComplaintStats(@Param('adminId') adminId: string) {
		this.logger.debug(
			`Запрос на получение статистики жалоб от админа ${adminId}`,
			'ComplaintController'
		)
		return this.complaintService.getComplaintStats(adminId)
	}

	@ApiOperation({
		summary: 'Получить список пользователей с жалобами (только для админов)',
	})
	@ApiResponse({
		status: 200,
		description: 'Список пользователей с жалобами успешно получен',
	})
	@ApiParam({
		name: 'adminId',
		description: 'ID администратора',
	})
	@ApiQuery({
		name: 'status',
		description: 'Статус жалоб для фильтрации',
		required: false,
		enum: ['PENDING', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED', 'DELETED'],
	})
	@Get('users-with-complaints/:adminId')
	@AdminOnly()
	async getUsersWithComplaints(
		@Param('adminId') adminId: string,
		@Query('status') status?: string
	) {
		this.logger.debug(
			`Запрос на получение списка пользователей с жалобами от админа ${adminId}`,
			'ComplaintController'
		)
		return this.complaintService.getUsersWithComplaints(adminId, status as any)
	}
}
