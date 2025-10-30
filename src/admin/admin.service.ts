import { Injectable } from '@nestjs/common'
import { ComplaintStatus } from '@prisma/client'
import { PrismaService } from '~/prisma/prisma.service'
import { successResponse } from '../common/helpers/api.response.helper'
import { AppLogger } from '../common/logger/logger.service'
import { RedisPubSubService } from '../common/redis-pub-sub/redis-pub-sub.service'
import { RedisService } from '../redis/redis.service'
import { StorageService } from '../storage/storage.service'

@Injectable()
export class AdminService {
	private readonly CONTEXT = 'AdminService'

	constructor(
		private readonly prisma: PrismaService,
		private readonly logger: AppLogger,
		private readonly redisService: RedisService,
		private readonly storageService: StorageService,
		private readonly redisPubSubService: RedisPubSubService
	) {}

	async blockUser(telegramId: string) {
		await this.prisma.user.update({
			where: { telegramId },
			data: { status: 'Blocked' },
		})
		return successResponse(null, 'Пользователь заблокирован')
	}

	async unblockUser(telegramId: string) {
		await this.prisma.user.update({
			where: { telegramId },
			data: { status: 'Noob' },
		})
		return successResponse(null, 'Пользователь разблокирован')
	}

	async activatePremium(telegramId: string) {
		await this.prisma.user.update({
			where: { telegramId },
			data: { status: 'Pro' },
		})
		return successResponse(null, 'Премиум активирован')
	}

	async allUsersWithComplaint(): Promise<any> {
		const complaints = await this.prisma.complaint.findMany({
			where: { status: ComplaintStatus.UNDER_REVIEW },
			include: {
				toUser: {
					include: {
						photos: {
							take: 1,
							orderBy: { id: 'asc' },
						},
					},
				},
				reason: true,
			},
			orderBy: {
				createdAt: 'desc',
			},
		})

		const unique = new Map<string, any>()

		for (const complaint of complaints) {
			const userId = complaint.toUser.telegramId

			if (!unique.has(userId)) {
				const key = complaint.toUser.photos[0]?.key ?? ''

				const [globVal, targetVal] = complaint.reason.value.split(', ')

				const [globCmpl, targetCmpl] = await Promise.all([
					this.prisma.complaintGlobVars.findUnique({
						where: { value: globVal },
					}),
					this.prisma.complaintDescVars.findUnique({
						where: { value: targetVal },
					}),
				])

				unique.set(userId, {
					id: userId,
					avatar: key ? await this.storageService.getPresignedUrl(key) : '',
					name: complaint.toUser.name,
					complGlob: globCmpl?.label,
					complTarget: targetCmpl?.label,
					date: complaint.createdAt
						.toISOString()
						.split('T')[0]
						.split('-')
						.reverse()
						.join('.'),
				})
			}
		}

		const users = Array.from(unique.values())
		return successResponse(users, 'Жалобы на пользователей получены')
	}

	async deactivatePsychologist(telegramId: string) {
		await this.prisma.psychologist.update({
			where: { telegramId },
			data: { status: 'Inactive' },
		})
		return successResponse(null, 'Психолог деактивирован')
	}

	async activatePsychologist(telegramId: string) {
		await this.prisma.psychologist.update({
			where: { telegramId },
			data: { status: 'Active' },
		})
		return successResponse(null, 'Психолог активирован')
	}
}
