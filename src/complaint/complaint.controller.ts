import {
	Controller,
	Get,
	Post,
	Body,
	Param,
	Query,
	UseGuards,
} from '@nestjs/common'
import { ComplaintService } from './complaint.service'
import { CreateComplaintDto } from './dto/create-complaint.dto'
import { UpdateComplaintDto } from './dto/update-complaint.dto'
import { GetComplaintsDto } from './dto/get-complaints.dto'
import { UserStatusGuard } from '../common/guards/user-status.guard'
import { Status } from '../common/decorators/status.decorator'
import { AdminOnly } from '../common/decorators/admin-only.decorator'
import {
	ApiTags,
	ApiOperation,
	ApiResponse,
	ApiParam,
	ApiQuery,
} from '@nestjs/swagger'
import { AppLogger } from '../common/logger/logger.service'

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
			`Запрос на обновление жалобы #${updateComplaintDto.complaintId} админом ${updateComplaintDto.telegramId}`,
			'ComplaintController'
		)
		return this.complaintService.updateComplaint(updateComplaintDto)
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
		name: 'telegramId',
		description: 'ID администратора',
	})
	@Get('stats/:telegramId')
	@AdminOnly()
	async getComplaintStats(@Param('telegramId') telegramId: string) {
		this.logger.debug(
			`Запрос на получение статистики жалоб от админа ${telegramId}`,
			'ComplaintController'
		)
		return this.complaintService.getComplaintStats(telegramId)
	}
}
