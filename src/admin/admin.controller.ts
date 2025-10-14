import { Controller, Get, Param, Patch } from '@nestjs/common'
import { AdminService } from './admin.service'

// Guard - админ
@Controller('admin')
export class AdminController {
	constructor(private readonly adminService: AdminService) {}

	@Patch(':telegramId/block')
	async block(@Param('telegramId') id: string) {
		return this.adminService.blockUser(id)
	}

	@Patch(':telegramId/unblock')
	async unblock(@Param('telegramId') id: string) {
		return this.adminService.unblockUser(id)
	}

	@Patch(':telegramId/activatePremium')
	async activatePremium(@Param('telegramId') id: string) {
		return this.adminService.activatePremium(id)
	}

	@Get('complaint/users')
	async allUsersWithComplaint() {
		return await this.adminService.allUsersWithComplaint()
	}
}
