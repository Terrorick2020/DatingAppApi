import { Controller, Post, Get, Param, Body } from '@nestjs/common'
import { PlansService } from './plans.service'
import { SetSelfDto } from './dto/set-self.dto'
import type { EveningPlans } from './plans.type'
import type { ApiResponse } from '@/common/interfaces/api-response.interface'


@Controller('plans')
export class PlansController {
    constructor(private readonly plansService: PlansService) {}

    @Get('get-self/:telegramId')
    async getPlans(
        @Param('telegramId') telegramId: string
    ): Promise<ApiResponse<EveningPlans | 'None'>> {
        console.log( telegramId )
        return await this.plansService.getPlans(telegramId)
    }

    @Post('set-self')
    async setPlans(
        @Body() setSelfDto: SetSelfDto
    ): Promise<ApiResponse<EveningPlans | 'None'>> {
        return await this.plansService.setPlans(setSelfDto)
    }
}
