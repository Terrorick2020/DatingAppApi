import type {
    InterestsVarsItemRes,
    PlansVarsItemRes,
    CityesVarsItemRes,
    RegionVarsItemRes,
    ComplaintsDescItem,
} from './helpers.type'

import { Controller, Get, Post, Body, Param } from '@nestjs/common'
import { HelpersService } from './helpers.service'
import { GetRegionsDto } from './dto/get-regions.dto'
import { GetDescComplaintsDto } from './dto/get-desc-complaints.dto'
import type { ApiResponse } from '@/common/interfaces/api-response.interface'

@Controller('helpers')
export class HelpersController {
    constructor(private readonly helpersService: HelpersService) {}

    @Get('interests')
    async getInterests(): Promise<ApiResponse<InterestsVarsItemRes[]>> {
        return await this.helpersService.getInterests()
    }

    @Get('interests/:value')
    async getInterestByMark(
        @Param('value') value: string
    ): Promise<ApiResponse<InterestsVarsItemRes  | 'None'>> {
        return await this.helpersService.getInterestByMark(value)
    }

    @Get('plans')
    async getPlans(): Promise<ApiResponse<PlansVarsItemRes[]>> {
        return await this.helpersService.getPlans()
    }

    @Get('plans/:value')
    async getPlanByMark(
        @Param('value') value: string
    ): Promise<ApiResponse<PlansVarsItemRes  | 'None'>>  {
        return await this.helpersService.getPlanByMark(value)
    }

    @Get('cityes')
    async getCityes(): Promise<ApiResponse<CityesVarsItemRes[]>> {
        return await this.helpersService.getCityes()
    }

    @Get('cityes/:value')
    async getCityById(
        @Param('value') value: string
    ): Promise<ApiResponse<CityesVarsItemRes | 'None'>> {
        return await this.helpersService.getCityByMark(value)
    }

    @Post('regions')
    async getRegions(
        @Body() getRegionDto: GetRegionsDto
    ): Promise<ApiResponse<RegionVarsItemRes[]>> {
        return this.helpersService.getRegions(getRegionDto)
    }

    @Get('regions/:value')
    async getRegionById(
        @Param('value') value: string
    ): Promise<ApiResponse<RegionVarsItemRes | 'None'>> {
        return this.helpersService.getRegionByMark(value)
    }

    @Get('glob-complaints')
    async getGlobComplaints(): Promise<ApiResponse<PlansVarsItemRes[]>> {
        return await this.helpersService.getGlobComplaints()
    }

    @Get('glob-complaints/:value')
    async getGlobComplaintsByMark(
        @Param('value') value: string
    ): Promise<ApiResponse<PlansVarsItemRes | 'None'>> {
        return await this.helpersService.getGlobComplaintsByMark(value)
    }

    @Post('desc-complaints')
    async getDescComplaints(
        @Body() getDescComplaintsDto: GetDescComplaintsDto
    ): Promise<ApiResponse<PlansVarsItemRes[]>> {
        return await this.helpersService.getDescComplaints(getDescComplaintsDto)
    }

    @Get('desc-complaints/:value')
    async getDescComplaintsByMark(
        @Param('value') value: string
    ): Promise<ApiResponse<ComplaintsDescItem | 'None'>> {
        return await this.helpersService.getDescComplaintsByMark(value)
    }
}
