import { Injectable } from '@nestjs/common'
import { PrismaService } from '~/prisma/prisma.service'
import { SetSelfDto } from './dto/set-self.dto'
import { successResponse, errorResponse } from '@/common/helpers/api.response.helper'
import { AppLogger } from '@/common/logger/logger.service'
import { HelpersService } from '@/helpers/helpers.service'
import type { ApiResponse } from '@/common/interfaces/api-response.interface'
import type { EveningPlans } from './plans.type'


@Injectable()
export class PlansService {
    private readonly CONTEXT = 'PlansService'

    constructor (
        private readonly prisma: PrismaService,
        private readonly logger: AppLogger,
        private readonly helpersService: HelpersService,
    ) {}

    async getPlans(telegramId: string): Promise<ApiResponse<EveningPlans | 'None'>> {
        try {
            const plans = await this.prisma.userPlan.findUnique({
                where: { userId: telegramId }
            })

            console.log( plans )

            if(!plans) {
                this.logger.warn(
                    `При получении планов пользователь по id: ${telegramId} не найден`,
                    this.CONTEXT,
                )

                return successResponse('None', 'При получении планов пользователь не найден')
            }

            const [plan, region] = await Promise.all([
                this.helpersService.getPlanById(plans.planId),
                this.helpersService.getRegionById(plans.regionId),
            ])

            if(!(
                plan.data &&
                plan.data !== 'None' &&
                plan.success &&
                region.data &&
                region.data !== 'None' &&
                region.success
            )) {
                this.logger.warn(
                    `При получении планов пользователь по id: ${telegramId} не найден`,
                    this.CONTEXT,
                )

                return successResponse('None', 'При получении планов пользователь не найден')
            }

            const seconds = Date.now() - new Date(plans.updatedAt).getTime()
            const isCurrent = seconds < 24 * 60 * 60 * 1000

            const response: EveningPlans = {
                isCurrent,
                remains: isCurrent ? seconds : null,
                plan: {
                    value: plan.data.value,
                    description: plans.planDescription,
                },
                location: {
                    value: region.data.value,
                    description: plans.regionnDescription,
                }
            }

            this.logger.log(`Планы пользователя по id: ${telegramId} получены`, this.CONTEXT)

            return successResponse(response, 'Планы пользователя получены')
        } catch (error: any) {
            this.logger.error(
                `Ошибка при получении планов пользователем по id: ${telegramId}`,
                error?.stack,
                this.CONTEXT,
                { error }
            )

            return errorResponse(
				'Ошибка при получении планов пользователя',
				error
			)
        }
    }

    async setPlans(setSelfDto: SetSelfDto): Promise<ApiResponse<EveningPlans | 'None'>> {
        try {
            const dataUpsetBase = {
                planId: setSelfDto.planId,
                planDescription: setSelfDto.planDescription,
                regionId: setSelfDto.regionId,
                regionnDescription: setSelfDto.regionnDescription,
            }

            const plans = await this.prisma.userPlan.upsert({
                where: {userId: setSelfDto.telegramId},
                update: { ...dataUpsetBase },
                create: {
                    userId: setSelfDto.telegramId,
                    ...dataUpsetBase,
                },
            })

            const [plan, region] = await Promise.all([
                this.helpersService.getPlanById(plans.planId),
                this.helpersService.getRegionById(plans.regionId),
            ])

            if(!(
                plan.data &&
                plan.data !== 'None' &&
                plan.success &&
                region.data &&
                region.data !== 'None' &&
                region.success
            )) {
                this.logger.warn(
                    `При получении планов произошла ошибка`,
                    this.CONTEXT,
                )

                return successResponse('None', 'При получении планов планы не найдены')
            }

            const seconds = Date.now() - new Date(plans.updatedAt).getTime()
            const isCurrent = seconds < 24 * 60 * 60 * 1000

            const response: EveningPlans = {
                isCurrent,
                remains: isCurrent ? seconds : null,
                plan: {
                    value: plan.data.value,
                    description: plans.planDescription,
                },
                location: {
                    value: region.data.value,
                    description: plans.regionnDescription,
                }
            }

            this.logger.log(`Планы пользоватля по id: ${setSelfDto.telegramId} установлены`, this.CONTEXT)

            return successResponse(response, 'Планы пользователя установлены')
        } catch (error: any) {
            this.logger.error(
                `Ошибка при установке планов пользоватля по id: ${setSelfDto.telegramId}`,
                error?.stack,
                this.CONTEXT,
                { error }
            )

            return errorResponse(
				'Ошибка при установке планов пользоватля',
				error
			)
        }
    }
}
