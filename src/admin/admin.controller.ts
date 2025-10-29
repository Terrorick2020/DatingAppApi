import { Controller, Get, Param, Patch } from '@nestjs/common'
import { AdminOnly } from '../common/decorators/admin-only.decorator'
import { AdminService } from './admin.service'

// Guard - админ
@Controller('admin')
export class AdminController {
	constructor(private readonly adminService: AdminService) {}

	@Patch(':telegramId/block')
	@AdminOnly()
	async block(@Param('telegramId') id: string) {
		return this.adminService.blockUser(id)
	}

	@Patch(':telegramId/unblock')
	@AdminOnly()
	async unblock(@Param('telegramId') id: string) {
		return this.adminService.unblockUser(id)
	}

	@Patch(':telegramId/activatePremium')
	@AdminOnly()
	async activatePremium(@Param('telegramId') id: string) {
		return this.adminService.activatePremium(id)
	}

	@Get('complaint/users')
	@AdminOnly()
	async allUsersWithComplaint() {
		return await this.adminService.allUsersWithComplaint()
	}
}
