import type {
    InterestsVarsItemRes,
    PlansVarsItemRes,
    CityesVarsItemRes,
    RegionVarsItemRes,
} from './helpers.type'

import { Injectable } from '@nestjs/common'
import { successResponse, errorResponse } from '@/common/helpers/api.response.helper'
import { GetRegionsDto } from './dto/get-regions.dto'
import { PrismaService } from '~/prisma/prisma.service'
import { AppLogger } from '@/common/logger/logger.service'
import type { ApiResponse } from '@/common/interfaces/api-response.interface'

@Injectable()
export class HelpersService {
    private readonly CONTEXT = 'HelpersService'

    constructor(
        private readonly prisma: PrismaService,
        private readonly logger: AppLogger,
    ) {}

    async getInterests(): Promise<ApiResponse<InterestsVarsItemRes[]>> {
        try {
            const interests = await this.prisma.interest.findMany()

            this.logger.log('Получен список интересов', this.CONTEXT)

            return successResponse(interests, 'Получен список интересов')
        } catch (error: any) {
            this.logger.error(
                'Ошибка при получении списка интересов',
                error?.stack,
                this.CONTEXT,
                { error }
            )

            return errorResponse(
				'Ошибка при получении списка интересов',
				error
			)
        }
    }

    async getInterestByID(id: number): Promise<ApiResponse<InterestsVarsItemRes | 'None'>> {
        try {
            const interest = await this.prisma.interest.findUnique({
                where: { id }
            })

            if(!interest) {
                this.logger.warn(`Интерес по id: ${id} не найден`, this.CONTEXT)

                return successResponse('None', `Интерес по id: ${id} не найден`)
            }

            this.logger.log(`Интерес по id: ${id} получен`, this.CONTEXT)

            return successResponse(interest, `Интерес по id: ${id} получен`)
        } catch (error: any) {
            this.logger.error(
                `Ошибка при получении интереса по id: ${id}`,
                error?.stack,
                this.CONTEXT,
                { error }
            )

            return errorResponse(
				`Ошибка при получении интереса по id: ${id}`,
				error
			)
        }
    }

    async getPlans(): Promise<ApiResponse<PlansVarsItemRes[]>> {
        try {
            const plans = await this.prisma.plans.findMany()

            this.logger.log('Получен список планов', this.CONTEXT)

            return successResponse(plans, 'Получен список планов')
        } catch (error: any) {
            this.logger.error(
                'Ошибка при получении списка планов',
                error?.stack,
                this.CONTEXT,
                { error }
            )

            return errorResponse(
				'Ошибка при получении списка планов',
				error
			)
        }
    }

    async getPlanById(id: number): Promise<ApiResponse<PlansVarsItemRes  | 'None'>> {
        try {
            const plan = await this.prisma.plans.findUnique({
                where: {id}
            })

            if(!plan) {
                this.logger.warn(`План по id: ${id} не найден`, this.CONTEXT)

                return successResponse('None', `План по id: ${id} не найден`)
            }

            this.logger.log(`План по id: ${id} получен`, this.CONTEXT)

            return successResponse(plan, `План по id: ${id} получен`)
        } catch (error: any) {
            this.logger.error(
                `Ошибка при получении плана по id: ${id}`,
                error?.stack,
                this.CONTEXT,
                { error }
            )

            return errorResponse(
				`Ошибка при получении плана по id: ${id}`,
				error
			)
        }
    }

    async getCityes(): Promise<ApiResponse<CityesVarsItemRes[]>> {
        try {
            const cityes = await this.prisma.cityes.findMany()

            this.logger.log('Получен список городов', this.CONTEXT)

            return successResponse(cityes, 'Получен список городов')
        } catch (error: any) {
            this.logger.error(
                'Ошибка при списка городов',
                error?.stack,
                this.CONTEXT,
                { error }
            )

            return errorResponse(
				'Ошибка при списка городов',
				error
			)
        }
    }

    async getCityById(id: string): Promise<ApiResponse<CityesVarsItemRes | 'None'>> {
        try {
            const city = await this.prisma.cityes.findUnique({
                where: {id}
            })

            if(!city) {
                this.logger.warn(`Город по id: ${id} не найден`, this.CONTEXT)

                return successResponse('None', `Город по id: ${id} не найден`)
            }

            this.logger.log(`Город по id: ${id} получен`, this.CONTEXT)

            return successResponse(city, `Город по id: ${id} получен`)
        } catch (error: any) {
            this.logger.error(
                `Ошибка при получении города по id: ${id}`,
                error?.stack,
                this.CONTEXT,
                { error }
            )

            return errorResponse(
				`Ошибка при получении города по id: ${id}`,
				error
			)
        }
    }

    async getRegions({ cityId }: GetRegionsDto): Promise<ApiResponse<RegionVarsItemRes[]>> {
        try {
            const regions = await this.prisma.regions.findMany({
                where: {cityId}
            })

            this.logger.log('Получен список районов', this.CONTEXT)

            return successResponse(regions, 'Получен список районов')
        } catch (error: any) {
            this.logger.error(
                'Ошибка при списка районов',
                error?.stack,
                this.CONTEXT,
                { error }
            )

            return errorResponse(
				'Ошибка при списка городов',
				error
			)
        }
    }

    async getRegionById(id: number): Promise<ApiResponse<RegionVarsItemRes | 'None'>> {
        try {
            const region = await this.prisma.regions.findUnique({
                where: { id }
            })

            if(!region) {
                this.logger.warn(`Район по id: ${id} не найден`, this.CONTEXT)

                return successResponse('None', `Район по id: ${id} не найден`)
            }

            this.logger.log(`Район по id: ${id} получен`, this.CONTEXT)

            return successResponse(region, `Район по id: ${id} получен`)
        } catch (error: any) {
            this.logger.error(
                `Ошибка при получении района по id: ${id}`,
                error?.stack,
                this.CONTEXT,
                { error }
            )

            return errorResponse(
				`Ошибка при получении района по id: ${id}`,
				error
			)
        }
    }
}
