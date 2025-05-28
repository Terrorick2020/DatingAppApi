import type {
    InterestsVarsItemRes,
    PlansVarsItemRes,
    CityesVarsItemRes,
    RegionVarsItemRes,
} from './helpers.type'

import { Controller, Get, Post, Body, Param } from '@nestjs/common'
import { HelpersService } from './helpers.service'
import { GetRegionsDto } from './dto/get-regions.dto'
import type { ApiResponse } from '@/common/interfaces/api-response.interface'

@Controller('helpers')
export class HelpersController {
    constructor(private readonly helpersService: HelpersService) {}

    @Get('interests')
    async getInterests(): Promise<ApiResponse<InterestsVarsItemRes[]>> {
        return await this.helpersService.getInterests()
    }

    @Get('interests/:id')
    async getInterestByID(
        @Param('id') id: string
    ): Promise<ApiResponse<InterestsVarsItemRes  | 'None'>> {
        return await this.helpersService.getInterestByID(+id)
    }

    @Get('plans')
    async getPlans(): Promise<ApiResponse<PlansVarsItemRes[]>> {
        return await this.helpersService.getPlans()
    }

    @Get('plans/:id')
    async getPlanById(
        @Param('id') id: string
    ): Promise<ApiResponse<PlansVarsItemRes  | 'None'>>  {
        return await this.helpersService.getPlanById(+id)
    }

    @Get('cityes')
    async getCityes(): Promise<ApiResponse<CityesVarsItemRes[]>> {
        return await this.helpersService.getCityes()
    }

    @Get('cityes/:id')
    async getCityById(
        @Param('id') id: string
    ): Promise<ApiResponse<CityesVarsItemRes | 'None'>> {
        return await this.helpersService.getCityById(id)
    }

    @Post('regions')
    async getRegions(
        @Body() getRegionDto: GetRegionsDto
    ): Promise<ApiResponse<RegionVarsItemRes[]>> {
        return this.helpersService.getRegions(getRegionDto)
    }

    @Get('regions/:id')
    async getRegionById(
        @Param('id') id: string
    ): Promise<ApiResponse<RegionVarsItemRes | 'None'>> {
        return this.helpersService.getRegionById(+id)
    }
}
