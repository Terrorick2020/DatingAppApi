import { Controller, Get, Param, Post } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { UserStatusService } from './user-status.service'

@ApiTags('Статус пользователей')
@Controller('user-status')
export class UserStatusController {
	constructor(private readonly userStatusService: UserStatusService) {}

	@ApiOperation({ summary: 'Установить пользователя как онлайн' })
	@ApiResponse({
		status: 200,
		description: 'Пользователь установлен как онлайн',
	})
	@Post(':telegramId/online')
	async setUserOnline(@Param('telegramId') telegramId: string) {
		await this.userStatusService.setUserOnline(telegramId)
		return { success: true, message: 'Пользователь установлен как онлайн' }
	}

	@ApiOperation({ summary: 'Установить пользователя как оффлайн' })
	@ApiResponse({
		status: 200,
		description: 'Пользователь установлен как оффлайн',
	})
	@Post(':telegramId/offline')
	async setUserOffline(@Param('telegramId') telegramId: string) {
		await this.userStatusService.setUserOffline(telegramId)
		return { success: true, message: 'Пользователь установлен как оффлайн' }
	}

	@ApiOperation({ summary: 'Обновить активность пользователя' })
	@ApiResponse({
		status: 200,
		description: 'Активность пользователя обновлена',
	})
	@Post(':telegramId/activity')
	async updateUserActivity(@Param('telegramId') telegramId: string) {
		await this.userStatusService.updateUserActivity(telegramId)
		return { success: true, message: 'Активность пользователя обновлена' }
	}

	@ApiOperation({ summary: 'Проверить статус пользователя' })
	@ApiResponse({ status: 200, description: 'Статус пользователя получен' })
	@Get(':telegramId/status')
	async getUserStatus(@Param('telegramId') telegramId: string) {
		const isOnline = await this.userStatusService.isUserOnline(telegramId)
		return {
			success: true,
			data: { isOnline },
			message: `Пользователь ${isOnline ? 'онлайн' : 'оффлайн'}`,
		}
	}

	@ApiOperation({ summary: 'Получить список онлайн пользователей' })
	@ApiResponse({
		status: 200,
		description: 'Список онлайн пользователей получен',
	})
	@Get('online')
	async getOnlineUsers() {
		const onlineUsers = await this.userStatusService.getOnlineUsers()
		return {
			success: true,
			data: { onlineUsers },
			message: `Найдено ${onlineUsers.length} онлайн пользователей`,
		}
	}
}
