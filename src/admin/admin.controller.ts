import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common'
import { FindAllQueryDto } from './dto/find-all.dto'
import { AdminService } from './admin.service'
import { CreateAdminDto } from './dto/create-admin.dto'
import { UpdateAdminDto } from './dto/update-admin.dto'
import type { ApiResponse } from '@/common/interfaces/api-response.interface'


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
