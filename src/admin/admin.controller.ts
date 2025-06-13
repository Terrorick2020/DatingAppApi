import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common'
import { FindAllQueryDto } from './dto/find-all.dto'
import { AdminService } from './admin.service'
import { CreateAdminDto } from './dto/create-admin.dto'
import { UpdateAdminDto } from './dto/update-admin.dto'
import type { ApiResponse } from '@/common/interfaces/api-response.interface'

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Patch(':telegramId/block')
  block(@Param('telegramId') id: string) {
	return this.adminService.blockUser(id)
  }

  @Patch(':telegramId/unblock')
  unblock(@Param('telegramId') id: string) {
    return this.adminService.unblockUser(id)
  }

  @Patch(':telegramId/activatePremium')
  activatePremium(@Param('telegramId') id: string) {
    return this.adminService.activatePremium(id)
  }

}
