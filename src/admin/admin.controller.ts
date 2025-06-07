import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common'
import { FindAllQueryDto } from './dto/find-all.dto'
import { AdminService } from './admin.service'
import { CreateAdminDto } from './dto/create-admin.dto'
import { UpdateAdminDto } from './dto/update-admin.dto'
import type { ApiResponse } from '@/common/interfaces/api-response.interface'

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // @Get('find-all')
  // findAll(@Query() findAllQueryDto: FindAllQueryDto): Promise<ApiResponse<any | 'None'>> {
  //   return await this.adminService.findAll();
  // }

  @Post()
  create(@Body() createAdminDto: CreateAdminDto) {
    return this.adminService.create(createAdminDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.adminService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateAdminDto: UpdateAdminDto) {
    return this.adminService.update(+id, updateAdminDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.adminService.remove(+id);
  }
}
